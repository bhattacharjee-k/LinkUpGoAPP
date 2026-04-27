// Shared types for the panel-of-LLM-judges (PoLL).

import type { EnrichedCandidate } from '../envelope';
import type { SuggestRequest } from '../../suggestions';

export type Dimension = 'vibe' | 'neighborhood' | 'budget' | 'hidden_gem';

export interface JudgeVerdict {
  candidateId: string;
  /** Integer score 1..5, or null on abstention. */
  score: number | null;
  /** Confidence 0..1, null when score is null. */
  confidence: number | null;
  /** CoT reasoning. Required first by judge prompts. */
  reasoning: string;
}

export interface JudgeContext {
  request: SuggestRequest;
  /** Resolved favorite neighborhood NTA ids (from server/geo/lookup.ts). */
  favoriteNtaIds?: string[];
}

export interface JudgeFn {
  (candidates: EnrichedCandidate[], ctx: JudgeContext): Promise<JudgeVerdict[]>;
}
