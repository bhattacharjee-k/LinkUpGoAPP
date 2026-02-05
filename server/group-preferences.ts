import { devLog } from './logger';
import type { User, Session } from '@shared/schema';

export interface AggregatedGroupPreferences {
  city: string;
  categories: string[];
  commonCategories: string[];
  budgetRange: string[];
  preferredBudget: string;
  energyLevel: string;
  hardNos: string[];
  memberCount: number;
  discoveryStyle: 'hidden_gems' | 'popular' | 'mixed';
  crowdPreference: 'quiet' | 'buzzing' | 'no_preference';
  favoriteNeighborhoods: string[];
  timeWindow?: string;
  specificDate?: string;
  specificTime?: string;
  neighborhood?: string;
}

interface UserPreferences {
  id: string;
  name: string;
  city: string;
  budget: string[];
  energy: string;
  categories: string[];
  hardNos: string[];
  discoveryStyle?: string | null;
  crowdPreference?: string | null;
  favoriteNeighborhoods?: string[] | null;
}

export function aggregateGroupPreferences(
  users: UserPreferences[],
  session: Session
): AggregatedGroupPreferences {
  if (users.length === 0) {
    throw new Error('Cannot aggregate preferences for empty group');
  }

  const filters = session.filters as { 
    city?: string; 
    categories?: string[]; 
    timeWindow?: string;
    specificDate?: string;
    specificTime?: string;
  } | null;
  const guardrails = session.guardrails as { hardNos?: string[] } | null;

  // City from session or first user
  const city = filters?.city || users[0].city;

  // Aggregate categories - find common ones across users
  const categoryCounts = new Map<string, number>();
  users.forEach(user => {
    user.categories.forEach(cat => {
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    });
  });

  // Session-specified categories take priority
  const sessionCategories = filters?.categories || [];
  
  // Find categories that multiple users share
  const commonCategories = Array.from(categoryCounts.entries())
    .filter(([_, count]) => count >= Math.ceil(users.length / 2))
    .map(([cat]) => cat);

  // All unique categories for broader matching
  const allCategories = sessionCategories.length > 0 
    ? sessionCategories 
    : Array.from(categoryCounts.keys());

  // Aggregate budgets - find the intersection or widest acceptable range
  const budgetOrder = ['$', '$$', '$$$', '$$$$'];
  const allBudgets = new Set<string>();
  users.forEach(user => {
    user.budget.forEach(b => allBudgets.add(b));
  });
  const budgetRange = budgetOrder.filter(b => allBudgets.has(b));
  
  // Find most commonly accepted budget level
  const budgetCounts = new Map<string, number>();
  users.forEach(user => {
    user.budget.forEach(b => {
      budgetCounts.set(b, (budgetCounts.get(b) || 0) + 1);
    });
  });
  const preferredBudget = Array.from(budgetCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '$$';

  // Aggregate energy levels - find middle ground
  const energyOrder = ['Chill', 'Vibey', 'Going out', 'Full send'];
  const energyScores = users.map(u => energyOrder.indexOf(u.energy));
  const avgEnergy = Math.round(energyScores.reduce((a, b) => a + b, 0) / users.length);
  const energyLevel = energyOrder[Math.max(0, Math.min(avgEnergy, energyOrder.length - 1))];

  // Combine all hard nos from users and session guardrails
  const hardNosSet = new Set<string>();
  users.forEach(user => {
    user.hardNos.forEach(h => hardNosSet.add(h));
  });
  guardrails?.hardNos?.forEach(h => hardNosSet.add(h));
  const hardNos = Array.from(hardNosSet);

  // Discovery style - majority vote, default to mixed
  const discoveryVotes = { hidden_gems: 0, popular: 0, mixed: 0 };
  users.forEach(user => {
    const style = user.discoveryStyle as keyof typeof discoveryVotes || 'mixed';
    if (discoveryVotes.hasOwnProperty(style)) {
      discoveryVotes[style]++;
    } else {
      discoveryVotes.mixed++;
    }
  });
  const discoveryStyle = (Object.entries(discoveryVotes)
    .sort((a, b) => b[1] - a[1])[0][0]) as 'hidden_gems' | 'popular' | 'mixed';

  // Crowd preference - if anyone prefers quiet, lean quiet; if majority buzzing, go buzzing
  const crowdVotes = { quiet: 0, buzzing: 0, no_preference: 0 };
  users.forEach(user => {
    const pref = user.crowdPreference as keyof typeof crowdVotes || 'no_preference';
    if (crowdVotes.hasOwnProperty(pref)) {
      crowdVotes[pref]++;
    } else {
      crowdVotes.no_preference++;
    }
  });
  let crowdPreference: 'quiet' | 'buzzing' | 'no_preference' = 'no_preference';
  if (crowdVotes.quiet > 0 && crowdVotes.buzzing === 0) {
    crowdPreference = 'quiet';
  } else if (crowdVotes.buzzing > crowdVotes.quiet) {
    crowdPreference = 'buzzing';
  }

  // Aggregate favorite neighborhoods - union of all
  const neighborhoodSet = new Set<string>();
  users.forEach(user => {
    user.favoriteNeighborhoods?.forEach(n => neighborhoodSet.add(n));
  });
  const favoriteNeighborhoods = Array.from(neighborhoodSet);

  devLog('info', '[GroupPrefs] Aggregated preferences', {
    memberCount: users.length,
    commonCategories: commonCategories.length,
    budgetRange,
    energyLevel,
    discoveryStyle,
    crowdPreference,
  });

  return {
    city,
    categories: allCategories,
    commonCategories,
    budgetRange,
    preferredBudget,
    energyLevel,
    hardNos,
    memberCount: users.length,
    discoveryStyle,
    crowdPreference,
    favoriteNeighborhoods,
    timeWindow: filters?.timeWindow,
    specificDate: filters?.specificDate,
    specificTime: filters?.specificTime,
    neighborhood: session.neighborhood || undefined,
  };
}

export function buildSuggestionPrompt(prefs: AggregatedGroupPreferences): string {
  const parts: string[] = [];

  parts.push(`Find ${prefs.categories.slice(0, 3).join(', ')} options in ${prefs.city}`);
  
  if (prefs.neighborhood) {
    parts.push(`in or near ${prefs.neighborhood}`);
  }

  if (prefs.preferredBudget) {
    parts.push(`around ${prefs.preferredBudget} budget level`);
  }

  if (prefs.energyLevel) {
    parts.push(`with ${prefs.energyLevel.toLowerCase()} energy`);
  }

  if (prefs.crowdPreference && prefs.crowdPreference !== 'no_preference') {
    parts.push(prefs.crowdPreference === 'quiet' 
      ? 'preferring quieter, less crowded spots'
      : 'preferring popular, buzzing venues');
  }

  if (prefs.discoveryStyle === 'hidden_gems') {
    parts.push('focusing on hidden gems and lesser-known spots');
  } else if (prefs.discoveryStyle === 'popular') {
    parts.push('focusing on well-known popular venues');
  }

  if (prefs.memberCount > 4) {
    parts.push(`suitable for a group of ${prefs.memberCount} people`);
  }

  if (prefs.hardNos.length > 0) {
    parts.push(`avoiding: ${prefs.hardNos.slice(0, 5).join(', ')}`);
  }

  if (prefs.favoriteNeighborhoods.length > 0) {
    parts.push(`bonus if in: ${prefs.favoriteNeighborhoods.slice(0, 3).join(', ')}`);
  }

  return parts.join('. ') + '.';
}
