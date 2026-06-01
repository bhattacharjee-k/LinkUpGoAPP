import type { SuggestRequest } from './suggestions';

type TravelMode = 'walk' | 'transit' | 'car';

interface ParticipantTravelRow {
  userId: string;
  status: string;
  startingNeighborhood?: string | null;
  transportMode?: string | null;
  travelToleranceMin?: number | null;
}

interface UserTravelFallback {
  id: string;
  transportationMode?: string | null;
}

function isTravelMode(value: unknown): value is TravelMode {
  return value === 'walk' || value === 'transit' || value === 'car';
}

export function buildParticipantTravel(
  participants: ParticipantTravelRow[],
  users: UserTravelFallback[] = [],
): SuggestRequest['participantTravel'] {
  const usersById = new Map(users.map(user => [user.id, user]));

  return participants
    // Only active attendees constrain reachability — a 'cant_make_it' (or 'left')
    // participant isn't coming, so their travel tolerance must not gate venues.
    .filter(participant => participant.status === 'active' && !!participant.startingNeighborhood?.trim())
    .map(participant => {
      const userMode = usersById.get(participant.userId)?.transportationMode;
      const mode = isTravelMode(participant.transportMode)
        ? participant.transportMode
        : isTravelMode(userMode)
          ? userMode
          : 'transit';

      return {
        origin: participant.startingNeighborhood!.trim(),
        mode,
        ...(participant.travelToleranceMin != null ? { toleranceMin: participant.travelToleranceMin } : {}),
      };
    });
}
