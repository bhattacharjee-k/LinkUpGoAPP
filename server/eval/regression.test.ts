// Vitest regression gate for the suggestion pipeline.
//
// Per the rebuild brief §0.4:
//   - Compute NDCG@10, Recall@20, ILD, Gini against Tier 1.
//   - Baselines come from the *current* production pipeline run on the golden set.
//   - Block PR merges on >5% NDCG regression OR >10% diversity regression.
//
// The baseline JSON lives at server/eval/golden/baseline.json and is regenerated
// via `npm run eval:set-baseline`. Until that file exists, the test passes with a
// warning — Phase 0 exit criteria require running it on real data first.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(__dirname, 'golden', 'baseline.json');
const LATEST_REPORT_DIR = path.join(__dirname, 'reports');

interface Baseline {
  pipeline: 'current' | string;
  metrics: {
    ndcg10: number;
    recall20: number;
    ild: number;
    gini: number;
    tailCoverage20: number;
  };
  timestamp: string;
}

interface Report {
  pipeline: string;
  metrics: Baseline['metrics'];
  latencyP50Ms?: number;
  latencyP95Ms?: number;
}

function findLatestReport(pipeline: string): Report | null {
  if (!fs.existsSync(LATEST_REPORT_DIR)) return null;
  const candidates = fs.readdirSync(LATEST_REPORT_DIR)
    .filter((f) => f.startsWith(`${pipeline}-`) && f.endsWith('.json'))
    .sort();
  if (candidates.length === 0) return null;
  const last = candidates[candidates.length - 1];
  return JSON.parse(fs.readFileSync(path.join(LATEST_REPORT_DIR, last), 'utf8')) as Report;
}

describe('suggestion pipeline regression gate', () => {
  it('has a baseline to compare against', () => {
    if (!fs.existsSync(BASELINE)) {
      console.warn(
        '[regression] No baseline at server/eval/golden/baseline.json. ' +
          'Run: npm run eval:replay -- --pipeline=current && npm run eval:set-baseline',
      );
      // Soft-pass until the baseline exists. Phase 0 exit criteria require this.
      return;
    }
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as Baseline;
    expect(baseline.metrics.ndcg10).toBeGreaterThanOrEqual(0);
  });

  it('latest pipeline run does not regress NDCG@10 by more than 5%', () => {
    if (!fs.existsSync(BASELINE)) return; // soft-pass per above
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as Baseline;
    const candidatePipeline = process.env.EVAL_CANDIDATE || 'v2';
    const latest = findLatestReport(candidatePipeline);
    if (!latest) {
      console.warn(`[regression] No recent report for '${candidatePipeline}'. Skipping comparison.`);
      return;
    }
    const delta = (latest.metrics.ndcg10 - baseline.metrics.ndcg10) / Math.max(0.001, baseline.metrics.ndcg10);
    expect(
      delta,
      `NDCG@10 regressed by ${(delta * 100).toFixed(2)}% (baseline=${baseline.metrics.ndcg10.toFixed(4)}, latest=${latest.metrics.ndcg10.toFixed(4)})`,
    ).toBeGreaterThan(-0.05);
  });

  it('latest pipeline run does not regress diversity (ILD) by more than 10%', () => {
    if (!fs.existsSync(BASELINE)) return;
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as Baseline;
    const candidatePipeline = process.env.EVAL_CANDIDATE || 'v2';
    const latest = findLatestReport(candidatePipeline);
    if (!latest) return;
    const delta = (latest.metrics.ild - baseline.metrics.ild) / Math.max(0.001, baseline.metrics.ild);
    expect(
      delta,
      `ILD regressed by ${(delta * 100).toFixed(2)}% (baseline=${baseline.metrics.ild.toFixed(4)}, latest=${latest.metrics.ild.toFixed(4)})`,
    ).toBeGreaterThan(-0.1);
  });

  it('latest pipeline run does not regress Recall@20 by more than 5%', () => {
    if (!fs.existsSync(BASELINE)) return;
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')) as Baseline;
    const candidatePipeline = process.env.EVAL_CANDIDATE || 'v2';
    const latest = findLatestReport(candidatePipeline);
    if (!latest) return;
    const delta = (latest.metrics.recall20 - baseline.metrics.recall20) / Math.max(0.001, baseline.metrics.recall20);
    expect(
      delta,
      `Recall@20 regressed by ${(delta * 100).toFixed(2)}% (baseline=${baseline.metrics.recall20.toFixed(4)}, latest=${latest.metrics.recall20.toFixed(4)})`,
    ).toBeGreaterThan(-0.05);
  });
});
