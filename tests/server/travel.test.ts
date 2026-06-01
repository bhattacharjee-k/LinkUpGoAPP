import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LatLng } from '../../server/geo';
import {
  DEFAULT_TOLERANCE_MIN,
  HaversineFallbackProvider,
  type Member,
  MODE_SPEED_MPH,
  type Mode,
  type RouteMatrixProvider,
  clearTravelCache,
  prefilterRadiusMiles,
  resolveOrigin,
  strain,
  travelScore,
} from '../../server/travel';

class FakeRouteMatrixProvider implements RouteMatrixProvider {
  calls = 0;

  constructor(private readonly getEta: (origin: LatLng, mode: Mode, destination: LatLng) => number) {}

  async getEtas(origins: LatLng[], mode: Mode, destinations: LatLng[]): Promise<number[][]> {
    this.calls++;
    return origins.map(origin => destinations.map(destination => this.getEta(origin, mode, destination)));
  }
}

const originalRouteKey = process.env.GOOGLE_ROUTES_API_KEY;
const originalMapsKey = process.env.GOOGLE_MAPS_API_KEY;
const originalPlacesKey = process.env.GOOGLE_PLACES_API_KEY;

function clearGoogleKeys(): void {
  delete process.env.GOOGLE_ROUTES_API_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
}

