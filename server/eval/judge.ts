// Offline meta-eval LLM-judge.
//
// Per the rebuild brief §0.3:
//   - Different model family from production. Production judges = Claude Haiku 4.5,
//     so the eval-judge here uses GPT-4o-mini or Gemini 2.5 Flash. We default to
//     Gemini Flash via the existing `AI_INTEGRATIONS_OPENAI_*` env (cheaper, already
//     wired). Switch via EVAL_JUDGE_PROVIDER=openai if you want GPT-4o-mini.
//   - Same per-dimension rubric structure, with reference Tier 2 scores as anchors.
//   - Track agreement with Tier 2 gold via Cohen's kappa. Target κ > 0.6.
//
// IMPORTANT: This judge cannot be calibrated without Tier 2 labels (HUMAN gate).
// Until those exist, the calibration step short-circuits with a warning. The
// judge will still emit scores, but its reliability is unverified.

import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { GoldenExample } from './types';
import { cohensKappa } from './metrics';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TIER2_PATH = path.join(__dirname, 'golden', 'tier2.jsonl');

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (_client) return _client;
  const provider = process.env.EVAL_JUDGE_PROVIDER || 'gemini';
  if (provider === 'openai') {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } else {
    _client = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _client;
}

function modelName(): string {
  return process.env.EVAL_JUDGE_PROVIDER === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash';
}

export interface JudgeRubric {
  dimension: 'vibe' | 'neighborhood' | 'budget' | 'hidden_gem' | 'overall';
  description: string;
  scale: { min: number; max: number; anchors: Record<number, string> };
}

const OVERALL_RUBRIC: JudgeRubric = {
  dimension: 'overall',
  description:
    'How relevant is this suggestion to the user\'s intent overall, balancing vibe, neighborhood fit, budget, and novelty?',
  scale: {
    min: 0,
    max: 3,
    anchors: {
      0: 'Irrelevant or actively wrong (e.g., dinner spot for a late-night clubbing intent).',
      1: 'Weak fit — vaguely matches but misses key signals (vibe, neighborhood, or budget).',
      2: 'Strong fit — matches most signals; would plausibly be picked.',
      3: 'Perfect fit — matches intent precisely; reads like an obvious choice for this user.',
    },
  },
};

export interface JudgeInput {
  intent: GoldenExample['intent'];
  candidate: {
    /** Neutralized id — venue name has been stripped. Required to avoid name bias. */
    id: string;
    category?: string;
    priceTier?: number;
    distance?: string;
    description?: string;
    neighborhood?: string;
    reviewCount?: number;
  };
  /** Optional reference scores (Tier 2 anchors) included as in-context calibration. */
  anchors?: Array<{ candidate: JudgeInput['candidate']; goldScore: number }>;
}

export interface JudgeOutput {
  reasoning: string;
  score: number;
  /** Optional confidence; null = abstention, lift to caller to decide what to do. */
  confidence: number | null;
}

function buildPrompt(input: JudgeInput, rubric: JudgeRubric): string {
  const intent = input.intent;
  const cand = input.candidate;
  const anchorBlock = input.anchors && input.anchors.length > 0
    ? '\nREFERENCE EXAMPLES (use these to anchor your scores):\n' +
      input.anchors
        .map(
          (a, i) =>
            `${i + 1}. id=${a.candidate.id} category=${a.candidate.category || '?'} price=${a.candidate.priceTier ?? '?'} → score=${a.goldScore}`,
        )
        .join('\n')
    : '';

  return `You are a strict, calibrated rater for a social-event recommendation system.
Score one candidate against the user's intent on a single dimension.

DIMENSION: ${rubric.dimension}
${rubric.description}

SCALE (${rubric.scale.min}-${rubric.scale.max}):
${Object.entries(rubric.scale.anchors)
  .map(([s, desc]) => `${s} = ${desc}`)
  .join('\n')}

USER INTENT:
- City: ${intent.city}
- Categories: ${intent.categories.join(', ')}
- Budget: ${intent.budget || 'flexible'}
- Energy: ${intent.energy || 'flexible'}
- Time: ${intent.specificTime || intent.timeWindow || 'flexible'}
- Neighborhood: ${intent.neighborhood || 'any'}
- Discovery style: ${intent.discoveryStyle || 'mixed'}
- Crowd preference: ${intent.crowdPreference || 'no_preference'}
- Favorite neighborhoods: ${(intent.favoriteNeighborhoods || []).join(', ') || 'none'}
${intent.vibeDescription ? `- Free-text vibe: "${intent.vibeDescription}"` : ''}

CANDIDATE (name stripped to remove brand bias):
- id: ${cand.id}
- category: ${cand.category || 'unknown'}
- price tier: ${cand.priceTier ?? 'unknown'} (1=$, 4=$$$$)
- neighborhood: ${cand.neighborhood || 'unknown'}
- review count: ${cand.reviewCount ?? 'unknown'} (raw, not log-scaled)
- description: ${cand.description || '(none)'}
${anchorBlock}

Rules:
- Reason BEFORE scoring. Output JSON with "reasoning" first, then "score", then "confidence".
- If you cannot justify a number with confidence ≥ 0.6, return score = null and explain why.
- Do not let venue popularity (review count) dominate — use the rubric anchors.

Return ONLY valid JSON: {"reasoning": "...", "score": <int|null>, "confidence": <float|null>}`;
}

export async function scoreCandidate(input: JudgeInput, rubric = OVERALL_RUBRIC): Promise<JudgeOutput> {
  const prompt = buildPrompt(input, rubric);
  const resp = await getClient().chat.completions.create({
    model: modelName(),
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 350,
  });
  const text = resp.choices[0]?.message?.content?.trim() || '';
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
  try {
    const parsed = JSON.parse(cleaned);
    return {
      reasoning: String(parsed.reasoning || ''),
      score: typeof parsed.score === 'number' ? parsed.score : NaN,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : null,
    };
  } catch {
    return { reasoning: 'parse_failure', score: NaN, confidence: null };
  }
}

/**
 * Calibrate the judge against Tier 2 gold and emit the agreement coefficient.
 * Returns NaN with a warning if Tier 2 doesn't exist yet (HUMAN gate).
 */
export async function calibrateAgainstTier2(): Promise<number> {
  if (!fs.existsSync(TIER2_PATH)) {
    console.warn(`[judge] Tier 2 not found at ${TIER2_PATH}. Skipping calibration.`);
    console.warn('[judge] HUMAN REQUIRED: hand-label tier2.jsonl before this judge can be trusted (target κ > 0.6).');
    return NaN;
  }
  const lines = fs.readFileSync(TIER2_PATH, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  type Tier2Entry = { input: JudgeInput; goldScore: number };
  const entries: Tier2Entry[] = lines.map((l) => JSON.parse(l));
  if (entries.length === 0) return NaN;

  const judgeScores: number[] = [];
  const goldScores: number[] = [];
  for (const e of entries) {
    const out = await scoreCandidate(e.input);
    if (Number.isNaN(out.score) || out.score === null) continue;
    judgeScores.push(Math.round(out.score));
    goldScores.push(Math.round(e.goldScore));
  }
  const k = cohensKappa(judgeScores, goldScores);
  console.log(`[judge] κ = ${k.toFixed(3)} over ${judgeScores.length} Tier 2 examples`);
  if (k < 0.6) {
    console.warn('[judge] κ < 0.6 — judge is NOT trusted. Iterate the rubric or anchors.');
  }
  return k;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  calibrateAgainstTier2()
    .then((k) => process.exit(Number.isNaN(k) || k < 0.6 ? 2 : 0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
