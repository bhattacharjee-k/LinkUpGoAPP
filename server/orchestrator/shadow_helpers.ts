// Helpers for shadow.ts.
//
// `getOrchestratedSuggestions` in suggestions.ts has a feature-flag delegation
// at the top — calling it directly while SUGGESTIONS_PIPELINE=shadow would
// recurse. This helper temporarily unsets the flag for the duration of a v1 call.

import type { SuggestRequest, SuggestResult, GroupPreferenceSummary, DownvoteReasonAggregates } from '../suggestions';
import type { ReferenceVenue } from '@shared/schema';

export async function runV1Direct(
  req: SuggestRequest,
  downvoteReasons?: DownvoteReasonAggregates,
  referenceVenues?: ReferenceVenue[],
  groupPrefs?: GroupPreferenceSummary,
  feedbackHistory?: Array<{ venueName: string; rating: number; tags?: string[] | null; review?: string | null }>,
): Promise<SuggestResult> {
  const prev = process.env.SUGGESTIONS_PIPELINE;
  process.env.SUGGESTIONS_PIPELINE = 'v1';
  try {
    const mod = await import('../suggestions');
    return await mod.getOrchestratedSuggestions(req, downvoteReasons, referenceVenues, groupPrefs, feedbackHistory);
  } finally {
    if (prev === undefined) {
      delete process.env.SUGGESTIONS_PIPELINE;
    } else {
      process.env.SUGGESTIONS_PIPELINE = prev;
    }
  }
}
