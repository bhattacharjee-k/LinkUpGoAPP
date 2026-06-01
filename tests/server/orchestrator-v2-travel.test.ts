import { beforeEach, describe, expect, it } from 'vitest';
import type { LatLng } from '../../server/geo';
import { clearTravelCache, type Mode, type RouteMatrixProvider } from '../../server/travel';
import { applyV2StructuredAdjustments } from '../../server/orchestrator/v2';
import type { SuggestRequest } from '../../server/suggestions';

class FakeRouteMatrixProvider implements RouteMatrixProvider {
  constructor(private readonly getEta: (destination: LatLng, mode: Mode) => number) {}

  async getEtas(origins: LatLng[], mode: Mode, destinations: LatLng[]): Promise<number[][]> {
    return origins.map(() => destinations.map(destination => this.getEta(destination, mode)));
  }
}

function baseRequest(): SuggestRequest {
  return {
    city: 'NYC',
    categories: ['Drinks'],
    budget: '$$',
    energy: 'Vibey',
    participantTravel: [
      {
        origin: { lat: 40.7580, lng: -73.9855 },
        mode: 'transit',
        toleranceMin: 30,
      },
    ],
  };
}

describe('applyV2StructuredAdjustments travel wiring', () => {
  beforeEach(() => {
    clearTravelCache();
  });

  it('ranks a reachable candidate above an otherwise equal high-strain candidate', async () => {
    const candidates = [
      {
        id: 'reachable',
        venueNii: 35,
        priceTier: 2,
        raw: { lat: 1, lng: 0 },
      },
      {
        id: 'strained',
        venueNii: 35,
        priceTier: 2,
        raw: { lat: 2, lng: 0 },
      },
    ];
    const aggMap = new Map<string, number | null>([
      ['reachable', 4],
      ['strained', 4],
    ]);
    const provider = new FakeRouteMatrixProvider(destination => (
      destination.lat === 1 ? 5 * 60 : 40 * 60
    ));

    await applyV2StructuredAdjustments(candidates, aggMap, baseRequest(), {
      routeProvider: provider,
      departBucket: 'test',
      now: 1000,
    });

    expect(aggMap.get('reachable')).toBeGreaterThan(aggMap.get('strained') as number);
  });

  it('heavily penalizes hard-unreachable candidates without dropping them', async () => {
    const candidates = [
      {
        id: 'reachable',
        venueNii: 35,
        priceTier: 2,
        raw: { lat: 1, lng: 0 },
      },
      {
        id: 'hard',
        venueNii: 35,
        priceTier: 2,
        raw: { lat: 3, lng: 0 },
      },
    ];
    const aggMap = new Map<string, number | null>([
      ['reachable', 4],
      ['hard', 4],
    ]);
    const provider = new FakeRouteMatrixProvider(destination => (
      destination.lat === 3 ? 70 * 60 : 5 * 60
    ));

    await applyV2StructuredAdjustments(candidates, aggMap, baseRequest(), {
      routeProvider: provider,
      departBucket: 'hard',
      now: 1000,
    });

    expect(aggMap.has('hard')).toBe(true);
    expect(aggMap.get('hard')).toBeGreaterThan(0);
    expect(aggMap.get('hard')).toBeLessThan(aggMap.get('reachable') as number);
  });

  it('omits travel neutrally when member travel or candidate coordinates are missing', async () => {
    const candidates = [
      {
        id: 'no-coords',
        venueNii: 35,
        priceTier: 2,
        raw: {},
      },
    ];
    const aggMap = new Map<string, number | null>([
      ['no-coords', 4],
    ]);

    await applyV2StructuredAdjustments(candidates, aggMap, {
      ...baseRequest(),
      participantTravel: [],
    });

    expect(aggMap.get('no-coords')).toBe(4);
  });
});
