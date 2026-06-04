import { describe, expect, it } from 'vitest';
import { derivePlannerReply, formatVoteLabel } from '@/lib/session-helpers';

// These helpers back the two session-screen UX fixes:
//  - derivePlannerReply: guarantees a non-empty Planner chat bubble so a
//    @Planner request never looks ignored (the server-persisted reply is
//    sometimes empty after a regenerate tool call).
//  - formatVoteLabel: turns bare vote numbers into a labeled, plural-aware
//    count so a first-timer understands the card.
// We test these pure functions directly — the smallest meaningful seam,
// avoiding the heavily-entangled session.tsx component.

describe('derivePlannerReply', () => {
  it('returns the streamed response text when present', () => {
    expect(
      derivePlannerReply({ response: 'Found 3 cozy wine bars nearby!', suggestionsUpdated: true })
    ).toBe('Found 3 cozy wine bars nearby!');
  });

  it('trims surrounding whitespace from the response', () => {
    expect(
      derivePlannerReply({ response: '  Done!  \n', suggestionsUpdated: false })
    ).toBe('Done!');
  });

  it('falls back to a refresh hint when response is empty but suggestions updated', () => {
    expect(
      derivePlannerReply({ response: '', suggestionsUpdated: true })
    ).toBe('Refreshed your options — check the Suggestions tab.');
  });

  it('treats whitespace-only response as empty', () => {
    expect(
      derivePlannerReply({ response: '   \n ', suggestionsUpdated: true })
    ).toBe('Refreshed your options — check the Suggestions tab.');
  });

  it('falls back to a generic ack when empty and nothing changed', () => {
    expect(
      derivePlannerReply({ response: '', suggestionsUpdated: false })
    ).toBe("Got it — I'm on it.");
  });
});

describe('formatVoteLabel', () => {
  it('uses plural "votes" when there are none', () => {
    expect(formatVoteLabel(0, 0)).toBe('0 votes');
  });

  it('uses singular "vote" for exactly one total vote', () => {
    expect(formatVoteLabel(1, 0)).toBe('1 vote');
    expect(formatVoteLabel(0, 1)).toBe('1 vote');
  });

  it('sums upvotes and downvotes for the total', () => {
    expect(formatVoteLabel(3, 2)).toBe('5 votes');
  });
});
