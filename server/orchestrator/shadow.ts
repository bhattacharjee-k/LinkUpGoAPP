// Phase 2.1: Shadow-mode dual-run.
//
// Per the rebuild brief §2.1, when SUGGESTIONS_PIPELINE=shadow:
//   - Run the legacy pipeline AND the v2 pipeline for every request.
//   - Serve the legacy result to the user (status quo).
//   - Log both result sets, latencies, and (when available) costs to a debug
//     log so we can compare offline.
//
// We use a JSONL file at server/eval/shadow_logs/ rather than a `suggestion_runs`
// DB table to avoid a schema change while shadow ramps. Once the comparison is
// good enough to trust v2, the brief's full ramp moves us to a real table —
// that's a HUMAN-gated schema change handled later.

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { devLog } from '../logger';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import type { SuggestRequest, SuggestResult, GroupPreferenceSummary, DownvoteReasonAggregates } from '../suggestions';
import type { ReferenceVenue } from '@shared/schema';

const LOG_DIR = path.join(__dirname, '..', 'eval', 'shadow_logs');

interface ShadowLogEntry {
  ts: string;
  requestId: string;
  intent: SuggestRequest;
  v1: { latencyMs: number; resultIds: string[]; error?: string };
  v2: { latencyMs: number; resultIds: string[]; error?: string };
}

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function logFor(now: Date): string {
  // One file per UTC day so they stay manageable.
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return path.join(LOG_DIR, `shadow-${yyyy}-${mm}-${dd}.jsonl`);
}

export async function runShadow(
  req: SuggestRequest,
  downvoteReasons?: DownvoteReasonAggregates,
  referenceVenues?: ReferenceVenue[],
  groupPrefs?: GroupPreferenceSummary,
  feedbackHistory?: Array<{ venueName: string; rating: number; tags?: string[] | null; review?: string | null }>,
): Promise<SuggestResult> {
  // Run both pipelines in parallel. The user sees v1; v2 is fire-and-log.
  // We need to import the legacy pipeline directly to bypass the SUGGESTIONS_PIPELINE flag check.
  const t0 = Date.now();
  const requestId = `shadow_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const v1Promise = (async () => {
    const t = Date.now();
    try {
      // Direct call to the legacy implementation, bypassing the feature-flag delegation.
      const { runV1Direct } = await import('./shadow_helpers');
      const result = await runV1Direct(req, downvoteReasons, referenceVenues, groupPrefs, feedbackHistory);
      return { result, latencyMs: Date.now() - t, error: undefined as string | undefined };
    } catch (err) {
      return {
        result: null,
        latencyMs: Date.now() - t,
        error: (err as Error)?.message || String(err),
      };
    }
  })();

  const v2Promise = (async () => {
    const t = Date.now();
    try {
      const { getOrchestratedSuggestionsV2 } = await import('./v2');
      const result = await getOrchestratedSuggestionsV2(
        req,
        downvoteReasons,
        referenceVenues,
        groupPrefs,
        feedbackHistory,
      );
      return { result, latencyMs: Date.now() - t, error: undefined as string | undefined };
    } catch (err) {
      return {
        result: null,
        latencyMs: Date.now() - t,
        error: (err as Error)?.message || String(err),
      };
    }
  })();

  const [v1, v2] = await Promise.all([v1Promise, v2Promise]);

  // Fire-and-forget log write. Don't block the response.
  void writeShadowEntry(requestId, req, v1, v2).catch((e) => devLog('warn', '[shadow] log write failed', { error: (e as Error).message }));

  // The user gets v1. If v1 errored, fall back to v2 even in shadow mode (not ideal,
  // but better than serving an error).
  if (v1.result) return v1.result;
  if (v2.result) {
    devLog('warn', '[shadow] v1 failed; serving v2 instead', { error: v1.error });
    return v2.result;
  }
  throw new Error(`Both pipelines failed: v1=${v1.error}, v2=${v2.error}`);
}

async function writeShadowEntry(
  requestId: string,
  intent: SuggestRequest,
  v1: { result: SuggestResult | null; latencyMs: number; error?: string },
  v2: { result: SuggestResult | null; latencyMs: number; error?: string },
): Promise<void> {
  ensureDir();
  const entry: ShadowLogEntry = {
    ts: new Date().toISOString(),
    requestId,
    intent,
    v1: {
      latencyMs: v1.latencyMs,
      resultIds: (v1.result?.options || []).map((o) => o.placeId || o.title),
      error: v1.error,
    },
    v2: {
      latencyMs: v2.latencyMs,
      resultIds: (v2.result?.options || []).map((o) => o.placeId || o.title),
      error: v2.error,
    },
  };
  await fs.promises.appendFile(logFor(new Date()), JSON.stringify(entry) + '\n');
}
