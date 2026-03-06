import { describe, it, expect } from 'vitest';
import { calculateScore, rankSuggestions, getVoteSummary, REASON_PENALTIES } from '@shared/ranking';

describe('calculateScore', () => {
  it('returns 0 for no votes', () => {
    expect(calculateScore([])).toBe(0);
  });

  it('returns 1 for a single upvote', () => {
    expect(calculateScore([{ userId: 'u1', voteType: 'up' }])).toBe(1);
  });

  it('returns -1 for a bare downvote (no reasons)', () => {
    expect(calculateScore([{ userId: 'u1', voteType: 'down' }])).toBe(-1);
  });

  it('applies reason penalties on downvotes', () => {
    const score = calculateScore([
      { userId: 'u1', voteType: 'down', reasons: ['TOO_FAR'] },
    ]);
    // base penalty 1 + TOO_FAR penalty 2 = -3
    expect(score).toBe(-3);
  });

  it('stacks multiple reason penalties', () => {
    const score = calculateScore([
      { userId: 'u1', voteType: 'down', reasons: ['TOO_FAR', 'TOO_EXPENSIVE'] },
    ]);
    // base 1 + TOO_FAR 2 + TOO_EXPENSIVE 2 = -5
    expect(score).toBe(-5);
  });

  it('handles mixed upvotes and downvotes', () => {
    const score = calculateScore([
      { userId: 'u1', voteType: 'up' },
      { userId: 'u2', voteType: 'up' },
      { userId: 'u3', voteType: 'down', reasons: ['NOT_MY_VIBE'] },
    ]);
    // +1 +1 -(1+1) = 0
    expect(score).toBe(0);
  });

  it('handles null reasons gracefully', () => {
    const score = calculateScore([
      { userId: 'u1', voteType: 'down', reasons: null },
    ]);
    expect(score).toBe(-1);
  });

  it('handles empty reasons array', () => {
    const score = calculateScore([
      { userId: 'u1', voteType: 'down', reasons: [] },
    ]);
    expect(score).toBe(-1);
  });
});

describe('rankSuggestions', () => {
  it('sorts suggestions by descending score', () => {
    const suggestions = [
      { id: 'a', name: 'A', votes: [{ userId: 'u1', voteType: 'down' as const }] },
      { id: 'b', name: 'B', votes: [{ userId: 'u1', voteType: 'up' as const }, { userId: 'u2', voteType: 'up' as const }] },
      { id: 'c', name: 'C', votes: [{ userId: 'u1', voteType: 'up' as const }] },
    ];

    const ranked = rankSuggestions(suggestions);
    expect(ranked.map(s => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('does not mutate the original array', () => {
    const suggestions = [
      { id: 'a', name: 'A', votes: [{ userId: 'u1', voteType: 'down' as const }] },
      { id: 'b', name: 'B', votes: [{ userId: 'u1', voteType: 'up' as const }] },
    ];
    const original = [...suggestions];
    rankSuggestions(suggestions);
    expect(suggestions.map(s => s.id)).toEqual(original.map(s => s.id));
  });

  it('handles empty array', () => {
    expect(rankSuggestions([])).toEqual([]);
  });
});

describe('getVoteSummary', () => {
  it('returns zeros for no votes', () => {
    expect(getVoteSummary([])).toEqual({ upvotes: 0, downvotes: 0, score: 0 });
  });

  it('counts upvotes and downvotes', () => {
    const votes = [
      { userId: 'u1', voteType: 'up' as const },
      { userId: 'u2', voteType: 'up' as const },
      { userId: 'u3', voteType: 'down' as const },
    ];
    const summary = getVoteSummary(votes);
    expect(summary.upvotes).toBe(2);
    expect(summary.downvotes).toBe(1);
    expect(summary.score).toBe(1); // +1 +1 -1
  });
});

describe('REASON_PENALTIES', () => {
  it('has penalties for all downvote reasons', () => {
    const expectedReasons = [
      'TOO_FAR', 'TOO_EXPENSIVE', 'BAD_TIMING', 'NOT_MY_VIBE',
      'NOT_MY_TASTE', 'DOESNT_FIT_GROUP', 'WRONG_NEIGHBORHOOD', 'OTHER',
    ];
    for (const reason of expectedReasons) {
      expect(REASON_PENALTIES[reason]).toBeGreaterThan(0);
    }
  });

  it('BAD_TIMING has highest penalty (3)', () => {
    expect(REASON_PENALTIES['BAD_TIMING']).toBe(3);
  });
});
