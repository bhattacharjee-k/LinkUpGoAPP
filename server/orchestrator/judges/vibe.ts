// Vibe judge — Claude Haiku 4.5.
//
// Scores how well each candidate matches the user's vibe + categories +
// energy + free-text vibeDescription. Most subjective dimension; uses Haiku for
// taste, with prompt caching on the static rubric block.

import type { JudgeFn, JudgeVerdict } from './types';
import type { EnrichedCandidate } from '../envelope';
import { getAnthropic, getGemini, MODELS } from './clients';
import { parseVerdictArray } from './parse';

const SYSTEM = `You are a strict, calibrated rater for a social-event recommendation app.
You score how well each venue matches the GROUP'S VIBE on a 1-5 scale.

DIMENSION: VIBE
- Does this candidate match the user's energy level, free-text vibe description, and categories?
- Are the tags/description consistent with the desired experience?
- A high-energy "Going out" / "Full send" intent should reward clubs, late-night cocktails, dance floors.
  A "Chill" / "Vibey" intent should reward listening bars, low-key cocktail rooms, neighborhood gems.

SCALE (1-5):
1 = Wrong vibe (e.g., a brunch spot for a clubbing intent).
2 = Tolerable but generic — would not delight.
3 = Reasonable fit but unremarkable.
4 = Strong fit on multiple vibe signals.
5 = Perfect match — reads like the kind of place this group would pick first.

REFERENCE EXAMPLES:
- High-energy (Going out, late night) + dance/club intent + candidate tagged "night_club" with "DJ" in description → 5
- Chill brunch intent + cozy café with quiet vibe in description → 5
- High-energy clubbing intent + steakhouse tagged "restaurant" with "steakhouse" → 1
- Chill cocktails intent + extremely loud sports bar with screens everywhere → 2
- "Hidden gems" discoveryStyle + venue with 2,400 reviews and tourist-y description → 3 (still solid but not a gem)

RULES:
- Output JSON. "reasoning" MUST come BEFORE "score". This is non-negotiable.
- The candidate's NAME has been stripped to a neutral id ("CANDIDATE_NN") to remove brand bias. Do not try to guess it.
- If you cannot justify a score with confidence ≥ 0.6, return score: null and explain.
- Do not let popularity_proxy dominate — that's the hidden_gem judge's concern, not yours.

Return ONLY a JSON array, one entry per candidate, in input order:
[{"candidateId":"CANDIDATE_01","reasoning":"...","score":4,"confidence":0.85}]`;

function buildUserPrompt(candidates: EnrichedCandidate[], request: any): string {
  const intent = [
    `City: ${request.city}`,
    `Categories: ${(request.categories || []).join(', ') || 'flexible'}`,
    `Energy: ${request.energy || 'flexible'}`,
    `Time: ${request.specificTime || request.timeWindow || 'flexible'}`,
    `Discovery style: ${request.discoveryStyle || 'mixed'}`,
    request.vibeDescription ? `Free-text vibe: "${request.vibeDescription}"` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const cands = candidates
    .map((c) => {
      const lines = [
        `${c.neutralizedId}:`,
        `  category: ${c.category || 'unknown'}`,
        `  price_tier: ${c.priceTier ?? 'unknown'}`,
        `  popularity_proxy: ${c.popularityProxy.toFixed(2)} (log of review count + 1; ignore for THIS judge)`,
        `  description: ${c.description || '(none)'}`,
        c.trending ? '  trending: yes' : null,
      ].filter(Boolean);
      return lines.join('\n');
    })
    .join('\n\n');

  return `INTENT:\n${intent}\n\nCANDIDATES:\n${cands}`;
}

export const vibeJudge: JudgeFn = async (candidates, ctx) => {
  if (candidates.length === 0) return [];
  const userPrompt = buildUserPrompt(candidates, ctx.request);
  const text = await callJudge(userPrompt);
  return mapVerdicts(text, candidates);
};

async function callJudge(userPrompt: string): Promise<string> {
  const anthropic = getAnthropic();
  if (anthropic) {
    const resp = await anthropic.messages.create({
      model: MODELS.haiku,
      max_tokens: 8000, // 23 candidates × ~280 tokens of structured JSON each. Was 2000 → truncated.
      system: [
        // Static prefix gets cached — Anthropic prompt caching, 5-min TTL,
        // 90% input discount on repeat hits. Per rebuild brief §1.4.
        { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.3,
    });
    const block = resp.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  }
  // Fallback: Gemini Flash (full system inlined as user prompt prefix).
  const resp = await getGemini().chat.completions.create({
    model: MODELS.geminiFlash,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 8000,
  });
  return resp.choices[0]?.message?.content || '';
}

function mapVerdicts(text: string, candidates: EnrichedCandidate[]): JudgeVerdict[] {
  const parsed = parseVerdictArray(text, 'vibe');
  if (!parsed) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[judge:vibe] PARSE_FAILED → ${candidates.length}/${candidates.length} abstain`);
    }
    return candidates.map((c) => ({
      candidateId: c.neutralizedId,
      score: null,
      confidence: null,
      reasoning: 'parse_failure_abstain',
    }));
  }
  // Re-key by neutralizedId, fill in missing as abstentions.
  const byId = new Map(parsed.map((v) => [v.candidateId, v]));
  const out = candidates.map((c) => {
    const v = byId.get(c.neutralizedId);
    if (v) return v;
    return { candidateId: c.neutralizedId, score: null, confidence: null, reasoning: 'missing_in_response_abstain' };
  });
  if (process.env.NODE_ENV === 'development') {
    const scored = out.filter((v) => v.score != null).length;
    const missing = out.filter((v) => v.reasoning === 'missing_in_response_abstain').length;
    const confidenceAbstain = out.filter((v) => v.score == null && v.reasoning !== 'missing_in_response_abstain').length;
    console.log(
      `[judge:vibe] ${candidates.length} candidates → ${scored} scored, ${missing} missing_in_response, ${confidenceAbstain} confidence_abstain`,
    );
  }
  return out;
}
