import { and, eq, inArray } from 'drizzle-orm';
import type { Suggestion } from '@shared/schema';

export interface SquadPlan {
  winner?: {
    id?: string;
    name: string;
    category?: string | null;
    tags?: string[] | null;
    priceTier?: number | null;
    budget?: string | null;
  } | null;
  suggestions?: Array<{
    id: string;
    name: string;
    category?: string | null;
    tags?: string[] | null;
    priceTier?: number | null;
    budget?: string | null;
  }>;
  votes?: Array<{
    suggestionId: string;
    voteType: 'up' | 'down' | string;
    reasons?: string[] | null;
  }>;
  feedback?: Array<{
    suggestionId?: string | null;
    rating: number;
    tags?: string[] | null;
    wouldRecommend?: boolean | null;
    review?: string | null;
  }>;
  neighborhood?: string | null;
}

export interface SquadHistorySummary {
  text: string;
  categoryHistogram: Record<string, number>;
}

export function topCategoriesFromHistogram(histogram: Record<string, number>, n = 6): string[] {
  return Object.entries(histogram)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([key]) => key);
}

const SUMMARY_TEXT_LIMIT = 600;

function priceTierFromBudget(budget?: string | null): number | null {
  if (!budget) return null;
  return ({ '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 } as Record<string, number>)[budget] ?? null;
}

function categoryFor(item?: { category?: string | null; tags?: string[] | null } | null): string | null {
  return item?.category || item?.tags?.[0] || null;
}

function addWeight(map: Map<string, number>, key: string | null, delta: number): void {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + delta);
}

function topKeys(map: Map<string, number>, limit: number): string[] {
  return Array.from(map.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

function boundedText(text: string): string {
  if (text.length <= SUMMARY_TEXT_LIMIT) return text;
  return `${text.slice(0, SUMMARY_TEXT_LIMIT - 1).trimEnd()}…`;
}

function priceSummary(tiers: number[]): string {
  if (tiers.length === 0) return '';
  const min = Math.min(...tiers);
  const max = Math.max(...tiers);
  const avg = tiers.reduce((sum, tier) => sum + tier, 0) / tiers.length;
  if (min >= 2 && max <= 3) return 'mid-priced';
  if (min >= 1 && max <= 3 && avg >= 1.5) return 'mid-priced';
  if (max <= 2) return 'wallet-friendly';
  if (min >= 3) return 'splurgey';
  return 'mixed-budget';
}

export function buildSquadSummary(plans: SquadPlan[]): SquadHistorySummary {
  if (plans.length === 0) {
    return { text: '', categoryHistogram: {} };
  }

  const categoryWeights = new Map<string, number>();
  const positiveTags = new Map<string, number>();
  const negativeTags = new Map<string, number>();
  const downvoteReasons = new Map<string, number>();
  const neighborhoods = new Map<string, number>();
  const likedPriceTiers: number[] = [];

  for (const plan of plans) {
    const suggestionsById = new Map((plan.suggestions || []).map(suggestion => [suggestion.id, suggestion]));
    const winner = plan.winner || (plan.suggestions || []).find(s => s.id === plan.winner?.id) || null;
    const winnerCategory = categoryFor(winner);
    const winnerFeedback = (plan.feedback || []).filter(f => winner?.id && f.suggestionId === winner.id);
    const goodWinnerFeedback = winnerFeedback.filter(f => f.rating >= 4 && f.wouldRecommend !== false);

    if (winner && goodWinnerFeedback.length > 0) {
      addWeight(categoryWeights, winnerCategory, 6 * goodWinnerFeedback.length);
      for (const tag of winner.tags || []) addWeight(positiveTags, tag, 2);
      const tier = winner.priceTier ?? priceTierFromBudget(winner.budget);
      if (tier != null) likedPriceTiers.push(tier);
    } else if (winner) {
      addWeight(categoryWeights, winnerCategory, 3);
      for (const tag of winner.tags || []) addWeight(positiveTags, tag, 1);
    }

    for (const vote of plan.votes || []) {
      const suggestion = suggestionsById.get(vote.suggestionId);
      const category = categoryFor(suggestion);
      if (vote.voteType === 'up') {
        addWeight(categoryWeights, category, 1.5);
        for (const tag of suggestion?.tags || []) addWeight(positiveTags, tag, 0.5);
      } else if (vote.voteType === 'down') {
        addWeight(categoryWeights, category, -2);
        for (const tag of suggestion?.tags || []) addWeight(negativeTags, tag, 1);
        for (const reason of vote.reasons || []) addWeight(downvoteReasons, reason, 1);
      }
    }

    const actionedSuggestionIds = new Set([
      ...(plan.votes || []).map(v => v.suggestionId),
      ...(plan.feedback || []).map(f => f.suggestionId).filter((id): id is string => !!id),
      ...(winner?.id ? [winner.id] : []),
    ]);
    for (const suggestion of plan.suggestions || []) {
      if (!actionedSuggestionIds.has(suggestion.id)) {
        addWeight(categoryWeights, categoryFor(suggestion), 0.1);
      }
    }

    for (const feedback of plan.feedback || []) {
      const suggestion = feedback.suggestionId ? suggestionsById.get(feedback.suggestionId) : undefined;
      if (feedback.rating >= 4 && feedback.wouldRecommend !== false) {
        addWeight(categoryWeights, categoryFor(suggestion), 2);
        for (const tag of feedback.tags || []) addWeight(positiveTags, tag, 1);
      } else if (feedback.rating <= 2) {
        addWeight(categoryWeights, categoryFor(suggestion), -1.5);
        for (const tag of feedback.tags || []) addWeight(negativeTags, tag, 1);
      }
    }

    if (plan.neighborhood) addWeight(neighborhoods, plan.neighborhood, 1);
  }

  const categoryHistogram = Object.fromEntries(
    Array.from(categoryWeights.entries())
      .filter(([, value]) => value > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );

  const topCategories = topKeys(categoryWeights, 4);
  const topPositiveTags = topKeys(positiveTags, 4);
  const topNegativeTags = topKeys(negativeTags, 3);
  const topReasons = topKeys(downvoteReasons, 3);
  const topNeighborhoods = topKeys(neighborhoods, 2);
  const price = priceSummary(likedPriceTiers);

  const parts: string[] = [];
  const positiveShape = [...new Set([...topPositiveTags, ...topCategories])].slice(0, 5);
  if (positiveShape.length > 0) {
    parts.push(`This crew leans ${positiveShape.join('/').toLowerCase()}${price ? `, ${price}` : ''} spots`);
  }
  if (topNeighborhoods.length > 0) {
    parts.push(`often around ${topNeighborhoods.join(' and ')}`);
  }
  if (topNegativeTags.length > 0 || topReasons.length > 0) {
    const negative = [...topNegativeTags.map(t => t.toLowerCase()), ...topReasons].slice(0, 5);
    parts.push(`they have downvoted ${negative.join('/')} venues`);
  }

  return {
    text: boundedText(parts.join('; ') + (parts.length > 0 ? '.' : '')),
    categoryHistogram,
  };
}

function suggestionToPlanItem(suggestion: Suggestion): NonNullable<SquadPlan['suggestions']>[number] {
  return {
    id: suggestion.id,
    name: suggestion.name,
    category: suggestion.tags?.[0] || null,
    tags: suggestion.tags,
    budget: suggestion.budget,
    priceTier: priceTierFromBudget(suggestion.budget),
  };
}

export async function summarizeSquadHistory(groupId: string): Promise<SquadHistorySummary> {
  const [{ storage, db }, schema] = await Promise.all([
    import('./storage'),
    import('@shared/schema'),
  ]);

  const sessions = (await storage.getGroupSessions(groupId))
    .filter(session => session.status === 'locked' && !!session.winningOptionId);
  if (sessions.length === 0) {
    return { text: '', categoryHistogram: {} };
  }

  const plans: SquadPlan[] = [];
  for (const session of sessions) {
    const suggestions = await storage.getSessionSuggestions(session.id);
    const suggestionIds = suggestions.map(s => s.id);
    const [voteRows, feedbackRows] = suggestionIds.length > 0
      ? await Promise.all([
          db.select().from(schema.votes).where(inArray(schema.votes.suggestionId, suggestionIds)),
          db.select().from(schema.eventFeedback).where(and(
            eq(schema.eventFeedback.sessionId, session.id),
            inArray(schema.eventFeedback.suggestionId, suggestionIds),
          )),
        ])
      : [[], []];

    const planSuggestions = suggestions.map(suggestionToPlanItem);
    const winner = planSuggestions.find(suggestion => suggestion.id === session.winningOptionId) || null;
    plans.push({
      winner,
      suggestions: planSuggestions,
      votes: voteRows.map(vote => ({
        suggestionId: vote.suggestionId,
        voteType: vote.voteType,
        reasons: vote.reasons,
      })),
      feedback: feedbackRows.map(feedback => ({
        suggestionId: feedback.suggestionId,
        rating: feedback.rating,
        tags: feedback.tags,
        wouldRecommend: feedback.wouldRecommend,
        review: feedback.review,
      })),
      neighborhood: session.neighborhood,
    });
  }

  return buildSquadSummary(plans);
}
