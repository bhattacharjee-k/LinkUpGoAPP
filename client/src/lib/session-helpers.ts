// Small pure helpers for the session/voting screen.
// Kept separate from the large session.tsx component so they can be unit-tested.

/**
 * Derives the text shown in a Planner chat bubble.
 *
 * The planner endpoint persists its own assistant reply, but after a
 * tool call (e.g. regenerating suggestions) the model sometimes returns
 * no summary text — which renders an empty, ignored-looking bubble. In
 * that case we fall back to a clear line pointing the user at the
 * refreshed options.
 */
export function derivePlannerReply(args: {
  response: string;
  suggestionsUpdated: boolean;
}): string {
  const text = (args.response || '').trim();
  if (text) return text;
  if (args.suggestionsUpdated) {
    return 'Refreshed your options — check the Suggestions tab.';
  }
  return "Got it — I'm on it.";
}

/**
 * Formats the vote count label for a suggestion card.
 * Singular/plural aware, so "1 vote" reads correctly.
 */
export function formatVoteLabel(upvotes: number, downvotes: number): string {
  const total = upvotes + downvotes;
  return total === 1 ? '1 vote' : `${total} votes`;
}

export type LocationMode = 'near_me' | 'explore_anywhere' | 'meet_in_the_middle';

/**
 * The location-scope clause for the suggestion-search loading copy.
 *
 * It must NOT claim "nearby" when the user picked the "Anywhere"/explore
 * scope, and should reflect the meet-in-the-middle case too. Pure + tiny
 * so it can be unit-tested.
 */
export function searchingCopy(locationMode?: LocationMode): string {
  switch (locationMode) {
    case 'explore_anywhere':
      return 'Searching for the best spots city-wide...';
    case 'meet_in_the_middle':
      return 'Searching for spots central to everyone...';
    case 'near_me':
    default:
      return 'Searching the best spots nearby...';
  }
}
