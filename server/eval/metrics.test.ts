// Smoke test for the metrics module. Doesn't need a database — exercises the
// pure-TS scoring math against hand-built fixtures.

import { describe, it, expect } from 'vitest';
import { ndcg, recall, ild, gini, tailCoverage, cohensKappa } from './metrics';
import type { GoldenLabel, RankedItem, PipelineRun } from './types';

const labels: GoldenLabel[] = [
  { id: 'a', userId: 'u1', sessionId: 's1', suggestionId: 'A', relevance: 3, source: 'vote_up_attended', signalAt: '2026-01-01' },
  { id: 'b', userId: 'u1', sessionId: 's1', suggestionId: 'B', relevance: 2, source: 'feedback_high', signalAt: '2026-01-01' },
  { id: 'c', userId: 'u1', sessionId: 's1', suggestionId: 'C', relevance: 0, source: 'vote_down', signalAt: '2026-01-01' },
];

const perfectRanking: RankedItem[] = [
  { suggestionId: 'A', rank: 1, category: 'cocktails', ntaId: 'NTA1', priceTier: 2 },
  { suggestionId: 'B', rank: 2, category: 'wine_bar', ntaId: 'NTA2', priceTier: 3 },
  { suggestionId: 'X', rank: 3, category: 'cafe', ntaId: 'NTA3', priceTier: 1 },
];

const wrongOrderRanking: RankedItem[] = [
  { suggestionId: 'X', rank: 1, category: 'cafe', ntaId: 'NTA1', priceTier: 1 },
  { suggestionId: 'B', rank: 2, category: 'cafe', ntaId: 'NTA1', priceTier: 1 }, // identical features
  { suggestionId: 'A', rank: 3, category: 'cafe', ntaId: 'NTA1', priceTier: 1 },
];

describe('metrics', () => {
  it('NDCG@10 is 1.0 for perfect ordering', () => {
    expect(ndcg(perfectRanking, labels, 10)).toBeGreaterThan(0.99);
  });

  it('NDCG@10 is lower for inverted ordering', () => {
    expect(ndcg(wrongOrderRanking, labels, 10)).toBeLessThan(ndcg(perfectRanking, labels, 10));
  });

  it('Recall@20 finds positives', () => {
    expect(recall(perfectRanking, labels, 20)).toBe(1.0); // both A and B are top-20
  });

  it('Recall@20 misses if positives not in top K', () => {
    const onlyNegatives: RankedItem[] = [{ suggestionId: 'X', rank: 1 }];
    expect(recall(onlyNegatives, labels, 20)).toBe(0);
  });

  it('ILD reflects diversity', () => {
    const allSame = ild(wrongOrderRanking); // identical category/NTA/price
    const allDiff = ild(perfectRanking);
    expect(allDiff).toBeGreaterThan(allSame);
    expect(allSame).toBeCloseTo(0, 1);
  });

  it('Gini is 0 with perfect equality', () => {
    const runs: PipelineRun[] = [
      { pipelineVersion: 't', intent: { sessionId: 's', userId: 'u', city: 'NYC', categories: [] }, results: [{ suggestionId: 'A', rank: 1 }], latencyMs: 10 },
      { pipelineVersion: 't', intent: { sessionId: 's', userId: 'u', city: 'NYC', categories: [] }, results: [{ suggestionId: 'B', rank: 1 }], latencyMs: 10 },
    ];
    expect(gini(runs)).toBe(0);
  });

  it('Gini approaches 1 with extreme skew', () => {
    const runs: PipelineRun[] = [];
    for (let i = 0; i < 100; i++) {
      runs.push({
        pipelineVersion: 't',
        intent: { sessionId: `s${i}`, userId: `u${i}`, city: 'NYC', categories: [] },
        results: [{ suggestionId: 'POPULAR', rank: 1 }, { suggestionId: `unique_${i}`, rank: 2 }],
        latencyMs: 10,
      });
    }
    expect(gini(runs)).toBeGreaterThan(0.4);
  });

  it('tailCoverage is 1 when every item appears', () => {
    const runs: PipelineRun[] = [
      { pipelineVersion: 't', intent: { sessionId: 's', userId: 'u', city: 'NYC', categories: [] }, results: [{ suggestionId: 'A', rank: 1 }, { suggestionId: 'B', rank: 2 }], latencyMs: 10 },
    ];
    expect(tailCoverage(runs, 20)).toBe(1);
  });

  it("Cohen's kappa is 1.0 for perfect agreement", () => {
    expect(cohensKappa([1, 2, 3, 1], [1, 2, 3, 1])).toBeCloseTo(1.0);
  });

  it("Cohen's kappa is ≤0 for inverse agreement", () => {
    expect(cohensKappa([1, 2, 3], [3, 2, 1])).toBeLessThanOrEqual(0);
  });
});
