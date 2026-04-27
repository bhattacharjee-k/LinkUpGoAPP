// Compare v1 vs v2 from shadow-mode JSONL logs.
//
// Usage: npm run eval:shadow-compare
// Reads server/eval/shadow_logs/*.jsonl, prints a comparison report:
//   - Latency P50/P95 for each pipeline
//   - Result-set Jaccard overlap (how often v1 and v2 agree on top-5)
//   - Top disagreements (where v2 ranks differ most from v1)
//   - Error rates per pipeline

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(__dirname, '..', 'eval', 'shadow_logs');

interface ShadowEntry {
  ts: string;
  requestId: string;
  intent: { city: string; categories: string[] };
  v1: { latencyMs: number; resultIds: string[]; error?: string };
  v2: { latencyMs: number; resultIds: string[]; error?: string };
}

function loadAll(): ShadowEntry[] {
  if (!fs.existsSync(LOG_DIR)) return [];
  const files = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.jsonl'));
  const out: ShadowEntry[] = [];
  for (const f of files) {
    const lines = fs
      .readFileSync(path.join(LOG_DIR, f), 'utf8')
      .split('\n')
      .filter((l) => l.trim().length > 0);
    for (const l of lines) {
      try {
        out.push(JSON.parse(l));
      } catch {
        // skip malformed
      }
    }
  }
  return out;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  sa.forEach((x) => { if (sb.has(x)) inter++; });
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function main() {
  const entries = loadAll();
  if (entries.length === 0) {
    console.log('[shadow-compare] No shadow log entries found.');
    console.log(`[shadow-compare] Run with SUGGESTIONS_PIPELINE=shadow first; logs are written to ${LOG_DIR}`);
    return;
  }

  console.log(`[shadow-compare] Loaded ${entries.length} shadow runs from ${LOG_DIR}`);

  const v1Latencies = entries.filter((e) => !e.v1.error).map((e) => e.v1.latencyMs);
  const v2Latencies = entries.filter((e) => !e.v2.error).map((e) => e.v2.latencyMs);
  const v1Errors = entries.filter((e) => e.v1.error).length;
  const v2Errors = entries.filter((e) => e.v2.error).length;

  const both = entries.filter((e) => !e.v1.error && !e.v2.error);
  const jaccards = both.map((e) => jaccard(e.v1.resultIds.slice(0, 5), e.v2.resultIds.slice(0, 5)));
  const meanJaccard = jaccards.length === 0 ? 0 : jaccards.reduce((s, v) => s + v, 0) / jaccards.length;

  console.log('\n=== Latency ===');
  console.log(`v1: P50=${percentile(v1Latencies, 0.5)}ms  P95=${percentile(v1Latencies, 0.95)}ms`);
  console.log(`v2: P50=${percentile(v2Latencies, 0.5)}ms  P95=${percentile(v2Latencies, 0.95)}ms`);

  console.log('\n=== Errors ===');
  console.log(`v1: ${v1Errors}/${entries.length} (${((v1Errors / entries.length) * 100).toFixed(1)}%)`);
  console.log(`v2: ${v2Errors}/${entries.length} (${((v2Errors / entries.length) * 100).toFixed(1)}%)`);

  console.log('\n=== Top-5 result-set overlap (Jaccard) ===');
  console.log(`Mean: ${meanJaccard.toFixed(3)}`);
  console.log(`P50:  ${percentile(jaccards, 0.5).toFixed(3)}`);
  console.log(`P95:  ${percentile(jaccards, 0.95).toFixed(3)}`);
  console.log(`Min:  ${Math.min(...jaccards).toFixed(3)}`);

  console.log('\n=== Top 5 disagreements (lowest Jaccard) ===');
  const disagreements = both
    .map((e, i) => ({ entry: e, j: jaccards[i] }))
    .sort((a, b) => a.j - b.j)
    .slice(0, 5);
  for (const d of disagreements) {
    console.log(
      `  city=${d.entry.intent.city} cats=[${d.entry.intent.categories.join(',')}] j=${d.j.toFixed(2)}`,
    );
    console.log(`    v1: ${d.entry.v1.resultIds.slice(0, 5).join(', ')}`);
    console.log(`    v2: ${d.entry.v2.resultIds.slice(0, 5).join(', ')}`);
  }

  console.log('\n[shadow-compare] HUMAN: spot-check the disagreements weekly per the rebuild brief §2.2.');
}

main();
