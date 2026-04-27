// Budget judge — Gemini Flash-Lite.
//
// Lowest-stakes dimension; mostly a deterministic price-tier match. We still
// route through an LLM so the panel structure is uniform, but the rubric is
// tight and the model has very little room for "taste."

import type { JudgeFn, JudgeVerdict } from './types';
import type { EnrichedCandidate } from '../envelope';
import { getGemini, MODELS } from './clients';
import { parseVerdictArray } from './parse';

const SYSTEM = `You are a budget-fit rater. Score whether the candidate's price tier fits the group's budget.

DIMENSION: BUDGET FIT
- Compare candidate price_tier (1=$, 4=$$$$) against the requested budget tier.
- Going one tier OVER is a meaningful friction. Two tiers over is a strong negative.
- Going one tier UNDER is fine — usually a positive signal (cheaper than budgeted).

SCALE (1-5):
1 = Two+ tiers over budget (e.g., $$$$ when $$ requested).
2 = One tier over budget.
3 = Exactly on budget OR no budget specified.
4 = One tier under budget — pleasant surprise.
5 = Multiple tiers under budget AND quality not compromised by the cheaper price.

EXAMPLES:
- requested $$ + candidate $$ → 3
- requested $$ + candidate $ → 4
- requested $$ + candidate $$$ → 2
- requested $$ + candidate $$$$ → 1
- no budget specified + candidate $$$ → 3

RULES:
- Output JSON. "reasoning" first, "score" after.
- If candidate price_tier is unknown AND budget is unknown, return score: null.
- If candidate price_tier is unknown but budget IS specified, lean conservative — score 2 with low confidence.

Return ONLY a JSON array in input order:
[{"candidateId":"CANDIDATE_01","reasoning":"...","score":3,"confidence":0.95}]`;

function tierFromBudgetString(b?: string): number | null {
  if (!b) return null;
  return ({ '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 } as Record<string, number>)[b] ?? null;
}

export const budgetJudge: JudgeFn = async (candidates, ctx) => {
  if (candidates.length === 0) return [];
  const requestedTier = tierFromBudgetString(ctx.request.budget);
  const intent = `Requested budget tier: ${requestedTier ?? 'unspecified'} (1=$, 4=$$$$)`;
  const cands = candidates
    .map((c) => `${c.neutralizedId}: price_tier=${c.priceTier ?? 'unknown'}`)
    .join('\n');
  const userPrompt = `INTENT:\n${intent}\n\nCANDIDATES:\n${cands}`;

  const resp = await getGemini().chat.completions.create({
    model: MODELS.geminiFlashLite,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.0,
    max_tokens: 4000,
  });
  const text = resp.choices[0]?.message?.content || '';
  const parsed = parseVerdictArray(text, 'budget');
  if (!parsed) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[judge:budget] PARSE_FAILED → ${candidates.length}/${candidates.length} abstain`);
    }
    return candidates.map((c) => ({ candidateId: c.neutralizedId, score: null, confidence: null, reasoning: 'parse_failure_abstain' }));
  }
  const byId = new Map(parsed.map((v) => [v.candidateId, v]));
  const out = candidates.map((c) => byId.get(c.neutralizedId) || {
    candidateId: c.neutralizedId, score: null, confidence: null, reasoning: 'missing_in_response_abstain',
  });
  if (process.env.NODE_ENV === 'development') {
    const scored = out.filter((v) => v.score != null).length;
    const missing = out.filter((v) => v.reasoning === 'missing_in_response_abstain').length;
    const confidenceAbstain = out.filter((v) => v.score == null && v.reasoning !== 'missing_in_response_abstain').length;
    console.log(
      `[judge:budget] ${candidates.length} candidates → ${scored} scored, ${missing} missing_in_response, ${confidenceAbstain} confidence_abstain`,
    );
  }
  return out;
};
