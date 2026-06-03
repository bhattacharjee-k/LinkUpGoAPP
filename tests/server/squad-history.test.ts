import { describe, expect, it } from 'vitest';
import { buildSquadSummary, topCategoriesFromHistogram, type SquadPlan } from '../../server/squad-history';

function nycCrewFixture(): SquadPlan[] {
  return [
    {
      neighborhood: 'East Village',
      winner: {
        id: 'attaboy',
        name: 'Attaboy',
        category: 'Cocktails',
        tags: ['Cocktails', 'Speakeasy', 'Intimate'],
        budget: '$$$',
      },
      suggestions: [
        { id: 'attaboy', name: 'Attaboy', category: 'Cocktails', tags: ['Cocktails', 'Speakeasy', 'Intimate'], budget: '$$$' },
        { id: 'le-bain', name: 'Le Bain', category: 'Club', tags: ['Club', 'Rooftop', 'Loud'], budget: '$$$$' },
      ],
      votes: [
        { suggestionId: 'attaboy', voteType: 'up' },
        { suggestionId: 'le-bain', voteType: 'down', reasons: ['TOO_EXPENSIVE', 'NOT_MY_VIBE'] },
      ],
      feedback: [
        { suggestionId: 'attaboy', rating: 5, tags: ['great_vibe', 'perfect_size'], wouldRecommend: true },
      ],
    },
    {
      neighborhood: 'Lower East Side',
      winner: {
        id: 'ruffian',
        name: 'Ruffian',
        category: 'Wine Bar',
        tags: ['Wine Bar', 'Intimate', 'Hidden Gem'],
        budget: '$$',
      },
      suggestions: [
        { id: 'ruffian', name: 'Ruffian', category: 'Wine Bar', tags: ['Wine Bar', 'Intimate', 'Hidden Gem'], budget: '$$' },
        { id: 'marquee', name: 'Marquee', category: 'Club', tags: ['Club', 'Loud', 'Bottle Service'], budget: '$$$$' },
      ],
      votes: [
        { suggestionId: 'ruffian', voteType: 'up' },
        { suggestionId: 'marquee', voteType: 'down', reasons: ['NOT_MY_VIBE'] },
      ],
      feedback: [
        { suggestionId: 'ruffian', rating: 5, tags: ['great_vibe', 'hidden_gem'], wouldRecommend: true },
      ],
    },
    {
      neighborhood: 'East Village',
      winner: {
        id: 'rockwood',
        name: 'Rockwood Music Hall',
        category: 'Live Music',
        tags: ['Live Music', 'Intimate', 'Local'],
        budget: '$$',
      },
      suggestions: [
        { id: 'rockwood', name: 'Rockwood Music Hall', category: 'Live Music', tags: ['Live Music', 'Intimate', 'Local'], budget: '$$' },
        { id: 'webster', name: 'Webster Hall', category: 'Big Venue', tags: ['Big Venue', 'Loud', 'Crowded'], budget: '$$$' },
      ],
      votes: [
        { suggestionId: 'rockwood', voteType: 'up' },
        { suggestionId: 'webster', voteType: 'down', reasons: ['NOT_MY_VIBE'] },
      ],
      feedback: [
        { suggestionId: 'rockwood', rating: 4, tags: ['great_music', 'good_vibe'], wouldRecommend: true },
      ],
    },
  ];
}

describe('buildSquadSummary', () => {
  it('summarizes the seeded NYC crew as intimate, mid-priced, and anti-big-club', () => {
    const summary = buildSquadSummary(nycCrewFixture());

    expect(summary.categoryHistogram.Cocktails).toBeGreaterThan(0);
    expect(summary.categoryHistogram['Wine Bar']).toBeGreaterThan(0);
    expect(summary.categoryHistogram['Live Music']).toBeGreaterThan(0);
    expect(summary.categoryHistogram.Club ?? 0).toBe(0);
    expect(summary.categoryHistogram['Big Venue'] ?? 0).toBe(0);

    const text = summary.text.toLowerCase();
    expect(text).toContain('intimate');
    expect(text).toContain('mid-priced');
    expect(text).toMatch(/cocktails|wine bar|live music/);
    expect(summary.text).toContain('NOT_MY_VIBE');
    expect(summary.text.length).toBeLessThanOrEqual(600);
  });

  it('weights winner with good feedback above a merely seen category', () => {
    const summary = buildSquadSummary([
      {
        winner: {
          id: 'winner',
          name: 'Great Wine Bar',
          category: 'Wine Bar',
          tags: ['Wine Bar', 'Intimate'],
          budget: '$$',
        },
        suggestions: [
          { id: 'winner', name: 'Great Wine Bar', category: 'Wine Bar', tags: ['Wine Bar', 'Intimate'], budget: '$$' },
          { id: 'seen', name: 'Seen Arcade', category: 'Arcade', tags: ['Arcade'], budget: '$$' },
        ],
        feedback: [
          { suggestionId: 'winner', rating: 5, wouldRecommend: true, tags: ['great_vibe'] },
        ],
      },
    ]);

    expect(summary.categoryHistogram['Wine Bar']).toBeGreaterThan(summary.categoryHistogram.Arcade);
  });

  it('returns an empty summary for empty history', () => {
    expect(buildSquadSummary([])).toEqual({
      text: '',
      categoryHistogram: {},
    });
  });
});

describe('topCategoriesFromHistogram', () => {
  it('sorts by weight descending and tie-breaks alphabetically', () => {
    expect(
      topCategoriesFromHistogram({
        Cocktails: 10,
        'Wine Bar': 10,
        'Live Music': 5,
      }),
    ).toEqual(['Cocktails', 'Wine Bar', 'Live Music']);
  });

  it('drops zero and negative weights', () => {
    expect(
      topCategoriesFromHistogram({
        Cocktails: 3,
        Club: 0,
        Arcade: -2,
        'Wine Bar': 1,
      }),
    ).toEqual(['Cocktails', 'Wine Bar']);
  });

  it('caps results at n', () => {
    const histogram = {
      a: 9,
      b: 8,
      c: 7,
      d: 6,
      e: 5,
      f: 4,
      g: 3,
      h: 2,
    };
    expect(topCategoriesFromHistogram(histogram, 4)).toEqual(['a', 'b', 'c', 'd']);
    expect(topCategoriesFromHistogram(histogram)).toHaveLength(6);
  });
});
