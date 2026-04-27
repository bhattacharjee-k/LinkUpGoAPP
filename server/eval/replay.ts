// Replay a pipeline against the Tier 1 golden set and emit a metrics report.
//
// Usage:
//   npm run eval:replay -- --pipeline=current
//   npm run eval:replay -- --pipeline=v2
//
// Reads server/eval/golden/tier1.jsonl. Calls the chosen pipeline for each
// distinct intent. Writes a JSON report to server/eval/reports/<pipeline>-<ts>.json.

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { GoldenExample, PipelineRun, RankedItem } from './types';
import { evaluate } from './metrics';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_TIER1 = path.join(__dirname, 'golden', 'tier1.jsonl');
const REPORT_DIR = path.join(__dirname, 'reports');

export type PipelineFn = (intent: GoldenExample['intent']) => Promise<RankedItem[]>;

export interface ReplayOptions {
  pipeline: 'current' | 'v2' | string;
  limit?: number;
  /** Override path to the golden file (defaults to tier1.jsonl). */
  goldenPath?: string;
  /** Concurrent requests in flight. Default 4. */
  concurrency?: number;
}

function loadGolden(file: string): GoldenExample[] {
  if (!fs.existsSync(file)) {
    throw new Error(`Golden set not found: ${file}. Run 'npm run eval:build-golden' first.`);
  }
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  return lines.map((l) => JSON.parse(l) as GoldenExample);
}

async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function runReplay(opts: ReplayOptions, pipeline: PipelineFn): Promise<{
  report: ReturnType<typeof evaluate>;
  outputPath: string;
}> {
  const goldenPath = opts.goldenPath || GOLDEN_TIER1;
  const examples = loadGolden(goldenPath);
  const slice = opts.limit ? examples.slice(0, opts.limit) : examples;
  console.log(`[replay] Running '${opts.pipeline}' against ${slice.length} examples`);

  const runs: PipelineRun[] = [];
  await runWithLimit(slice, opts.concurrency ?? 4, async (ex, i) => {
    const t0 = Date.now();
    try {
      const results = await pipeline(ex.intent);
      runs.push({
        pipelineVersion: opts.pipeline,
        intent: ex.intent,
        results,
        latencyMs: Date.now() - t0,
      });
    } catch (err) {
      console.error(`[replay] Example ${i} failed:`, err);
      // Skip — failures are tracked separately, don't poison the metrics.
    }
  });

  const report = evaluate(runs, slice);

  if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(REPORT_DIR, `${opts.pipeline}-${stamp}.json`);
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        pipeline: opts.pipeline,
        examples: slice.length,
        runs: runs.length,
        latencyP50Ms: percentile(runs.map((r) => r.latencyMs), 0.5),
        latencyP95Ms: percentile(runs.map((r) => r.latencyMs), 0.95),
        metrics: {
          ndcg10: report.ndcg10,
          recall20: report.recall20,
          ild: report.ild,
          gini: report.gini,
          tailCoverage20: report.tailCoverage20,
        },
        perExampleSample: report.perExample.slice(0, 50),
      },
      null,
      2,
    ),
  );
  console.log(`[replay] Wrote ${outputPath}`);
  console.log('[replay] Aggregate:', {
    ndcg10: report.ndcg10.toFixed(4),
    recall20: report.recall20.toFixed(4),
    ild: report.ild.toFixed(4),
    gini: report.gini.toFixed(4),
    tailCoverage20: report.tailCoverage20.toFixed(4),
  });
  return { report, outputPath };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

// Pipeline adapters
//
// These wrap the existing v1 (`getOrchestratedSuggestions`) and the new v2 we'll
// build in Phase 1. Both share the same input shape (intent → ranked items).

import { getOrchestratedSuggestions } from '../suggestions';

export const currentPipeline: PipelineFn = async (intent) => {
  const result = await getOrchestratedSuggestions({
    city: intent.city,
    categories: intent.categories,
    budget: intent.budget,
    energy: intent.energy,
    timeWindow: intent.timeWindow,
    specificDate: intent.specificDate,
    specificTime: intent.specificTime,
    neighborhood: intent.neighborhood,
    vibeDescription: intent.vibeDescription,
    locationMode: intent.locationMode as any,
    discoveryStyle: intent.discoveryStyle as any,
    crowdPreference: intent.crowdPreference as any,
    favoriteNeighborhoods: intent.favoriteNeighborhoods,
  });
  // Map to RankedItem; suggestion id is unknown at this layer (the v1 path
  // doesn't echo a stable id), so we use the venue title as a proxy. Replay
  // metrics that need true id-level recall require the pipeline to persist
  // suggestions and surface their ids — see eval/README.md for the live-data
  // run procedure.
  return result.options.map((o, i) => ({
    suggestionId: o.placeId || o.title.toLowerCase(),
    rank: i + 1,
    category: o.tags?.[0],
    priceTier: priceTierFromBudget(o.priceLevel),
    reviewCount: o.ratingCount,
  }));
};

function priceTierFromBudget(b?: string): number | undefined {
  if (!b) return undefined;
  return ({ '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 } as Record<string, number>)[b];
}

// CLI entry point ------------------------------------------------------------

function parseArgs(argv: string[]): ReplayOptions {
  const opts: ReplayOptions = { pipeline: 'current' };
  for (const a of argv) {
    if (a.startsWith('--pipeline=')) opts.pipeline = a.split('=')[1] as any;
    else if (a.startsWith('--limit=')) opts.limit = parseInt(a.split('=')[1], 10);
    else if (a.startsWith('--concurrency=')) opts.concurrency = parseInt(a.split('=')[1], 10);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let pipeline: PipelineFn;
  if (opts.pipeline === 'current' || opts.pipeline === 'v1') {
    pipeline = currentPipeline;
  } else if (opts.pipeline === 'v2') {
    const mod = await import('../orchestrator/v2');
    pipeline = mod.v2Pipeline;
  } else {
    throw new Error(`Unknown pipeline: ${opts.pipeline}. Expected 'current' or 'v2'.`);
  }
  await runReplay(opts, pipeline);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
