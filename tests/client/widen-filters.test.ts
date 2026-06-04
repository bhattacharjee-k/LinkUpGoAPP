import { describe, expect, it } from 'vitest';
import { widenFilters, WIDEN_SEARCH_DISTANCE } from '@/lib/store';

// `widenFilters` is the single source of truth for the broadening applied by
// BOTH the manual "Widen Search Area" button (session.tsx) and the automatic
// empty-first-generation retry (context.tsx → startSession). These tests pin
// the broadening so the two paths cannot drift apart.
describe('widenFilters', () => {
  it('matches the manual "Widen Search Area" broadening (distance → "5 mi")', () => {
    // The manual handler previously did: { ...currentFilters, distance: '5 mi' }
    expect(WIDEN_SEARCH_DISTANCE).toBe('5 mi');

    const filters = {
      locationScope: 'NYC',
      category: ['Dinner'],
      budget: '$$',
      energy: 'Vibey',
    };

    expect(widenFilters(filters)).toEqual({
      locationScope: 'NYC',
      category: ['Dinner'],
      budget: '$$',
      energy: 'Vibey',
      distance: WIDEN_SEARCH_DISTANCE,
    });
  });

  it('sets distance even when the original filters have none', () => {
    expect(widenFilters({}).distance).toBe('5 mi');
  });

  it('overrides a pre-existing (narrower) distance', () => {
    expect(widenFilters({ distance: '1.2 mi' }).distance).toBe('5 mi');
  });

  it('preserves all other filter fields untouched', () => {
    const filters = {
      locationScope: 'NYC',
      neighborhood: 'SoHo',
      category: ['Dinner', 'Drinks'],
      budget: '$$',
      energy: 'Vibey',
      timeWindow: 'tonight',
      vibeDescription: 'cozy and intimate',
      locationMode: 'near_me' as const,
      referenceVenues: [{ name: 'Laser Wolf' }],
    };

    const widened = widenFilters(filters);

    expect(widened).toMatchObject(filters);
    expect(widened.distance).toBe('5 mi');
  });

  it('does not mutate the input object', () => {
    const filters = { distance: '1.2 mi', budget: '$$' };
    const snapshot = { ...filters };

    widenFilters(filters);

    expect(filters).toEqual(snapshot);
  });
});
