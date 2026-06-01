import { beforeEach, describe, expect, it } from 'vitest';
import { bandForNii } from '@shared/energy';
import {
  clearVenueFeatureCache,
  computeVenueFeatures,
  crowdFromRatingCount,
  getVenueFeatures,
  intensityFromVenue,
  latenessFromOpeningHours,
  spendFromPriceLevel,
  venueNii,
} from '../../server/venue-features';

const CACHE_TTL_MS = 15 * 60 * 1000;

describe('venue features', () => {
  beforeEach(() => {
    clearVenueFeatureCache();
  });

  describe('spendFromPriceLevel', () => {
    it('maps app price levels to normalized spend', () => {
      expect(spendFromPriceLevel('$')).toBe(0);
      expect(spendFromPriceLevel('$$')).toBe(0.33);
      expect(spendFromPriceLevel('$$$')).toBe(0.66);
      expect(spendFromPriceLevel('$$$$')).toBe(1);
    });

    it('maps Google PRICE_LEVEL strings to normalized spend', () => {
      expect(spendFromPriceLevel('PRICE_LEVEL_FREE')).toBe(0);
      expect(spendFromPriceLevel('PRICE_LEVEL_INEXPENSIVE')).toBe(0);
      expect(spendFromPriceLevel('PRICE_LEVEL_MODERATE')).toBe(0.33);
      expect(spendFromPriceLevel('PRICE_LEVEL_EXPENSIVE')).toBe(0.66);
      expect(spendFromPriceLevel('PRICE_LEVEL_VERY_EXPENSIVE')).toBe(1);
    });

    it('maps numeric Google price levels to normalized spend', () => {
      expect(spendFromPriceLevel(1)).toBe(0);
      expect(spendFromPriceLevel(2)).toBe(0.33);
      expect(spendFromPriceLevel(3)).toBe(0.66);
      expect(spendFromPriceLevel(4)).toBe(1);
    });
  });

  describe('latenessFromOpeningHours', () => {
    it('maps 10:00 PM closing to zero lateness', () => {
      expect(latenessFromOpeningHours(['Monday: 8:00 AM - 10:00 PM'])).toBe(0);
    });

    it('maps 3:00 AM and 4:00 AM closing to max lateness', () => {
      expect(latenessFromOpeningHours(['Friday: 8:00 PM - 3:00 AM'])).toBe(1);
      expect(latenessFromOpeningHours(['Friday: 8:00 PM - 4:00 AM'])).toBe(1);
    });

    it('handles midnight and 2:00 AM as past-midnight intermediate values', () => {
      const midnight = latenessFromOpeningHours(['Friday: 5:00 PM - 12:00 AM']);
      const twoAm = latenessFromOpeningHours(['Friday: 5:00 PM - 2:00 AM']);

      expect(midnight).toBeGreaterThan(0);
      expect(midnight).toBeLessThan(1);
      expect(twoAm).toBeGreaterThan(midnight);
      expect(twoAm).toBeLessThan(1);
      expect(twoAm).toBeCloseTo(0.8);
    });

    it('handles "Open until" and "Open 24 hours" formats', () => {
      expect(latenessFromOpeningHours(['Friday: Open until 2:00 AM'])).toBeCloseTo(0.8);
      expect(latenessFromOpeningHours(['Monday: Open 24 hours'])).toBe(1);
    });

    it('ignores closed lines and takes the latest close across the week', () => {
      expect(latenessFromOpeningHours([
        'Monday: Closed',
        'Tuesday: 5:00 PM - 10:00 PM',
        'Wednesday: 5:00 PM - 12:00 AM',
        'Thursday: 5:00 PM - 2:00 AM',
      ])).toBeCloseTo(0.8);
    });

    it('parses en dash and em dash ranges', () => {
      expect(latenessFromOpeningHours(['Saturday: 5:00 PM – 2:00 AM'])).toBeCloseTo(0.8);
      expect(latenessFromOpeningHours(['Saturday: 5:00 PM — 1:00 AM'])).toBeCloseTo(0.6);
    });

    it('takes the latest close on split-hours lines (lunch + dinner)', () => {
      // Real close is 11:00 PM (23h) → lateness ~0.2, not the first range's 2:00 PM close.
      expect(latenessFromOpeningHours(['Monday: 11:00 AM - 2:00 PM, 5:00 PM - 11:00 PM']))
        .toBeCloseTo(0.2);
      // Split hours that run late should still register as late.
      expect(latenessFromOpeningHours(['Friday: 11:00 AM - 3:00 PM, 6:00 PM - 2:00 AM']))
        .toBeCloseTo(0.8);
    });

    it('defaults empty or missing hours to mid lateness', () => {
      expect(latenessFromOpeningHours()).toBe(0.5);
      expect(latenessFromOpeningHours([])).toBe(0.5);
      expect(latenessFromOpeningHours(['Hours might differ'])).toBe(0.5);
    });
  });

  describe('crowdFromRatingCount', () => {
    it('defaults empty or zero counts to a modest crowd value', () => {
      expect(crowdFromRatingCount()).toBe(0.25);
      expect(crowdFromRatingCount(0)).toBe(0.25);
    });

    it('monotonically increases with rating count', () => {
      const counts = [1, 10, 100, 1000, 5000];
      const scores = counts.map(count => crowdFromRatingCount(count));

      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeGreaterThan(scores[i - 1]);
      }
    });

    it('approaches and clamps at one for large counts', () => {
      expect(crowdFromRatingCount(5000)).toBe(1);
      expect(crowdFromRatingCount(50_000)).toBe(1);
    });
  });

  describe('intensityFromVenue', () => {
    it('scores club, dance, and DJ text high', () => {
      expect(intensityFromVenue({
        tags: ['night_club', 'dance'],
        description: 'Late-night club with DJs and a packed dance floor.',
      })).toBeGreaterThan(0.6);
    });

    it('scores cafe, wine-bar, and quiet text low', () => {
      expect(intensityFromVenue({
        tags: ['cafe'],
        description: 'Quiet low-key wine-bar with cozy tables.',
      })).toBeLessThan(0.4);
    });

    it('defaults no signal to neutral intensity', () => {
      expect(intensityFromVenue({
        tags: ['establishment'],
        description: 'A neighborhood spot.',
      })).toBe(0.5);
    });
  });

  describe('venueNii', () => {
    it('separates dive-bar-like and megaclub-like venues into different energy bands', () => {
      const diveBar = computeVenueFeatures({
        placeId: 'dive',
        priceLevel: '$',
        ratingCount: 20,
        tags: ['bar'],
        description: 'Low-key intimate neighborhood bar with cheap drinks and a quiet back room.',
        openingHoursText: ['Friday: 4:00 PM - 10:00 PM'],
      });
      const megaClub = computeVenueFeatures({
        placeId: 'club',
        priceLevel: '$$$$',
        ratingCount: 10_000,
        tags: ['night_club', 'dance'],
        description: 'Packed late-night club with DJs, dancing, bottle service, and a big party crowd.',
        openingHoursText: ['Friday: 10:00 PM - 4:00 AM'],
      });

      const diveNii = venueNii(diveBar);
      const clubNii = venueNii(megaClub);

      expect(clubNii).toBeGreaterThan(diveNii + 50);
      expect(bandForNii(diveNii)).toBe('Chill');
      expect(bandForNii(clubNii)).toBe('Full send');
    });
  });

  describe('getVenueFeatures', () => {
    it('returns the cached object within TTL for the same place id', () => {
      const place = {
        placeId: 'place_123',
        priceLevel: '$$',
        ratingCount: 120,
        tags: ['bar'],
        openingHoursText: ['Monday: 5:00 PM - 12:00 AM'],
      };

      const first = getVenueFeatures(place, 1000);
      const second = getVenueFeatures({ ...place, priceLevel: '$$$$' }, 1000 + CACHE_TTL_MS - 1);

      expect(second).toBe(first);
      expect(second.spend).toBe(0.33);
    });

    it('recomputes after TTL expires', () => {
      const place = {
        placeId: 'place_123',
        priceLevel: '$$',
        ratingCount: 120,
        tags: ['bar'],
        openingHoursText: ['Monday: 5:00 PM - 12:00 AM'],
      };

      const first = getVenueFeatures(place, 1000);
      const second = getVenueFeatures({ ...place, priceLevel: '$$$$' }, 1000 + CACHE_TTL_MS + 1);

      expect(second).not.toBe(first);
      expect(second.spend).toBe(1);
    });

    it('does not cache a place with no placeId and no title', () => {
      const first = getVenueFeatures({
        priceLevel: '$$',
        ratingCount: 120,
        openingHoursText: ['Monday: 5:00 PM - 12:00 AM'],
      }, 1000);
      const second = getVenueFeatures({
        priceLevel: '$$$$',
        ratingCount: 120,
        openingHoursText: ['Monday: 5:00 PM - 12:00 AM'],
      }, 1001);

      expect(second).not.toBe(first);
      expect(second.spend).toBe(1);
    });

    it('clearVenueFeatureCache empties cached values', () => {
      const place = {
        placeId: 'place_123',
        priceLevel: '$$',
        ratingCount: 120,
        tags: ['bar'],
        openingHoursText: ['Monday: 5:00 PM - 12:00 AM'],
      };

      const first = getVenueFeatures(place, 1000);
      clearVenueFeatureCache();
      const second = getVenueFeatures({ ...place, priceLevel: '$$$$' }, 1001);

      expect(second).not.toBe(first);
      expect(second.spend).toBe(1);
    });
  });
});