describe('travel', () => {
  beforeEach(() => {
    clearTravelCache();
  });

  afterEach(() => {
    clearTravelCache();
    process.env.GOOGLE_ROUTES_API_KEY = originalRouteKey;
    process.env.GOOGLE_MAPS_API_KEY = originalMapsKey;
    process.env.GOOGLE_PLACES_API_KEY = originalPlacesKey;
  });

  it('computes strain as ETA over tolerance seconds', () => {
    expect(strain(10 * 60, 20)).toBe(0.5);
    expect(strain(45 * 60, 45)).toBe(1);
    expect(strain(90 * 60, 45)).toBe(2);
  });

  it('applies default tolerances when member tolerance is omitted', async () => {
    const provider = new FakeRouteMatrixProvider((_origin, mode) => DEFAULT_TOLERANCE_MIN[mode] * 60);
    const result = await travelScore([
      { name: 'Walker', origin: { lat: 40.7, lng: -74 }, mode: 'walk' },
      { name: 'Rider', origin: { lat: 40.8, lng: -74 }, mode: 'transit' },
      { name: 'Driver', origin: { lat: 40.9, lng: -74 }, mode: 'car' },
    ], { lat: 40.75, lng: -73.99 }, {
      city: 'NYC',
      provider,
      departBucket: 'test',
      now: 1000,
    });

    expect(result.perMember.map(member => member.strain)).toEqual([1, 1, 1]);
    expect(result.reachableByAll).toBe(true);
  });

  it('resolves neighborhood origins and passes through LatLng origins', () => {
    const latLng = { lat: 40.1, lng: -73.9 };

    expect(resolveOrigin({ origin: latLng, mode: 'walk' }, 'NYC')).toBe(latLng);
    expect(resolveOrigin({ origin: 'Williamsburg', mode: 'walk' }, 'NYC')).toEqual({
      lat: 40.7081,
      lng: -73.9571,
    });
    expect(resolveOrigin({ origin: 'Not A Real Neighborhood', mode: 'walk' }, 'NYC')).toEqual({
      lat: 40.7580,
      lng: -73.9855,
    });
  });

  it('computes prefilter radius by mode speed and tolerance', () => {
    expect(prefilterRadiusMiles({ origin: 'Williamsburg', mode: 'walk' }, 'NYC')).toBeCloseTo(
      (DEFAULT_TOLERANCE_MIN.walk / 60) * MODE_SPEED_MPH.walk,
    );
    expect(prefilterRadiusMiles({ origin: 'Williamsburg', mode: 'transit' }, 'NYC')).toBeCloseTo(6);
    expect(prefilterRadiusMiles({ origin: 'Williamsburg', mode: 'car', toleranceMin: 30 }, 'NYC')).toBeCloseTo(9);
  });

  it('prefers lower max strain over lower average ETA', async () => {
    const members: Member[] = [
      { name: 'Near', origin: { lat: 1, lng: 0 }, mode: 'car', toleranceMin: 20 },
      { name: 'Far', origin: { lat: 2, lng: 0 }, mode: 'car', toleranceMin: 20 },
    ];
    const venueA = { lat: 10, lng: 0 };
    const venueB = { lat: 20, lng: 0 };
    const provider = new FakeRouteMatrixProvider((origin, _mode, destination) => {
      if (destination.lat === venueA.lat) return origin.lat === 1 ? 5 * 60 : 19 * 60;
      if (destination.lat === venueB.lat) return 13 * 60;
      throw new Error('unexpected destination');
    });

    const scoreA = await travelScore(members, venueA, {
      city: 'NYC',
      provider,
      departBucket: 'fairness',
      now: 1000,
    });
    const scoreB = await travelScore(members, venueB, {
      city: 'NYC',
      provider,
      departBucket: 'fairness',
      now: 1000,
    });

    const avgEtaA = scoreA.perMember.reduce((sum, member) => sum + member.etaMin, 0) / scoreA.perMember.length;
    const avgEtaB = scoreB.perMember.reduce((sum, member) => sum + member.etaMin, 0) / scoreB.perMember.length;

    expect(avgEtaA).toBeLessThan(avgEtaB);
    expect(scoreA.maxStrain).toBeGreaterThan(scoreB.maxStrain);
    expect(scoreB.score).toBeGreaterThan(scoreA.score);
  });

  it('reports soft reachability and hard outer-bound reachability', async () => {
    const comfortableProvider = new FakeRouteMatrixProvider(() => 10 * 60);
    const softFailProvider = new FakeRouteMatrixProvider(() => 25 * 60);
    const hardFailProvider = new FakeRouteMatrixProvider(() => 45 * 60);
    const members: Member[] = [
      { name: 'Walker', origin: { lat: 40.7, lng: -74 }, mode: 'walk', toleranceMin: 20 },
    ];
    const venue = { lat: 40.72, lng: -73.98 };

    const comfortable = await travelScore(members, venue, {
      city: 'NYC',
      provider: comfortableProvider,
      departBucket: 'reachability-comfortable',
      now: 1000,
    });
    const softFail = await travelScore(members, venue, {
      city: 'NYC',
      provider: softFailProvider,
      departBucket: 'reachability-soft-fail',
      now: 1000,
    });
    const hardFail = await travelScore(members, venue, {
      city: 'NYC',
      provider: hardFailProvider,
      departBucket: 'reachability-hard-fail',
      now: 1000,
    });

    expect(comfortable.reachableByAll).toBe(true);
    expect(comfortable.hardUnreachable).toBe(false);
    expect(softFail.reachableByAll).toBe(false);
    expect(softFail.hardUnreachable).toBe(false);
    expect(hardFail.reachableByAll).toBe(false);
    expect(hardFail.maxStrain).toBeGreaterThan(2);
    expect(hardFail.hardUnreachable).toBe(true);
  });

  it('uses Haversine fallback with finite ETAs when no provider and no key are supplied', async () => {
    clearGoogleKeys();

    const result = await travelScore([
      { name: 'Walker', origin: { lat: 40.7580, lng: -73.9855 }, mode: 'walk' },
    ], { lat: 40.7680, lng: -73.9855 }, {
      city: 'NYC',
      departBucket: 'fallback',
      now: 1000,
    });

    expect(result.perMember[0].etaMin).toBeGreaterThan(0);
    expect(Number.isFinite(result.perMember[0].etaMin)).toBe(true);
    expect(Number.isFinite(result.perMember[0].strain)).toBe(true);
  });

  it('HaversineFallbackProvider computes finite matrix ETAs directly', async () => {
    const provider = new HaversineFallbackProvider();
    const matrix = await provider.getEtas(
      [{ lat: 40.7580, lng: -73.9855 }],
      'walk',
      [{ lat: 40.7680, lng: -73.9855 }],
      'direct',
    );

    expect(matrix).toHaveLength(1);
    expect(matrix[0]).toHaveLength(1);
    expect(matrix[0][0]).toBeGreaterThan(0);
    expect(Number.isFinite(matrix[0][0])).toBe(true);
  });

  it('falls back to Haversine when an injected provider throws', async () => {
    const throwingProvider = new FakeRouteMatrixProvider(() => {
      throw new Error('provider unavailable');
    });

    const result = await travelScore([
      { name: 'Walker', origin: { lat: 40.7580, lng: -73.9855 }, mode: 'walk' },
    ], { lat: 40.7680, lng: -73.9855 }, {
      city: 'NYC',
      provider: throwingProvider,
      departBucket: 'provider-throws',
      now: 1000,
    });

    expect(result.perMember[0].etaMin).toBeGreaterThan(0);
    expect(Number.isFinite(result.perMember[0].etaMin)).toBe(true);
  });

  it('uses cached ETAs within TTL and recomputes after TTL', async () => {
    let etaSec = 10 * 60;
    const provider = new FakeRouteMatrixProvider(() => etaSec);
    const members: Member[] = [
      { name: 'Rider', origin: { lat: 40.7580, lng: -73.9855 }, mode: 'transit', toleranceMin: 30 },
    ];
    const venue = { lat: 40.7680, lng: -73.9855 };

    const first = await travelScore(members, venue, {
      city: 'NYC',
      provider,
      departBucket: 'cache',
      now: 1000,
    });
    etaSec = 20 * 60;
    const cached = await travelScore(members, venue, {
      city: 'NYC',
      provider,
      departBucket: 'cache',
      now: 1000 + 15 * 60 * 1000 - 1,
    });
    const recomputed = await travelScore(members, venue, {
      city: 'NYC',
      provider,
      departBucket: 'cache',
      now: 1000 + 15 * 60 * 1000 + 1,
    });

    expect(provider.calls).toBe(2);
    expect(cached.perMember[0].etaMin).toBe(first.perMember[0].etaMin);
    expect(recomputed.perMember[0].etaMin).toBe(20);
  });
});
