import { niiRangeForLevel, type EnergyLevel } from '@shared/energy';

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export const HARD_UNREACHABLE_MULTIPLIER = 0.05;

export function niiMatchScore(venueNii: number, target: EnergyLevel): number {
  const { lo, hi } = niiRangeForLevel(target);
  const normalized = Math.min(100, Math.max(0, venueNii));
  if (normalized >= lo && normalized <= hi) return 1;

  const width = Math.max(1, hi - lo);
  const center = (lo + hi) / 2;
  const halfWidth = width / 2;
  const distanceFromCenter = Math.abs(normalized - center);
  const outsideDistance = Math.max(0, distanceFromCenter - halfWidth);

  return clamp01(1 / (1 + (outsideDistance / halfWidth) ** 2));
}

export function softBudgetScore(venuePriceTier: number, comfortTier: number, quality: number): number {
  const price = Math.min(4, Math.max(1, Math.round(venuePriceTier)));
  const comfort = Math.min(4, Math.max(1, Math.round(comfortTier)));
  const quality01 = clamp01(quality);

  if (price <= comfort) return 1;

  const over = price - comfort;
  if (over > 2) {
    return 0.05 + 0.05 * quality01;
  }

  const basePenalty = over / 2;
  const qualityRelief = 0.55 * quality01;
  return clamp01(Math.max(0.05, 1 - basePenalty * (1 - qualityRelief)));
}

/**
 * Bounded structured adjustment for PoLL aggregates.
 *
 * Formula:
 *   combined = average(niiMatch, softBudget, travel if present)
 *   adjusted = aggregate * (0.75 + 0.25 * combined)
 *
 * This keeps the LLM panel dominant: structured terms can only scale a non-null
 * aggregate by 0.75x..1.0x, never boost beyond the panel's original score.
 */
export function applyStructuredAdjustment(
  aggregate: number | null,
  terms: { niiMatch: number; softBudget: number; travel?: number },
): number | null {
  if (aggregate == null) return null;

  const presentTerms = [
    terms.niiMatch,
    terms.softBudget,
    terms.travel,
  ].filter((term): term is number => term !== undefined);
  const combined = presentTerms.reduce((sum, term) => sum + clamp01(term), 0) / presentTerms.length;
  const multiplier = 0.75 + 0.25 * combined;
  return aggregate * multiplier;
}

export function applyHardUnreachablePenalty(aggregate: number | null): number | null {
  if (aggregate == null) return null;
  return aggregate * HARD_UNREACHABLE_MULTIPLIER;
}
