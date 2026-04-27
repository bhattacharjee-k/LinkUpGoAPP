// Lightweight TS implementation of NDCG@10, Recall@20, Intra-List Diversity,
// Gini coefficient, and tail-coverage@20.
//
// Per the rebuild brief: "Use evidently (Python) or a lightweight TS
// implementation — whichever the existing repo's test infra prefers."
// The repo is Vitest/TS, so this stays in-process and avoids a Python dep.

import type { GoldenExample, GoldenLabel, MetricsReport, PipelineRun, RankedItem } from './types';

function dcg(relevances: number[]): number {
  let total = 0;
  for (let i = 0; i < relevances.length; i++) {
    const rel = relevances[i];
    if (rel <= 0) continue;
    // Standard log2(rank+1) discount, rank 1-indexed.
    total += (Math.pow(2, rel) - 1) / Math.log2(i + 2);
  }
  return total;
}

export function ndcg(actual: RankedItem[], labels: GoldenLabel[], k: number): number {
  // Map suggestionId → max relevance observed.
  const relMap = new Map<string, number>();
  for (const l of labels) {
    const cur = relMap.get(l.suggestionId) ?? 0;
    if (l.relevance > cur) relMap.set(l.suggestionId, l.relevance);
  }
  const topK = actual.slice(0, k);
  const actualRels = topK.map((r) => relMap.get(r.suggestionId) ?? 0);
  const idealRels = Array.from(relMap.values())
    .filter((r) => r > 0)
    .sort((a, b) => b - a)
    .slice(0, k);
  const idealDcg = dcg(idealRels);
  if (idealDcg === 0) return 0; // no positives in this example
  return dcg(actualRels) / idealDcg;
}

export function recall(actual: RankedItem[], labels: GoldenLabel[], k: number): number {
  const positives = new Set(labels.filter((l) => l.relevance >= 2).map((l) => l.suggestionId));
  if (positives.size === 0) return 0;
  const topK = new Set(actual.slice(0, k).map((r) => r.suggestionId));
  let hits = 0;
  positives.forEach((p) => {
    if (topK.has(p)) hits++;
  });
  return hits / positives.size;
}

/**
 * Intra-list diversity: average pairwise dissimilarity within a single result list.
 * Dissimilarity is computed from a small set of structured features (category, NTA,
 * price tier). Embedding-based ILD is the gold standard but requires precomputed
 * vectors; this version is robust without them and improves once items are tagged.
 */
export function ild(items: RankedItem[]): number {
  if (items.length < 2) return 0;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      sum += pairDissimilarity(items[i], items[j]);
      pairs++;
    }
  }
  return pairs === 0 ? 0 : sum / pairs;
}

function pairDissimilarity(a: RankedItem, b: RankedItem): number {
  // Each feature contributes 1.0 if different, 0 if same, ignored if either side
  // is missing. Then averaged across the features that were comparable.
  const features: Array<[unknown, unknown]> = [
    [a.category, b.category],
    [a.ntaId, b.ntaId],
    [a.priceTier, b.priceTier],
  ];
  let total = 0;
  let comparable = 0;
  for (const [x, y] of features) {
    if (x == null || y == null) continue;
    comparable++;
    if (x !== y) total += 1;
  }
  return comparable === 0 ? 0 : total / comparable;
}

/**
 * Gini coefficient over recommendation frequency across the corpus.
 * 0 = every item recommended equally, 1 = one item dominates.
 * Lower is better — signals less popularity skew.
 */
export function gini(runs: PipelineRun[]): number {
  const counts = new Map<string, number>();
  for (const run of runs) {
    for (const r of run.results) {
      counts.set(r.suggestionId, (counts.get(r.suggestionId) || 0) + 1);
    }
  }
  if (counts.size === 0) return 0;
  const xs = Array.from(counts.values()).sort((a, b) => a - b);
  const n = xs.length;
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  if (mean === 0) return 0;
  let num = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      num += Math.abs(xs[i] - xs[j]);
    }
  }
  return num / (2 * n * n * mean);
}

export function tailCoverage(runs: PipelineRun[], k: number, totalCorpus?: number): number {
  // Distinct items appearing in any top-k across the run set, normalized by
  // total candidate corpus size (or the union of items observed if not provided).
  const seen = new Set<string>();
  const unionPool = new Set<string>();
  for (const run of runs) {
    for (const r of run.results) {
      unionPool.add(r.suggestionId);
      if (r.rank <= k) seen.add(r.suggestionId);
    }
  }
  const denom = totalCorpus && totalCorpus > 0 ? totalCorpus : unionPool.size;
  return denom === 0 ? 0 : seen.size / denom;
}

export function evaluate(runs: PipelineRun[], examples: GoldenExample[]): MetricsReport {
  const labelsBySession = new Map<string, GoldenLabel[]>();
  for (const ex of examples) {
    labelsBySession.set(`${ex.intent.sessionId}|${ex.intent.userId}`, ex.labels);
  }

  const perExample: MetricsReport['perExample'] = [];
  let ndcgSum = 0;
  let recallSum = 0;
  let ildSum = 0;
  let counted = 0;

  for (const run of runs) {
    const key = `${run.intent.sessionId}|${run.intent.userId}`;
    const labels = labelsBySession.get(key);
    if (!labels) continue;
    const n = ndcg(run.results, labels, 10);
    const r20 = recall(run.results, labels, 20);
    const ildVal = ild(run.results.slice(0, 10));
    ndcgSum += n;
    recallSum += r20;
    ildSum += ildVal;
    counted++;
    perExample.push({ sessionId: run.intent.sessionId, ndcg10: n, recall20: r20, ild: ildVal });
  }

  return {
    ndcg10: counted === 0 ? 0 : ndcgSum / counted,
    recall20: counted === 0 ? 0 : recallSum / counted,
    ild: counted === 0 ? 0 : ildSum / counted,
    gini: gini(runs),
    tailCoverage20: tailCoverage(runs, 20),
    perExample,
  };
}

/** Cohen's kappa for inter-rater agreement (used to calibrate the eval-judge). */
export function cohensKappa(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const cats = Array.from(new Set([...a, ...b])).sort();
  const idx = new Map(cats.map((c, i) => [c, i]));
  const n = a.length;
  const matrix: number[][] = Array.from({ length: cats.length }, () => Array(cats.length).fill(0));
  for (let i = 0; i < n; i++) {
    matrix[idx.get(a[i])!][idx.get(b[i])!]++;
  }
  const rowTotals = matrix.map((row) => row.reduce((s, v) => s + v, 0));
  const colTotals = cats.map((_, c) => matrix.reduce((s, row) => s + row[c], 0));
  const observed = matrix.reduce((s, row, i) => s + row[i], 0) / n;
  let expected = 0;
  for (let i = 0; i < cats.length; i++) {
    expected += (rowTotals[i] / n) * (colTotals[i] / n);
  }
  if (expected === 1) return 1;
  return (observed - expected) / (1 - expected);
}
