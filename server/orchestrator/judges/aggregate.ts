// Run the panel of 4 judges in parallel and aggregate.
//
// Per the rebuild brief §1.4:
//   - Promise.all all four judges; they never see each other's outputs.
//   - Initial weights: vibe 0.4, neighborhood 0.25, budget 0.15, hidden_gem 0.2
//     (HUMAN REQUIRED to confirm before production — these will be tuned via the eval gate).
//   - Abstention is allowed. If too many judges abstain (≥ 2 of 4 nulls), the
//     candidate's aggregate is null and the diversity layer treats it as "uncertain".

import { vibeJudge } from './vibe';
import { neighborhoodJudge } from './neighborhood';
import { budgetJudge } from './budget';
import { hiddenGemJudge } from './hidden_gem';
import type { EnrichedCandidate, PoLLScores, SuggestionEnvelope } from '../envelope';
import type { JudgeContext } from './types';
import { resolveFavoritesToNtaIds } from '../../geo/lookup';

// HUMAN REQUIRED to confirm. The brief calls these out as initial weights.
export const DEFAULT_WEIGHTS = {
  vibe: 0.4,
  neighborhood: 0.25,
  budget: 0.15,
  hidden_gem: 0.2,
};

export interface PanelOptions {
  weights?: typeof DEFAULT_WEIGHTS;
  /** Tweak how many abstentions are tolerated before the aggregate is null. */
  maxAbstentions?: number;
}

function aggregateOne(
  scores: { vibe: number | null; neighborhood: number | null; budget: number | null; hidden_gem: number | null },
  weights = DEFAULT_WEIGHTS,
): number | null {
  // Sum present scores weighted by their dimension weight; renormalize over present dimensions
  // so an abstention shifts emphasis to the others (rather than dragging the score to 0).
  let weightedSum = 0;
  let weightTotal = 0;
  for (const dim of ['vibe', 'neighborhood', 'budget', 'hidden_gem'] as const) {
    const s = scores[dim];
    if (s == null) continue;
    weightedSum += s * weights[dim];
    weightTotal += weights[dim];
  }
  if (weightTotal === 0) return null;
  return weightedSum / weightTotal;
}

export async function runPanel(
  candidates: EnrichedCandidate[],
  ctx: JudgeContext,
  env?: SuggestionEnvelope,
  options: PanelOptions = {},
): Promise<PoLLScores[]> {
  if (candidates.length === 0) return [];
  const t0 = Date.now();

  // Resolve favorite neighborhoods to NTA ids once, share across the spatial judge.
  const favoriteNtaIds =
    ctx.favoriteNtaIds ??
    (ctx.request.favoriteNeighborhoods
      ? resolveFavoritesToNtaIds(ctx.request.city, ctx.request.favoriteNeighborhoods)
      : []);
  const fullCtx: JudgeContext = { ...ctx, favoriteNtaIds };

  const [vibeRes, neighRes, budgetRes, gemRes] = await Promise.all([
    vibeJudge(candidates, fullCtx).catch((e) => {
      console.error('[panel] vibe failed:', e);
      return candidates.map((c) => ({ candidateId: c.neutralizedId, score: null, confidence: null, reasoning: `error:${e?.message || e}` }));
    }),
    neighborhoodJudge(candidates, fullCtx).catch((e) => {
      console.error('[panel] neighborhood failed:', e);
      return candidates.map((c) => ({ candidateId: c.neutralizedId, score: null, confidence: null, reasoning: `error:${e?.message || e}` }));
    }),
    budgetJudge(candidates, fullCtx).catch((e) => {
      console.error('[panel] budget failed:', e);
      return candidates.map((c) => ({ candidateId: c.neutralizedId, score: null, confidence: null, reasoning: `error:${e?.message || e}` }));
    }),
    hiddenGemJudge(candidates, fullCtx).catch((e) => {
      console.error('[panel] hidden_gem failed:', e);
      return candidates.map((c) => ({ candidateId: c.neutralizedId, score: null, confidence: null, reasoning: `error:${e?.message || e}` }));
    }),
  ]);

  const vibeMap = new Map(vibeRes.map((v) => [v.candidateId, v]));
  const neighMap = new Map(neighRes.map((v) => [v.candidateId, v]));
  const budgetMap = new Map(budgetRes.map((v) => [v.candidateId, v]));
  const gemMap = new Map(gemRes.map((v) => [v.candidateId, v]));

  // Default tolerates 2 abstentions of 4 — at least 2 of vibe/neighborhood/
  // budget/hidden_gem must produce a score for the aggregate to be valid. The
  // aggregator weighting renormalizes over present judges, so missing ones
  // shift emphasis to whoever did score. Was 1 → too strict given Gemini's
  // occasional short-response quirk; surfaced during the diagnostic pass.
  const maxAbstentions = options.maxAbstentions ?? 2;
  const out: PoLLScores[] = candidates.map((c) => {
    const id = c.neutralizedId;
    const v = vibeMap.get(id) || empty(id);
    const n = neighMap.get(id) || empty(id);
    const b = budgetMap.get(id) || empty(id);
    const g = gemMap.get(id) || empty(id);
    const abstentions = [v.score, n.score, b.score, g.score].filter((s) => s == null).length;
    const aggregate =
      abstentions > maxAbstentions
        ? null
        : aggregateOne({ vibe: v.score, neighborhood: n.score, budget: b.score, hidden_gem: g.score }, options.weights);
    return {
      candidateId: c.id,
      vibe: { score: v.score, confidence: v.confidence, reasoning: v.reasoning },
      neighborhood: { score: n.score, confidence: n.confidence, reasoning: n.reasoning },
      budget: { score: b.score, confidence: b.confidence, reasoning: b.reasoning },
      hiddenGem: { score: g.score, confidence: g.confidence, reasoning: g.reasoning },
      aggregate,
    };
  });

  if (env) {
    env.judgeScores = out;
    env.task = 'judging';
    env.expectedOutputSchema = 'pairwise';
    env.provenance.push({
      task: 'judging',
      latencyMs: Date.now() - t0,
      note: `panel of 4; ${out.filter((s) => s.aggregate != null).length}/${out.length} aggregated successfully`,
    });
  }
  return out;
}

function empty(id: string) {
  return { candidateId: id, score: null, confidence: null, reasoning: 'judge_did_not_run' };
}
