import { describe, expect, it } from 'vitest';
import { buildParticipantTravel } from '../../server/participant-travel';

describe('buildParticipantTravel', () => {
  it('includes active participants with a starting neighborhood', () => {
    const travel = buildParticipantTravel([
      {
        userId: 'u1',
        status: 'active',
        startingNeighborhood: 'Williamsburg',
        transportMode: 'walk',
        travelToleranceMin: 25,
      },
    ]);

    expect(travel).toEqual([
      {
        origin: 'Williamsburg',
        mode: 'walk',
        toleranceMin: 25,
      },
    ]);
  });

  it('skips no-neighborhood, left, and cant_make_it participants', () => {
    const travel = buildParticipantTravel([
      { userId: 'u1', status: 'active', startingNeighborhood: null, transportMode: 'walk' },
      { userId: 'u2', status: 'left', startingNeighborhood: 'Chelsea', transportMode: 'car' },
      { userId: 'u3', status: 'active', startingNeighborhood: '  ', transportMode: 'transit' },
      { userId: 'u4', status: 'cant_make_it', startingNeighborhood: 'Astoria', transportMode: 'transit' },
    ]);

    expect(travel).toEqual([]);
  });

  it('falls back from participant mode to user mode and then transit', () => {
    const travel = buildParticipantTravel([
      { userId: 'u1', status: 'active', startingNeighborhood: 'Chelsea', transportMode: null },
      { userId: 'u2', status: 'active', startingNeighborhood: 'SoHo', transportMode: 'bike' },
    ], [
      { id: 'u1', transportationMode: 'car' },
      { id: 'u2', transportationMode: 'bike' },
    ]);

    expect(travel).toEqual([
      { origin: 'Chelsea', mode: 'car' },
      { origin: 'SoHo', mode: 'transit' },
    ]);
  });
});
