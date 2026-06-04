import { describe, expect, it } from 'vitest';
import { searchingCopy } from '@/lib/session-helpers';

// `searchingCopy` drives the location-scope line in the suggestion-search
// loading overlay. The key regressions it guards: it must NOT claim "nearby"
// when the user picked the "Anywhere"/explore scope, and it should read as a
// grammatical sentence.
describe('searchingCopy', () => {
  it('says "nearby" for the near-me mode', () => {
    expect(searchingCopy('near_me')).toBe('Searching the best spots nearby...');
  });

  it('does NOT say "nearby" for the anywhere/explore mode', () => {
    const copy = searchingCopy('explore_anywhere');
    expect(copy.toLowerCase()).not.toContain('nearby');
    expect(copy).toContain('city-wide');
  });

  it('does NOT say "nearby" for the meet-in-the-middle mode', () => {
    const copy = searchingCopy('meet_in_the_middle');
    expect(copy.toLowerCase()).not.toContain('nearby');
    expect(copy.toLowerCase()).toContain('central');
  });

  it('defaults to the near-me copy when the mode is undefined', () => {
    expect(searchingCopy(undefined)).toBe('Searching the best spots nearby...');
  });

  it('is grammatical: starts with "Searching for"/"Searching the" and ends with ellipsis', () => {
    for (const mode of ['near_me', 'explore_anywhere', 'meet_in_the_middle'] as const) {
      const copy = searchingCopy(mode);
      expect(copy).toMatch(/^Searching (for|the) /);
      expect(copy.endsWith('...')).toBe(true);
    }
  });
});
