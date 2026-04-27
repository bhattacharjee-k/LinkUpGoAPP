// Neighborhood-fit judge — Gemini 2.5 Flash.
//
// Inputs are the structured spatial features attached during preprocessing
// (NTA id, H3 cells, distance, transport score). The model's job is to weigh
// those signals against the user's neighborhood preferences (favorite NTAs,
// requested neighborhood, location mode).

import type { JudgeFn, JudgeVerdict } from './types';
import type { EnrichedCandidate } from '../envelope';
import { getGemini, MODELS } from './clients';
import { parseVerdictArray } from './parse';
import { favoriteNeighborhoodScore } from '../../geo/lookup';

const SYSTEM = `You are a neighborhood-fit rater for a NYC/Chicago social-event recommendation app.
You score how well each candidate fits the user's neighborhood preferences and accessibility.

DIMENSION: NEIGHBORHOOD FIT
- Does the candidate's NTA / community area match a favorite or requested area?
- Is the venue reachable given the group's transportation mode? (transport_score 0..1)
- For "explore_anywhere" intents, distance matters less than novel-NTA coverage.
- For "meet_in_the_middle", proximity to the midpoint matters.

SCALE (1-5):
1 = Wrong neighborhood AND poor reachability — they cannot or would not go.
2 = Either wrong neighborhood OR poor reachability — meaningful friction.
3 = Acceptable neighborhood, reachable, no special fit.
4 = In a favorite NTA OR strongly aligned with requested neighborhood + reachable.
5 = In a favorite NTA AND walking/short-transit distance + matches the spatial intent (near_me / midpoint / explore).

REFERENCE EXAMPLES:
- favorite_neighborhood_score=1.0 + transport_score=0.9 → 5
- favorite_neighborhood_score=0.0 + transport_score=0.9 + neutral NTA → 3
- favorite_neighborhood_score=0.0 + transport_score=0.1 (almost past walk threshold) → 2
- favorite_neighborhood_score=0.0 + transport_score=0.0 (past hard cutoff) → 1
- "explore_anywhere" mode + venue in a NEW NTA the user hasn't seen + reachable by car → 5

RULES:
- Output JSON. "reasoning" MUST come BEFORE "score".
- Don't double-count distance — the transport_score already encodes mode-aware reachability.
- If insufficient signal (no NTA, no distance), return score: null with confidence < 0.6.

Return ONLY a JSON array in input order:
[{"candidateId":"CANDIDATE_01","reasoning":"...","score":4,"confidence":0.8}]`;

function buildUserPrompt(candidates: EnrichedCandidate[], request: any, favoriteNtaIds: string[]): string {
  const intent = [
    `City: ${request.city}`,
    `Requested neighborhood: ${request.neighborhood || 'any'}`,
    `Location mode: ${request.locationMode || 'near_me'}`,
    `Favorite NTAs: ${favoriteNtaIds.join(', ') || 'none'}`,
    `Transportation modes (group): ${(request.transportationModes || []).join(', ') || 'unknown'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const cands = candidates
    .map((c) => {
      const favScore = favoriteNeighborhoodScore(c.ntaId, favoriteNtaIds);
      return [
        `${c.neutralizedId}:`,
        `  nta_id: ${c.ntaId || 'unknown'}`,
        `  h3_res9: ${c.h3Res9 || 'unknown'}`,
        `  distance_miles: ${c.distanceMiles?.toFixed(2) ?? 'unknown'}`,
        `  transport_score: ${c.transportScore.toFixed(2)} (1.0=easy, 0.0=past threshold)`,
        `  favorite_neighborhood_score: ${favScore.toFixed(2)}`,
      ].join('\n');
    })
    .join('\n\n');

  return `INTENT:\n${intent}\n\nCANDIDATES:\n${cands}`;
}

export const neighborhoodJudge: JudgeFn = async (candidates, ctx) => {
  if (candidates.length === 0) return [];
  const favs = ctx.favoriteNtaIds || [];
  const userPrompt = buildUserPrompt(candidates, ctx.request, favs);

  // Gemini Flash via OpenAI-compat occasionally returns very short responses
  // (~200 chars / one truncated entry) for reasons that aren't max_tokens.
  // Retry once if the response is implausibly short for the candidate count.
  const minExpectedLen = Math.max(400, candidates.length * 60);
  let text = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await getGemini().chat.completions.create({
      model: MODELS.geminiFlash,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 8000,
    });
    text = resp.choices[0]?.message?.content || '';
    if (text.length >= minExpectedLen) break;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[judge:neighborhood] short response (${text.length} chars, expected ≥${minExpectedLen}); retry ${attempt + 1}/2`);
    }
  }
  return mapVerdicts(text, candidates);
};

function mapVerdicts(text: string, candidates: EnrichedCandidate[]): JudgeVerdict[] {
  const parsed = parseVerdictArray(text, 'neighborhood');
  if (!parsed) {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[judge:neighborhood] PARSE_FAILED → ${candidates.length}/${candidates.length} abstain`);
    }
    return candidates.map((c) => ({
      candidateId: c.neutralizedId,
      score: null,
      confidence: null,
      reasoning: 'parse_failure_abstain',
    }));
  }
  const byId = new Map(parsed.map((v) => [v.candidateId, v]));
  const out = candidates.map((c) => byId.get(c.neutralizedId) || {
    candidateId: c.neutralizedId,
    score: null,
    confidence: null,
    reasoning: 'missing_in_response_abstain',
  });
  if (process.env.NODE_ENV === 'development') {
    const scored = out.filter((v) => v.score != null).length;
    const missing = out.filter((v) => v.reasoning === 'missing_in_response_abstain').length;
    const confidenceAbstain = out.filter((v) => v.score == null && v.reasoning !== 'missing_in_response_abstain').length;
    console.log(
      `[judge:neighborhood] ${candidates.length} candidates → ${scored} scored, ${missing} missing_in_response, ${confidenceAbstain} confidence_abstain`,
    );
  }
  return out;
}
