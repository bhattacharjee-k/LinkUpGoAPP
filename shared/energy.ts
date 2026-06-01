export const ENERGY_LEVELS = ['Chill', 'Vibey', 'Going out', 'Full send'] as const;
export const HIGH_ENERGY_LEVELS = ['Going out', 'Full send'] as const;

export type EnergyLevel = typeof ENERGY_LEVELS[number];

export interface EnergyBand {
  rank: number;
  niiLo: number;
  niiHi: number;
  anchor: string;
}

export const ENERGY_BANDS: Record<EnergyLevel, EnergyBand> = {
  Chill: {
    rank: 1,
    niiLo: 0,
    niiHi: 25,
    anchor: 'Show up as you are - dive-bar easy, home whenever.',
  },
  Vibey: {
    rank: 2,
    niiLo: 25,
    niiHi: 50,
    anchor: 'Dressed but easy - cool bar, reasonable bedtime.',
  },
  'Going out': {
    rank: 3,
    niiLo: 50,
    niiHi: 78,
    anchor: 'A real night - drinks & dancing, out late.',
  },
  'Full send': {
    rank: 4,
    niiLo: 78,
    niiHi: 100,
    anchor: 'All-out - clubs, big money, 4-5am.',
  },
};

export const NII_WEIGHTS = {
  spend: 0.20,
  lateness: 0.30,
  intensity: 0.30,
  crowd: 0.20,
} as const;

interface NiiFeatures {
  spend: number;
  lateness: number;
  intensity: number;
  crowd: number;
}

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

export function nii(features: NiiFeatures): number {
  const weighted =
    NII_WEIGHTS.spend * clamp(features.spend, 0, 1) +
    NII_WEIGHTS.lateness * clamp(features.lateness, 0, 1) +
    NII_WEIGHTS.intensity * clamp(features.intensity, 0, 1) +
    NII_WEIGHTS.crowd * clamp(features.crowd, 0, 1);

  return clamp(weighted * 100, 0, 100);
}

export function isEnergyLevel(value: unknown): value is EnergyLevel {
  return typeof value === 'string' && (ENERGY_LEVELS as readonly string[]).includes(value);
}

export function toEnergyLevel(value: unknown, fallback: EnergyLevel = 'Vibey'): EnergyLevel {
  return isEnergyLevel(value) ? value : fallback;
}

export function bandForNii(value: number): EnergyLevel {
  const normalized = clamp(value, 0, 100);
  if (normalized < ENERGY_BANDS.Vibey.niiLo) return 'Chill';
  if (normalized < ENERGY_BANDS['Going out'].niiLo) return 'Vibey';
  if (normalized < ENERGY_BANDS['Full send'].niiLo) return 'Going out';
  return 'Full send';
}

export function niiRangeForLevel(level: EnergyLevel): { lo: number; hi: number } {
  const band = ENERGY_BANDS[level];
  return { lo: band.niiLo, hi: band.niiHi };
}

export function niiCenterForLevel(level: EnergyLevel): number {
  const { lo, hi } = niiRangeForLevel(level);
  return (lo + hi) / 2;
}

export function aggregateEnergy(levels: EnergyLevel[]): {
  target: EnergyLevel;
  spread: [EnergyLevel, EnergyLevel];
} {
  if (levels.length === 0) {
    return { target: 'Vibey', spread: ['Vibey', 'Vibey'] };
  }

  const sorted = [...levels].sort((a, b) => ENERGY_BANDS[a].rank - ENERGY_BANDS[b].rank);
  const lowerMedianIndex = Math.floor((sorted.length - 1) / 2);

  return {
    target: sorted[lowerMedianIndex],
    spread: [sorted[0], sorted[sorted.length - 1]],
  };
}

export function isHighEnergy(level?: unknown): boolean {
  return isEnergyLevel(level) && ENERGY_BANDS[level].rank >= ENERGY_BANDS['Going out'].rank;
}
