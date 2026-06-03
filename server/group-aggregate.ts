import { aggregateEnergy, toEnergyLevel, type EnergyLevel } from '@shared/energy';

export interface GroupAggregate {
  memberCount: number;
  energy: {
    target: EnergyLevel;
    spread: [EnergyLevel, EnergyLevel];
    split: Record<string, number>;
  };
  budget: {
    comfortTier: number;
    label: string;
  };
  travel: {
    members: Array<{
      name: string;
      neighborhood: string | null;
      mode: string | null;
      toleranceMin: number | null;
    }>;
  };
}

export function buildGroupAggregate(members: Array<{
  energy: string;
  budgetTiers?: number[] | null;
  travel?: {
    name: string;
    neighborhood?: string | null;
    mode?: string | null;
    toleranceMin?: number | null;
  };
}>): GroupAggregate {
  if (!members || members.length === 0) {
    return {
      memberCount: 0,
      energy: {
        target: 'Vibey',
        spread: ['Vibey', 'Vibey'],
        split: {},
      },
      budget: {
        comfortTier: 2,
        label: '$$',
      },
      travel: {
        members: [],
      },
    };
  }

  // Calculate energy using aggregateEnergy and toEnergyLevel from @shared/energy
  const energies = members.map(m => toEnergyLevel(m.energy));
  const { target, spread } = aggregateEnergy(energies);

  // split: count of members per band (anonymous counts)
  const split: Record<string, number> = {};
  for (const energy of energies) {
    split[energy] = (split[energy] || 0) + 1;
  }

  // budget: comfortTier = rounded median of each member's representative tier
  // e.g. min or median of their budgetTiers; label = '$'.repeat(comfortTier)
  const getMedian = (arr: number[] | null | undefined): number => {
    if (!arr || arr.length === 0) return 2;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) {
      return sorted[mid];
    }
    return (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const representativeTiers = members.map(m => getMedian(m.budgetTiers));
  const comfortTier = Math.min(4, Math.max(1, Math.round(getMedian(representativeTiers))));
  const label = '$'.repeat(comfortTier);

  // travel: pass through per-member logistics (name allowed)
  const travelMembers = members
    .filter(m => m.travel)
    .map(m => ({
      name: m.travel!.name,
      neighborhood: m.travel!.neighborhood ?? null,
      mode: m.travel!.mode ?? null,
      toleranceMin: m.travel!.toleranceMin ?? null,
    }));

  return {
    memberCount: members.length,
    energy: {
      target,
      spread,
      split,
    },
    budget: {
      comfortTier,
      label,
    },
    travel: {
      members: travelMembers,
    },
  };
}
