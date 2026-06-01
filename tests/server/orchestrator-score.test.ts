import { describe, expect, it } from 'vitest';
import {
  applyStructuredAdjustment,
  niiMatchScore,
  softBudgetScore,
} from '../../server/orchestrator/score';

describe('orchestrator structured score terms', () => {
  describe('niiMatchScore', () => {
    it('returns 1.0 when venue NII sits inside the target band', () => {
      expect(niiMatchScore(10, 'Chill')).toBe(1);
      expect(niiMatchScore(25, 'Vibey')).toBe(1);
      expect(niiMatchScore(64, 'Going out')).toBe(1);
      expect(niiMatchScore(90, 'Full send')).toBe(1);
    });

    it('decreases as NII moves away from the target band', () => {
      const near = niiMatchScore(52, 'Vibey');
      const far = niiMatchScore(90, 'Vibey');

      expect(near).toBeLessThan(1);
      expect(far).toBeLessThan(near);
    });

    it('scores opposite energy extremes low', () => {
      expect(niiMatchScore(90, 'Chill')).toBeLessThan(0.1);
      expect(niiMatchScore(10, 'Full send')).toBeLessThan(0.1);
    });
  });

  describe('softBudgetScore', () => {
    it('returns 1.0 when venue is within comfort tier', () => {
      expect(softBudgetScore(1, 2, 0)).toBe(1);
      expect(softBudgetScore(2, 2, 0.5)).toBe(1);
    });

    it('lets high-quality venues stretch above comfort more than low-quality venues', () => {
      const lowQuality = softBudgetScore(3, 2, 0.1);
      const highQuality = softBudgetScore(3, 2, 0.95);

      expect(highQuality).toBeGreaterThan(lowQuality);
      expect(highQuality).toBeLessThanOrEqual(1);
    });

    it('pushes far-over-comfort venues near zero without hard-excluding them', () => {
      const score = softBudgetScore(4, 1, 0.2);

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(0.1);
    });
  });

  describe('applyStructuredAdjustment', () => {
    it('passes null aggregates through unchanged', () => {
      expect(applyStructuredAdjustment(null, { niiMatch: 1, softBudget: 1 })).toBeNull();
    });

    it('keeps high structured terms above low structured terms for tied aggregates', () => {
      const aggregate = 4;
      const high = applyStructuredAdjustment(aggregate, { niiMatch: 1, softBudget: 1 });
      const low = applyStructuredAdjustment(aggregate, { niiMatch: 0, softBudget: 0 });

      expect(high).toBe(4);
      expect(low).toBe(3);
      expect(high).toBeGreaterThan(low);
    });

    it('keeps the swing within the documented 25 percent bound', () => {
      const aggregate = 4;
      const adjusted = applyStructuredAdjustment(aggregate, { niiMatch: 0, softBudget: 0 });

      expect(adjusted).toBeGreaterThanOrEqual(aggregate * 0.75);
      expect(adjusted).toBeLessThanOrEqual(aggregate);
    });

    it('uses a three-term average when travel is provided', () => {
      const adjusted = applyStructuredAdjustment(4, { niiMatch: 1, softBudget: 1, travel: 0 });

      expect(adjusted).toBeCloseTo(4 * (0.75 + 0.25 * (2 / 3)));
    });

    it('omitting travel preserves the two-term behavior', () => {
      const withoutTravel = applyStructuredAdjustment(4, { niiMatch: 1, softBudget: 0 });
      const equivalentTwoTerm = 4 * (0.75 + 0.25 * 0.5);

      expect(withoutTravel).toBeCloseTo(equivalentTwoTerm);
    });

    it('flips ordering of mock candidates when only structured terms differ', () => {
      const candidateA = applyStructuredAdjustment(4, { niiMatch: 0.05, softBudget: 0.1 });
      const candidateB = applyStructuredAdjustment(4, { niiMatch: 1, softBudget: 1 });

      expect(candidateA).not.toBeNull();
      expect(candidateB).not.toBeNull();
      expect(candidateB as number).toBeGreaterThan(candidateA as number);
    });
  });
});
