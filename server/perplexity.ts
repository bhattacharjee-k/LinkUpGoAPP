import { devLog } from './logger';
import { LRUCache } from './cache';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';

// Cache for Perplexity results (5 minute TTL)
const perplexityCache = new LRUCache<PerplexitySearchResult>({
  ttlMs: 5 * 60 * 1000,
  maxSize: 50,
});

export interface PerplexitySearchResult {
  answer: string;
  citations: string[];
  model: string;
}

export interface VenueValidation {
  isValid: boolean;
  qualityScore: number; // 0-100
  highlights: string[];
  concerns: string[];
  recentInfo: string;
  citations: string[];
}

export interface GroupContext {
  city: string;
  categories: string[];
  budget?: string;
  energy?: string;
  memberCount: number;
  timeWindow?: string;
  preferences: {
    discoveryStyle?: string;
    crowdPreference?: string;
    favoriteNeighborhoods?: string[];
  };
}

export async function searchPerplexity(query: string): Promise<PerplexitySearchResult | null> {
  if (!PERPLEXITY_API_KEY) {
    devLog('warn', '[Perplexity] API key not configured');
    return null;
  }

  const cacheKey = query.toLowerCase().trim();
  const cached = perplexityCache.get(cacheKey);
  if (cached) {
    devLog('info', '[Perplexity] Cache hit for query');
    return cached.data;
  }

  try {
    const response = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that provides concise, factual information about venues, restaurants, bars, and events. Focus on recent reviews, current status, and quality indicators.'
          },
          {
            role: 'user',
            content: query
          }
        ],
        max_tokens: 500,
        temperature: 0.2,
        top_p: 0.9,
        return_images: false,
        return_related_questions: false,
        search_recency_filter: 'month',
        stream: false,
      }),
    });

    if (!response.ok) {
      devLog('error', `[Perplexity] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const result: PerplexitySearchResult = {
      answer: data.choices?.[0]?.message?.content || '',
      citations: data.citations || [],
      model: data.model || 'unknown',
    };

    perplexityCache.set(cacheKey, result);
    devLog('info', '[Perplexity] Search completed', { citationCount: result.citations.length });
    return result;
  } catch (error) {
    devLog('error', '[Perplexity] Request failed', { error });
    return null;
  }
}

export async function validateVenue(
  venueName: string,
  city: string,
  categories: string[]
): Promise<VenueValidation> {
  const query = `What are recent reviews and current status of "${venueName}" in ${city}? Is it still open? What do people say about the atmosphere, quality, and experience? Any recent issues or closures?`;
  
  const result = await searchPerplexity(query);
  
  if (!result || !result.answer) {
    return {
      isValid: true, // Assume valid if we can't verify
      qualityScore: 70, // Default neutral score
      highlights: [],
      concerns: [],
      recentInfo: 'Unable to verify current status',
      citations: [],
    };
  }

  // Parse the response to extract validation signals
  const answer = result.answer.toLowerCase();
  const highlights: string[] = [];
  const concerns: string[] = [];
  
  // Positive signals
  const positivePatterns = [
    { pattern: /highly rated|excellent|outstanding|must-visit|popular|beloved/i, label: 'Highly rated' },
    { pattern: /great atmosphere|amazing vibe|fantastic ambiance/i, label: 'Great atmosphere' },
    { pattern: /fresh ingredients|quality food|delicious/i, label: 'Quality food' },
    { pattern: /friendly staff|great service/i, label: 'Great service' },
    { pattern: /unique|special|one-of-a-kind/i, label: 'Unique experience' },
    { pattern: /trendy|hot spot|buzzing/i, label: 'Currently trending' },
  ];

  // Negative signals
  const negativePatterns = [
    { pattern: /permanently closed|closed down|shut down/i, label: 'May be closed' },
    { pattern: /declined|worse|disappointing lately/i, label: 'Quality concerns' },
    { pattern: /overpriced|expensive for what you get/i, label: 'Overpriced' },
    { pattern: /crowded|long wait|hard to get in/i, label: 'Very crowded/long waits' },
    { pattern: /rude staff|poor service/i, label: 'Service issues' },
    { pattern: /health violation|hygiene|cleanliness/i, label: 'Cleanliness concerns' },
  ];

  for (const { pattern, label } of positivePatterns) {
    if (pattern.test(result.answer)) {
      highlights.push(label);
    }
  }

  for (const { pattern, label } of negativePatterns) {
    if (pattern.test(result.answer)) {
      concerns.push(label);
    }
  }

  // Check if venue appears to be closed
  const isClosed = /permanently closed|closed down|no longer open/i.test(result.answer);
  
  // Calculate quality score based on signals
  let qualityScore = 70; // Start at neutral
  qualityScore += highlights.length * 8;
  qualityScore -= concerns.length * 12;
  if (isClosed) qualityScore = 0;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  return {
    isValid: !isClosed,
    qualityScore,
    highlights: highlights.slice(0, 3),
    concerns: concerns.slice(0, 2),
    recentInfo: result.answer.slice(0, 300),
    citations: result.citations.slice(0, 3),
  };
}

export async function discoverTrendingVenues(
  city: string,
  categories: string[],
  preferences?: { crowdPreference?: string; discoveryStyle?: string }
): Promise<string[]> {
  const categoryList = categories.slice(0, 3).join(', ');
  const vibeHint = preferences?.crowdPreference === 'quiet' 
    ? 'hidden gems and quieter spots' 
    : preferences?.crowdPreference === 'buzzing'
    ? 'popular and buzzing venues'
    : 'interesting spots';
  
  const query = `What are the best ${vibeHint} for ${categoryList} in ${city} right now? Focus on places that opened recently or are currently trending. List just the venue names.`;
  
  const result = await searchPerplexity(query);
  
  if (!result || !result.answer) {
    return [];
  }

  // Extract venue names from the response (rough parsing)
  const venueMatches = result.answer.match(/[""]([^""]+)[""]/g) || [];
  const venues = venueMatches.map(v => v.replace(/[""]|[""]/g, '').trim()).filter(v => v.length > 2);
  
  return venues.slice(0, 5);
}

export async function generateWhyExplanation(
  venueName: string,
  venueDescription: string,
  groupContext: GroupContext,
  validationResult?: VenueValidation
): Promise<string> {
  // Build context from group preferences
  const budgetText = groupContext.budget ? `${groupContext.budget} budget` : 'flexible budget';
  const vibeText = groupContext.energy || 'any vibe';
  const categoryText = groupContext.categories.slice(0, 3).join(', ');
  const crowdPref = groupContext.preferences.crowdPreference;
  
  let explanation = '';

  // Start with category match
  if (groupContext.categories.length > 0) {
    explanation += `Perfect for ${categoryText}. `;
  }

  // Add validation highlights
  if (validationResult?.highlights && validationResult.highlights.length > 0) {
    explanation += validationResult.highlights.slice(0, 2).join(' • ') + '. ';
  }

  // Add crowd match
  if (crowdPref && crowdPref !== 'no_preference') {
    const crowdMatch = crowdPref === 'quiet' 
      ? 'Quieter atmosphere your group prefers. '
      : 'Buzzing energy your group loves. ';
    explanation += crowdMatch;
  }

  // Add budget fit
  if (groupContext.budget) {
    explanation += `Fits your ${budgetText}. `;
  }

  // Add group size consideration
  if (groupContext.memberCount > 4) {
    explanation += 'Great for larger groups. ';
  }

  // Fallback to basic explanation
  if (!explanation.trim()) {
    explanation = `Popular spot in ${groupContext.city} matching your search.`;
  }

  return explanation.trim();
}

export async function batchValidateVenues(
  venues: Array<{ name: string; city: string }>,
  categories: string[]
): Promise<Map<string, VenueValidation>> {
  const results = new Map<string, VenueValidation>();
  
  // Process in parallel with rate limiting (max 3 concurrent)
  const batchSize = 3;
  for (let i = 0; i < venues.length; i += batchSize) {
    const batch = venues.slice(i, i + batchSize);
    const validations = await Promise.all(
      batch.map(v => validateVenue(v.name, v.city, categories))
    );
    batch.forEach((venue, idx) => {
      results.set(venue.name, validations[idx]);
    });
  }

  return results;
}
