// Phase 1.6: Diversity post-pass.
//
// Per the rebuild brief §1.6:
//   1. MMR with λ = 0.7. Similarity blend:
//        0.5·cos(venue_emb) + 0.25·1[same category] + 0.15·1[same NTA] + 0.10·1[same price tier]
//      Embeddings come from text-embedding-3-small (HUMAN GATE — pgvector + ingest).
//      Until embeddings are wired, the cosine term defaults to 0 and MMR runs on
//      the structured-feature similarity alone — still a strong signal.
//   2. Steck-style category calibration via KL divergence on cold-start-aware history.
//   3. Hard quotas as a backstop: ≤4 same category, ≤2 same NTA, ≤3 same price tier.

import type { EnrichedCandidate, SuggestionEnvelope } from './envelope';

export interface DiversityOptions {
  /** MMR trade-off (1.0 = pure relevance, 0.0 = pure diversity). */
  lambda?: number;
  /** Hard quotas. */
  maxSameCategory?: number;
  maxSameNta?: number;
  maxSamePriceTier?: number;
  /** Final list size. */
  k?: number;
  /** User's recent attended-venue category distribution (for KL calibration). Empty = cold-start. */
  userCategoryHistogram?: Record<string, number>;
}

const DEFAULTS: Required<Pick<DiversityOptions, 'lambda' | 'maxSameCategory' | 'maxSameNta' | 'maxSamePriceTier' | 'k'>> = {
  lambda: 0.7,
  maxSameCategory: 4,
  maxSameNta: 2,
  maxSamePriceTier: 3,
  k: 10,
};

interface CandidateEmb {
  c: EnrichedCandidate;
  emb?: number[]; // optional unit-norm vector; absent until pgvector lands
  baseScore: number; // from PoLL aggregate (re-ranked by pairwise; 0..5)
}

function cosineSim(a?: number[], b?: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function structuredSim(a: EnrichedCandidate, b: EnrichedCandidate, ea?: number[], eb?: number[]): number {
  const cosTerm = cosineSim(ea, eb);
  const sameCat = a.category != null && a.category === b.category ? 1 : 0;
  const sameNta = a.ntaId != null && a.ntaId === b.ntaId ? 1 : 0;
  const samePrice = a.priceTier != null && a.priceTier === b.priceTier ? 1 : 0;
  return 0.5 * cosTerm + 0.25 * sameCat + 0.15 * sameNta + 0.1 * samePrice;
}

function quotasOk(
  candidate: EnrichedCandidate,
  selected: EnrichedCandidate[],
  caps: typeof DEFAULTS,
): boolean {
  let sameCat = 0;
  let sameNta = 0;
  let samePrice = 0;
  for (const s of selected) {
    if (candidate.category != null && s.category === candidate.category) sameCat++;
    if (candidate.ntaId != null && s.ntaId === candidate.ntaId) sameNta++;
    if (candidate.priceTier != null && s.priceTier === candidate.priceTier) samePrice++;
  }
  return sameCat < caps.maxSameCategory && sameNta < caps.maxSameNta && samePrice < caps.maxSamePriceTier;
}

/** KL(P || Q) over category distribution. Both should be normalized; missing keys assumed 0+ε. */
function klDivergence(p: Record<string, number>, q: Record<string, number>, eps = 1e-6): number {
  const keySet: Record<string, true> = {};
  Object.keys(p).forEach((k) => { keySet[k] = true; });
  Object.keys(q).forEach((k) => { keySet[k] = true; });
  let total = 0;
  for (const k of Object.keys(keySet)) {
    const pk = (p[k] || 0) + eps;
    const qk = (q[k] || 0) + eps;
    total += pk * Math.log(pk / qk);
  }
  return total;
}

function categoryHistogram(items: EnrichedCandidate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const c of items) {
    const k = c.category || 'unknown';
    counts[k] = (counts[k] || 0) + 1;
    total++;
  }
  if (total === 0) return {};
  for (const k of Object.keys(counts)) counts[k] /= total;
  return counts;
}

export interface DiversityResult {
  final: EnrichedCandidate[];
  /** KL between user history and final list — lower = better calibrated. NaN if cold-start. */
  klToHistory: number;
}

export function diversify(
  ranked: EnrichedCandidate[],
  scoresByCandId: Map<string, number | null>,
  options: DiversityOptions = {},
  embeddings?: Map<string, number[]>,
  env?: SuggestionEnvelope,
): DiversityResult {
  const opts: typeof DEFAULTS = { ...DEFAULTS, ...options };
  const t0 = Date.now();

  const items: CandidateEmb[] = ranked.map((c) => ({
    c,
    emb: embeddings?.get(c.id),
    // Aggregate is 0..5; missing → -1 (sinks to bottom).
    baseScore: scoresByCandId.get(c.id) ?? -1,
  }));

  // MMR loop
  const selected: EnrichedCandidate[] = [];
  const remaining = [...items];

  while (selected.length < opts.k && remaining.length > 0) {
    let bestIdx = -1;
    let bestMmr = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      if (!quotasOk(cand.c, selected, opts)) continue;
      const sim = selected.length === 0
        ? 0
        : Math.max(
            ...selected.map((s, j) => structuredSim(cand.c, s, cand.emb, embeddings?.get(s.id))),
          );
      const mmr = opts.lambda * cand.baseScore - (1 - opts.lambda) * sim;
      if (mmr > bestMmr) {
        bestMmr = mmr;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break; // every remaining item is quota-blocked
    selected.push(remaining[bestIdx].c);
    remaining.splice(bestIdx, 1);
  }

  // Steck-style KL calibration: if user history exists (≥5 entries; cold-start
  // skips this), nudge the final list toward the user's category distribution
  // by swapping low-relevance picks at the tail with quota-ok candidates from
  // the leftover pool.
  const history = options.userCategoryHistogram || {};
  const historySize = Object.values(history).reduce((s, v) => s + v, 0);
  let klToHistory = NaN;
  if (historySize >= 5 && selected.length > 0) {
    const finalHist = categoryHistogram(selected);
    klToHistory = klDivergence(finalHist, history);
    // Try a single sweep: for each leftover, see if swapping it in for the
    // weakest currently-selected (last in MMR order) lowers KL without breaking quotas.
    for (let attempt = 0; attempt < 3; attempt++) {
      let improved = false;
      for (const cand of remaining) {
        if (selected.length === 0) break;
        const tailIdx = selected.length - 1;
        const tail = selected[tailIdx];
        if (cand.c.category === tail.category) continue;
        const candidateSet = [...selected.slice(0, tailIdx), cand.c];
        if (!quotasOk(cand.c, candidateSet.slice(0, -1), opts)) continue;
        const newKl = klDivergence(categoryHistogram(candidateSet), history);
        if (newKl < klToHistory - 1e-3) {
          selected[tailIdx] = cand.c;
          klToHistory = newKl;
          improved = true;
          break;
        }
      }
      if (!improved) break;
    }
  }

  if (env) {
    env.final = selected;
    env.task = 'diversity';
    env.expectedOutputSchema = 'final';
    env.provenance.push({
      task: 'diversity',
      latencyMs: Date.now() - t0,
      note: `λ=${opts.lambda}; KL=${Number.isNaN(klToHistory) ? 'cold-start' : klToHistory.toFixed(3)}; final=${selected.length}`,
    });
  }
  return { final: selected, klToHistory };
}
