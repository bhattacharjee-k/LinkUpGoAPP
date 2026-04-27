// Hidden-gem judge — Claude Haiku 4.5 with explicit anti-popularity rubric.
//
// Per the rebuild brief §1.4: this judge exists specifically to counterbalance
// the well-trodden-place bias in the legacy pipeline. It scores HIGH for venues
// unlikely to already be on a typical NYC tourist's radar — the popularity_proxy
// signal flips: lower review count + recent / non-mainstream description = higher score.

import type { JudgeFn, JudgeVerdict } from './types';
import type { EnrichedCandidate } from '../envelope';
import { getAnthropic, getGemini, MODELS } from './clients';
import { parseVerdictArray } from './parse';

const SYSTEM = `You are the "hidden gem" rater for a social-event recommendation app.
Your job is to counterbalance popularity bias. You score HIGH for venues that an in-the-know friend would recommend, NOT venues that already top every "best of" list.

DIMENSION: HIDDEN-GEM SCORE
- Higher popularity_proxy ≈ already-discovered place. Be skeptical.
- Lower popularity_proxy + interesting description + non-tourist neighborhood ≈ gem. Reward.
- A "trending" tag means Perplexity / grounded search surfaced it specifically — small bonus, but verify the description before trusting.

DISCOVERY-STYLE INTERACTION:
- If user's discoveryStyle = "popular": this judge contributes LITTLE — prefer 3 (neutral) for most.
- If user's discoveryStyle = "hidden_gems": this is the most important dimension. Use the full 1-5 range.
- If user's discoveryStyle = "mixed": balance — top scores for genuine gems, mid for proven favorites.

SCALE (1-5):
1 = Tourist trap / chain / review count saturated AND the description offers nothing distinctive.
2 = Well-known to NYC/Chicago locals — solid pick but not a discovery.
3 = Some buzz but a real fit; not a gem but not generic.
4 = Off-the-beaten-path, modest review count, distinctive description.
5 = Genuine hidden gem — small, distinctive, locals' choice; the kind of place a friend texts you about.

REFERENCE EXAMPLES:
- popularity_proxy 8.5 (~5000 reviews) + chain-y description + Times Square → 1
- popularity_proxy 4.0 (~50 reviews) + "natural wine bar in a former garage, Bushwick" → 5
- popularity_proxy 6.0 (~400 reviews) + interesting description + non-tourist NTA → 4
- popularity_proxy 7.5 (~1800 reviews) + venerable institution + appears on best-of lists → 2
- "trending" tag + popularity_proxy 3.0 + new opening described as "tasting menu in Greenpoint backyard" → 5

RULES:
- Output JSON. "reasoning" before "score".
- The candidate name has been stripped — judge from category + description + popularity_proxy + neighborhood, not from "is this a famous name".
- If you can't justify a score with confidence ≥ 0.6, return score: null.

Return ONLY a JSON array in input order:
[{"candidateId":"CANDIDATE_01","reasoning":"...","score":4,"confidence":0.85}]`;

function buildUserPrompt(candidates: EnrichedCandidate[], request: any): string {
  const intent = [
    `City: ${request.city}`,
    `Discovery style: ${request.discoveryStyle || 'mixed'}`,
    `Categories: ${(request.categories || []).join(', ') || 'flexible'}`,
  ].join('\n');

  const cands = candidates
    .map((c) =>
      [
        `${c.neutralizedId}:`,
        `  category: ${c.category || 'unknown'}`,
        `  popularity_proxy: ${c.popularityProxy.toFixed(2)} (= ln(reviewCount + 1); higher = better-known)`,
        `  nta_id: ${c.ntaId || 'unknown'}`,
        `  trending: ${c.trending ? 'yes' : 'no'}`,
        `  description: ${c.description || '(none)'}`,
      ].join('\n'),
    )
    .join('\n\n');

  return `INTENT:\n${intent}\n\nCANDIDATES:\n${cands}`;
}

export const hiddenGemJudge: JudgeFn = async (candidates, ctx) => {
  if (candidates.length === 0) return [];
  const userPrompt = buildUserPrompt(candidates, ctx.request);
  const text = await callJudge(userPrompt);
  const parsed = parseVerdictArray(text, 'hidden_gem');
  if (!parsed) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[judge:hidden_gem] PARSE_FAILED → ${candidates.length}/${candidates.length} abstain`);
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
      `[judge:hidden_gem] ${candidates.length} candidates → ${scored} scored, ${missing} missing_in_response, ${confidenceAbstain} confidence_abstain`,
    );
  }
  return out;
};

async function callJudge(userPrompt: string): Promise<string> {
  const anthropic = getAnthropic();
  if (anthropic) {
    const resp = await anthropic.messages.create({
      model: MODELS.haiku,
      max_tokens: 8000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.4,
    });
    const block = resp.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  }
  const resp = await getGemini().chat.completions.create({
    model: MODELS.geminiFlash,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 8000,
  });
  return resp.choices[0]?.message?.content || '';
}
