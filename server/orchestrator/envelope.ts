// Canonical inter-stage envelope passed between every phase of the v2 pipeline.
//
// Per the rebuild brief §1.7, every stage takes an envelope in and returns one
// out. This keeps tracing, replay, and cost accounting in one place rather than
// scattered across ad-hoc kwargs.
//
// Mental model:
//   Phase 0 (request)        → SuggestionEnvelope { task: 'sourcing' }
//   Phase 1+2 (sourcing)     → fills `candidates`
//   Phase 1.3 (preprocess)   → annotates each candidate with neutralizedId, popProxy, etc.
//   Phase 1.4 (PoLL judges)  → fills `judgeScores` per candidate
//   Phase 1.5 (pairwise)     → reorders top-10 in `pairwiseOrder`
//   Phase 1.6 (diversity)    → emits `final` (the user-visible ranked list)

import type { SuggestionOption, SuggestRequest } from '../suggestions';
import type { VenueFeatures } from '../venue-features';

export type Task = 'sourcing' | 'preprocess' | 'judging' | 'pairwise' | 'diversity' | 'final';

export interface SuggestionEnvelope {
  /** Stable id for this request — used in logs, traces, and the suggestion_runs debug table. */
  requestId: string;
  /** Stage-of-pipeline marker. */
  task: Task;
  /** The user-facing intent that started this whole thing. */
  objective: SuggestRequest;
  /** Hard constraints (excludeTypes, mustBeOpenAt, etc.) — derived from the brief. */
  constraints: {
    excludeTypes: string[];
    mustBeOpenAt: string | null;
    maxBudgetLevel: number;
    maxDistanceMiles: number;
  };
  /** Refs to upstream context — e.g., the OrchestratorBrief from Phase 1+2, group prefs. */
  contextRefs: {
    briefId?: string;
    groupPrefsId?: string;
    userId?: string;
  };
  /** Soft budget caps for this request — exceed at your own risk. */
  budget: {
    /** Maximum total LLM tokens we'll spend across all phases. */
    maxTokens: number;
    /** Maximum wall-clock latency in ms before degrading to a faster path. */
    maxLatencyMs: number;
  };
  /** What the next stage should produce. */
  expectedOutputSchema: 'candidates' | 'judged' | 'pairwise' | 'diversified' | 'final';
  /** Provenance trail — appended at every stage. */
  provenance: ProvenanceEntry[];
  /** Per-stage confidence (filled by judges). */
  confidence?: number;
  /** Distributed-trace id — propagate to logs. */
  traceId: string;

  // Mutable working state
  candidates?: EnrichedCandidate[];
  judgeScores?: PoLLScores[];
  pairwiseOrder?: string[]; // candidate ids in re-ranked order
  /** The user-visible final list, ≤10 items. */
  final?: EnrichedCandidate[];
}

export interface ProvenanceEntry {
  task: Task;
  /** Wall-clock duration of this stage in ms. */
  latencyMs: number;
  /** Tokens spent at this stage (across all parallel calls). */
  tokensIn?: number;
  tokensOut?: number;
  /** Error message if the stage degraded. */
  degraded?: string;
  /** Free-form notes (e.g., "Phase 1+2 grounded by Gemini"). */
  note?: string;
}

/**
 * A candidate venue with all the structured features Phase 1.3 attaches.
 * Judges only ever see the *neutralized* representation (no name, no brand cues).
 */
export interface EnrichedCandidate {
  /** Stable id for this candidate within this request. */
  id: string;
  /** Anonymized handle the judges see ("CANDIDATE_07"). */
  neutralizedId: string;
  /** The full SuggestionOption — kept for re-attribution after judging. */
  raw: SuggestionOption;

  // Structured features the judges DO see
  category: string | null;
  priceTier: number | null;
  popularityProxy: number; // log(reviewCount + 1)
  distanceMiles: number | null;
  /** Soft transport-mode penalty: 0..1, 1 = free, 0 = past the threshold. */
  transportScore: number;
  description: string; // length-normalized
  ntaId: string | null;
  mapboxNeighId: string | null;
  h3Res9: string | null;
  h3Res7: string | null;
  /** True if Perplexity / grounded-Gemini surfaced this venue (not a Places primary hit). */
  trending: boolean;
  /** Internal structured venue features for v2 scoring. Never returned to clients. */
  venueFeatures?: VenueFeatures;
  /** Internal Night Intensity Index for v2 scoring. Never returned to clients. */
  venueNii?: number;
}

export interface PoLLScores {
  candidateId: string;
  vibe: { score: number | null; confidence: number | null; reasoning: string };
  neighborhood: { score: number | null; confidence: number | null; reasoning: string };
  budget: { score: number | null; confidence: number | null; reasoning: string };
  hiddenGem: { score: number | null; confidence: number | null; reasoning: string };
  /** Aggregated final score (per `aggregator.ts` weights). May be null if too many judges abstained. */
  aggregate: number | null;
}

export function newEnvelope(
  request: SuggestRequest,
  ctx: { userId?: string; requestId?: string },
): SuggestionEnvelope {
  const requestId = ctx.requestId || `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    requestId,
    task: 'sourcing',
    objective: request,
    constraints: {
      excludeTypes: [],
      mustBeOpenAt: null,
      maxBudgetLevel: 4,
      maxDistanceMiles: 35,
    },
    contextRefs: { userId: ctx.userId },
    budget: { maxTokens: 100_000, maxLatencyMs: 12_000 },
    expectedOutputSchema: 'candidates',
    provenance: [],
    traceId: requestId, // single-trace for now; can be set externally if part of a larger trace
  };
}

export function recordStage(env: SuggestionEnvelope, entry: ProvenanceEntry): void {
  env.provenance.push(entry);
}
