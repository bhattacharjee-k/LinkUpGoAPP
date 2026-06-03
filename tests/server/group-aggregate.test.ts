import { describe, expect, it } from 'vitest';
import { buildGroupAggregate } from '../../server/group-aggregate';

describe('buildGroupAggregate', () => {
  describe('energy', () => {
    it('yields the correct ordinal-median target, spread, and split counts for a mixed fixture', () => {
      const members = [
        { energy: 'Chill', budgetTiers: [2] },
        { energy: 'Vibey', budgetTiers: [2] },
        { energy: 'Going out', budgetTiers: [2] },
      ];

      const result = buildGroupAggregate(members);

      expect(result.memberCount).toBe(3);
      expect(result.energy.target).toBe('Vibey');
      expect(result.energy.spread).toEqual(['Chill', 'Going out']);
      expect(result.energy.split).toEqual({
        Chill: 1,
        Vibey: 1,
        'Going out': 1,
      });
    });

    it('handles a larger mixed energy fixture correctly', () => {
      const members = [
        { energy: 'Chill', budgetTiers: [2] },
        { energy: 'Full send', budgetTiers: [2] },
        { energy: 'Full send', budgetTiers: [2] },
        { energy: 'Going out', budgetTiers: [2] },
      ];

      const result = buildGroupAggregate(members);

      expect(result.memberCount).toBe(4);
      // sorted: ['Chill', 'Going out', 'Full send', 'Full send']
      // lower median index: Math.floor((4 - 1) / 2) = 1 -> 'Going out'
      expect(result.energy.target).toBe('Going out');
      expect(result.energy.spread).toEqual(['Chill', 'Full send']);
      expect(result.energy.split).toEqual({
        Chill: 1,
        'Going out': 1,
        'Full send': 2,
      });
    });
  });

  describe('budget', () => {
    it('yields a sensible comfort tier and label for mixed comfortable tiers', () => {
      const members = [
        { energy: 'Vibey', budgetTiers: [1, 2] }, // median = 1.5
        { energy: 'Vibey', budgetTiers: [2, 3] }, // median = 2.5
        { energy: 'Vibey', budgetTiers: [3, 4] }, // median = 3.5
      ];
      // representativeTiers = [1.5, 2.5, 3.5] -> median = 2.5 -> rounded = 3

      const result = buildGroupAggregate(members);

      expect(result.budget.comfortTier).toBe(3);
      expect(result.budget.label).toBe('$$$');
    });

    it('handles single-tier preferences correctly', () => {
      const members = [
        { energy: 'Vibey', budgetTiers: [1] },
        { energy: 'Vibey', budgetTiers: [2] },
        { energy: 'Vibey', budgetTiers: [2] },
      ];
      // representativeTiers = [1, 2, 2] -> median = 2 -> rounded = 2

      const result = buildGroupAggregate(members);

      expect(result.budget.comfortTier).toBe(2);
      expect(result.budget.label).toBe('$$');
    });

    it('handles undefined or null budgetTiers gracefully', () => {
      const members = [
        { energy: 'Vibey', budgetTiers: undefined },
        { energy: 'Vibey', budgetTiers: null },
        { energy: 'Vibey', budgetTiers: [2] },
      ];
      // getMedian(undefined) -> 2
      // getMedian(null) -> 2
      // getMedian([2]) -> 2
      // representativeTiers = [2, 2, 2] -> median = 2 -> rounded = 2

      const result = buildGroupAggregate(members);

      expect(result.budget.comfortTier).toBe(2);
      expect(result.budget.label).toBe('$$');
    });
  });

  describe('travel', () => {
    it('passes through per-member logistics correctly with names allowed', () => {
      const members = [
        {
          energy: 'Vibey',
          budgetTiers: [2],
          travel: {
            name: 'Alice',
            neighborhood: 'East Village',
            mode: 'Walk',
            toleranceMin: 15,
          },
        },
        {
          energy: 'Vibey',
          budgetTiers: [2],
          travel: {
            name: 'Bob',
            neighborhood: 'Lower East Side',
            mode: 'Transit',
            toleranceMin: 30,
          },
        },
        {
          energy: 'Vibey',
          budgetTiers: [2],
          travel: {
            name: 'Charlie',
            neighborhood: null,
            mode: null,
            toleranceMin: null,
          },
        },
      ];

      const result = buildGroupAggregate(members);

      expect(result.travel.members).toHaveLength(3);
      expect(result.travel.members[0]).toEqual({
        name: 'Alice',
        neighborhood: 'East Village',
        mode: 'Walk',
        toleranceMin: 15,
      });
      expect(result.travel.members[1]).toEqual({
        name: 'Bob',
        neighborhood: 'Lower East Side',
        mode: 'Transit',
        toleranceMin: 30,
      });
      expect(result.travel.members[2]).toEqual({
        name: 'Charlie',
        neighborhood: null,
        mode: null,
        toleranceMin: null,
      });
    });
  });

  describe('ANONYMITY', () => {
    it('ensures that energy and budget parts contain NO user names or ids from the input', () => {
      const members = [
        {
          energy: 'Chill',
          budgetTiers: [1],
          travel: {
            name: 'Alice-12345',
            neighborhood: 'East Village',
            mode: 'Walk',
            toleranceMin: 15,
          },
          // Adding an extra field to simulate user ID just in case
          userId: 'Alice-12345',
        } as any,
        {
          energy: 'Going out',
          budgetTiers: [3],
          travel: {
            name: 'Bob-67890',
            neighborhood: 'Lower East Side',
            mode: 'Transit',
            toleranceMin: 30,
          },
          userId: 'Bob-67890',
        } as any,
      ];

      const result = buildGroupAggregate(members);

      // Verify the travel part has the names (as allowed)
      expect(result.travel.members[0].name).toBe('Alice-12345');
      expect(result.travel.members[1].name).toBe('Bob-67890');

      // Verify anonymity in energy
      const energyStr = JSON.stringify(result.energy);
      expect(energyStr).not.toContain('Alice-12345');
      expect(energyStr).not.toContain('Bob-67890');

      // Verify anonymity in budget
      const budgetStr = JSON.stringify(result.budget);
      expect(budgetStr).not.toContain('Alice-12345');
      expect(budgetStr).not.toContain('Bob-67890');
    });
  });

  describe('empty members', () => {
    it('yields the documented defaults when input is empty', () => {
      const result = buildGroupAggregate([]);

      expect(result).toEqual({
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
      });
    });

    it('yields the documented defaults when input is null or undefined', () => {
      expect(buildGroupAggregate(null as any)).toEqual({
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
      });

      expect(buildGroupAggregate(undefined as any)).toEqual({
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
      });
    });
  });
});
