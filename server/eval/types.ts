// Common types for the eval harness.
// Tier 1 = behavioral gold extracted from votes/event_feedback.
// Tier 2 = hand-labeled hard cases (HUMAN REQUIRED).
// Tier 3 = LLM-judge scored at offline meta-eval time.

export type Relevance = 0 | 1 | 2 | 3;

export interface GoldenLabel {
  /** Stable id of the (user, intent, suggestion) triple. */
  id: string;
  userId: string;
  sessionId: string;
  suggestionId: string;
  /** 0 = irrelevant, 1 = soft positive, 2 = strong positive, 3 = attended. */
  relevance: Relevance;
  /** For negatives: the downvote reasons populated. */
  downvoteReasons?: string[];
  /** Source: 'vote_up_attended' | 'feedback_high' | 'vote_down' | 'impression_no_action'. */
  source: GoldenSource;
  /** ISO timestamp of the underlying signal (vote/feedback). */
  signalAt: string;
}

export type GoldenSource =
  | 'vote_up_attended'
  | 'feedback_high'
  | 'vote_down'
  | 'impression_no_action';

export interface GoldenIntent {
  /** Reproduces the request the pipeline saw. */
  sessionId: string;
  userId: string;
  city: 'NYC' | 'Chicago';
  categories: string[];
  budget?: string;
  energy?: string;
  timeWindow?: string;
  specificDate?: string;
  specificTime?: string;
  neighborhood?: string;
  vibeDescription?: string;
  locationMode?: 'near_me' | 'explore_anywhere' | 'meet_in_the_middle';
  discoveryStyle?: string;
  crowdPreference?: string;
  favoriteNeighborhoods?: string[];
}

export interface GoldenExample {
  intent: GoldenIntent;
  /** All (suggestion, relevance) pairs that were observed for this intent. */
  labels: GoldenLabel[];
}

export interface RankedItem {
  suggestionId: string;
  rank: number; // 1-indexed
  /** Optional structured features for diversity metrics. */
  category?: string;
  ntaId?: string;
  priceTier?: number;
  reviewCount?: number;
}

export interface PipelineRun {
  /** The pipeline that produced these results. */
  pipelineVersion: 'v1' | 'v2' | string;
  intent: GoldenIntent;
  results: RankedItem[];
  latencyMs: number;
  /** Optional cost in USD (sum across all model + API calls). */
  costUsd?: number;
}

export interface MetricsReport {
  ndcg10: number;
  recall20: number;
  /** Intra-list diversity (avg pairwise distance). */
  ild: number;
  /** Gini coefficient over recommendation frequency (0=perfect equality, 1=max skew). */
  gini: number;
  /** Fraction of items ever recommended in any session — long-tail coverage. */
  tailCoverage20: number;
  /** Per-example detail for spot-checks. */
  perExample: Array<{
    sessionId: string;
    ndcg10: number;
    recall20: number;
    ild: number;
  }>;
}
