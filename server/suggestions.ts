import { getSearchCenter, haversineDistance, isWithinCity, LatLng } from './geo';
import { devLog } from './logger';
import { discoverTrendingVenues, discoverVenuesFromQuery } from './perplexity';
import { synthesizeContext, validateAndRankSuggestions, OrchestratorBrief } from './orchestrator';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// Bucket types for diversity-first generation
export type GenerationType = 'safe' | 'explore' | 'wildcard';

export interface SuggestionOption {
  optionType: 'place' | 'event';
  title: string;
  description: string;
  address: string;
  city: string;
  lat?: number;
  lng?: number;
  rating?: string;
  ratingCount?: number;
  priceLevel?: string;
  distance?: string;
  tags: string[];
  detailUrl?: string | null;
  reservationUrl?: string | null;
  ticketUrl?: string | null;
  eventUrl?: string | null;
  startTime?: string;
  venueName?: string;
  source: string;
  score?: number;
  generationType?: GenerationType;
  placeId?: string;
  eventId?: string;
  whyExplanation?: string;
  openNow?: boolean;
  openingHoursText?: string[];
}

export interface SuggestRequest {
  city: string;
  neighborhood?: string;
  userLat?: number;
  userLng?: number;
  categories: string[];
  budget?: string;
  energy?: string;
  timeWindow?: string;
  specificDate?: string;
  specificTime?: string;
  vibeDescription?: string;
  discoveryStyle?: 'hidden_gems' | 'popular' | 'mixed';
  crowdPreference?: 'quiet' | 'buzzing' | 'no_preference';
  favoriteNeighborhoods?: string[];
}

interface SuggestMeta {
  city: string;
  centerLatLng: LatLng;
  radiusMeters: number;
  placesCount: number;
  eventsCount: number;
  filteredCount: number;
  bucketCounts?: {
    safe: number;
    explore: number;
    wildcard: number;
  };
  dedupedCount?: number;
}

// Downvote reason learning - stored per session for influencing generation
export interface DownvoteReasonAggregates {
  tooFar: number;
  notMyVibe: number;
  tooExpensive: number;
  tooCrowded: number;
  other: number;
}

// Reference Profile - derived signals from reference venues
export interface ReferenceProfile {
  preferredPriceTier: number; // 1-4 average
  priceTolerance: number; // How much variance to allow
  preferredTypes: string[]; // Weighted venue types
  qualityFloor: number; // Rating bias (not filter)
  neighborhoodTolerance: number; // Distance user travels
  energyBias: 'day' | 'night' | 'mixed'; // Late-night vs daytime
  hasConflicts: boolean; // Conflicting reference styles
}

// Bucket generation parameters
interface BucketParams {
  minRating: number;
  minReviewCount: number;
  radiusMultiplier: number;
  allowAdjacentCategories: boolean;
  count: number;
}

const categoryToPlaceTypes: Record<string, string[]> = {
  'Dinner': ['restaurant'],
  'Brunch': ['restaurant', 'cafe'],
  'Coffee': ['cafe'],
  'Cocktails': ['bar'],
  'Wine Bar': ['bar'],
  'Brewery': ['bar'],
  'Dive Bar': ['bar'],
  'Rooftop': ['bar', 'restaurant'],
  'Speakeasy': ['bar'],
  'Club': ['night_club'],
  'Live Music': ['night_club', 'bar'],
  'Dancing': ['night_club'],
  'Lounge': ['bar'],
  'Activity': ['bowling_alley', 'amusement_center'],
  'Bowling': ['bowling_alley'],
  'Karaoke': ['bar', 'night_club'],
  'Comedy': ['performing_arts_theater'],
  'Arcade': ['amusement_center'],
  'Museum': ['museum'],
  'Walk': ['park'],
  'Conversation': ['cafe', 'restaurant'],
  'Meeting New People': ['bar', 'cafe'],
  'Big Group': ['restaurant', 'bar'],
  'Date Night': ['restaurant', 'bar'],
  'Drinks': ['bar', 'night_club'],
  'Food': ['restaurant'],
  'Culture': ['museum', 'art_gallery', 'performing_arts_theater'],
  'Active': ['gym', 'park', 'bowling_alley'],
  'Chill': ['cafe', 'restaurant', 'park'],
};

const categoryToTicketmaster: Record<string, string> = {
  'Live Music': 'music',
  'Club': 'music',
  'Dancing': 'music',
  'Drinks': 'music',
  'Rooftop': 'music',
  'Lounge': 'music',
  'Comedy': 'arts & theatre',
  'Culture': 'arts & theatre',
  'Museum': 'arts & theatre',
  'Active': 'sports',
  'Big Group': 'music',
  'Date Night': 'music',
};

const priceLevelMap: Record<string, string> = {
  'PRICE_LEVEL_INEXPENSIVE': '$',
  'PRICE_LEVEL_MODERATE': '$$',
  'PRICE_LEVEL_EXPENSIVE': '$$$',
  'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
};

const suggestionsCache = new Map<string, { options: SuggestionOption[]; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

function isLateNight(specificTime?: string, timeWindow?: string): boolean {
  if (specificTime) {
    const startHour = parseInt(specificTime.split('-')[0]?.split(':')[0] || '19', 10);
    return startHour >= 21 || startHour <= 4;
  }
  if (timeWindow) {
    return timeWindow.toLowerCase().includes('night');
  }
  return false;
}

function isHighEnergy(energy?: string): boolean {
  return energy === 'Going out' || energy === 'Full send';
}

const nightlifeTypes = ['night_club', 'bar'];
const nightlifeCategories = ['Club', 'Dancing', 'Live Music', 'Lounge', 'Speakeasy', 'Cocktails', 'Drinks', 'Karaoke', 'Dive Bar'];
const restaurantTypes = ['restaurant', 'cafe'];

function getTimeAwareTypes(categories: string[], specificTime?: string, timeWindow?: string, energy?: string): string[] {
  const placeTypes = new Set<string>();
  for (const cat of categories) {
    const types = categoryToPlaceTypes[cat] || categoryToPlaceTypes['Drinks'];
    types.forEach(t => placeTypes.add(t));
  }

  const lateNight = isLateNight(specificTime, timeWindow);
  const highEnergy = isHighEnergy(energy);

  if (lateNight || highEnergy) {
    placeTypes.add('night_club');
    placeTypes.add('bar');

    if (lateNight) {
      placeTypes.delete('cafe');
      placeTypes.delete('museum');
      placeTypes.delete('park');
    }
  }

  console.log(`[Suggestions] Time-aware types: lateNight=${lateNight}, highEnergy=${highEnergy}, types=[${Array.from(placeTypes).join(', ')}]`);
  return Array.from(placeTypes);
}

function getTimeAwareTicketmasterClasses(categories: string[], specificTime?: string, timeWindow?: string, energy?: string): string[] {
  const classes = new Set<string>();
  for (const cat of categories) {
    if (categoryToTicketmaster[cat]) {
      classes.add(categoryToTicketmaster[cat]);
    }
  }

  if (isLateNight(specificTime, timeWindow) || isHighEnergy(energy)) {
    classes.add('music');
  }

  return Array.from(classes);
}

const restaurantSignals = [
  'restaurant', 'cafe', 'eatery', 'dining', 'brunch', 'bistro', 'trattoria',
  'steakhouse', 'grill', 'kitchen', 'diner', 'pizzeria', 'sushi', 'ramen',
  'coffee', 'bakery', 'ice cream', 'dessert', 'tea house', 'juice',
];

function looksLikeRestaurant(opt: SuggestionOption): boolean {
  const tags = opt.tags.map(t => t.toLowerCase());
  const titleLower = opt.title.toLowerCase();
  const descLower = (opt.description || '').toLowerCase();
  
  if (tags.some(t => restaurantSignals.some(r => t.includes(r)))) return true;
  if (restaurantSignals.some(r => titleLower.includes(r))) return true;
  if (descLower.includes('restaurant') || descLower.includes('dining') || descLower.includes('cuisine')) return true;
  
  const knownRestaurants = ['dearborn', 'aba ', 'girl & the goat', 'alinea', 'au cheval', 'bavette', 'momotaro'];
  if (knownRestaurants.some(r => titleLower.includes(r))) return true;
  
  return false;
}

function scoreTimeAppropriateness(opt: SuggestionOption, specificTime?: string, timeWindow?: string, energy?: string): number {
  const lateNight = isLateNight(specificTime, timeWindow);
  const highEnergy = isHighEnergy(energy);
  const tags = opt.tags.map(t => t.toLowerCase());

  if (!lateNight && !highEnergy) return 0;

  const isNightclub = tags.some(t => t.includes('night_club') || t.includes('night club'));
  const isBar = tags.some(t => t.includes('bar'));
  const isEvent = opt.optionType === 'event';
  const isRestaurantLike = looksLikeRestaurant(opt);
  const isTrending = tags.some(t => t.includes('perplexity'));

  let score = 0;
  if (isNightclub) score += 20;
  if (isBar && !isRestaurantLike) score += 12;
  if (isEvent) score += 15;
  if (isTrending) score += 10;
  
  if (isRestaurantLike && lateNight) score -= 25;
  if (isBar && isRestaurantLike && lateNight) score -= 10;

  return score;
}

// Bucket parameters for each generation type
const BUCKET_PARAMS: Record<GenerationType, BucketParams> = {
  safe: {
    minRating: 4.4,
    minReviewCount: 50,
    radiusMultiplier: 1.0,
    allowAdjacentCategories: false,
    count: 2,
  },
  explore: {
    minRating: 3.8,
    minReviewCount: 0, // Allow newer places with fewer reviews
    radiusMultiplier: 1.25, // 25% expanded radius
    allowAdjacentCategories: true,
    count: 2,
  },
  wildcard: {
    minRating: 3.5,
    minReviewCount: 0,
    radiusMultiplier: 1.3, // 30% expanded radius
    allowAdjacentCategories: true,
    count: 1,
  },
};

// Adjust bucket counts based on user's discovery style preference
function getDiscoveryAdjustedCounts(discoveryStyle?: string): { safe: number; explore: number; wildcard: number } {
  switch (discoveryStyle) {
    case 'hidden_gems':
      // Favor explore and wildcard buckets for unique finds
      return { safe: 1, explore: 3, wildcard: 1 };
    case 'popular':
      // Favor safe bucket with proven favorites
      return { safe: 3, explore: 1, wildcard: 1 };
    case 'mixed':
    default:
      // Balanced approach
      return { safe: 2, explore: 2, wildcard: 1 };
  }
}

// Adjust min review count thresholds based on discovery style
function getReviewCountThresholds(discoveryStyle?: string): { safeMin: number; exploreMax: number } {
  switch (discoveryStyle) {
    case 'hidden_gems':
      // Lower minimum for safe (allow lesser-known), lower max for explore
      return { safeMin: 20, exploreMax: 150 };
    case 'popular':
      // Higher minimum for safe (well-established), higher max for explore
      return { safeMin: 100, exploreMax: 500 };
    case 'mixed':
    default:
      return { safeMin: 50, exploreMax: 200 };
  }
}

// Estimate crowd level based on review count and venue type
// Higher review count typically correlates with busier/more popular venues
function estimateCrowdLevel(opt: SuggestionOption): 'quiet' | 'buzzing' | 'unknown' {
  const reviewCount = opt.ratingCount || 0;
  const tags = opt.tags || [];
  
  // Quiet indicators
  const quietTypes = ['cafe', 'museum', 'park', 'wine_bar'];
  const isQuietType = tags.some(t => quietTypes.some(qt => t.toLowerCase().includes(qt)));
  
  // Buzzing indicators
  const buzzingTypes = ['club', 'night_club', 'bar', 'rooftop', 'brewery'];
  const isBuzzingType = tags.some(t => buzzingTypes.some(bt => t.toLowerCase().includes(bt)));
  
  // Review count thresholds
  if (reviewCount > 500 || isBuzzingType) {
    return 'buzzing';
  }
  if (reviewCount < 100 || isQuietType) {
    return 'quiet';
  }
  return 'unknown';
}

// Check if option matches crowd preference
function matchesCrowdPreference(opt: SuggestionOption, crowdPref?: string): number {
  if (!crowdPref || crowdPref === 'no_preference') return 0;
  
  const crowdLevel = estimateCrowdLevel(opt);
  if (crowdLevel === 'unknown') return 0;
  
  if (crowdLevel === crowdPref) return 5; // Boost matching preference
  return -2; // Slight penalty for mismatch
}

// Adjacent categories for explore/wildcard buckets
const adjacentCategories: Record<string, string[]> = {
  'Dinner': ['Brunch', 'Food', 'Date Night'],
  'Brunch': ['Dinner', 'Coffee', 'Chill'],
  'Cocktails': ['Wine Bar', 'Speakeasy', 'Rooftop'],
  'Live Music': ['Club', 'Dancing', 'Comedy'],
  'Chill': ['Coffee', 'Walk', 'Conversation'],
  'Drinks': ['Cocktails', 'Brewery', 'Dive Bar'],
};

function getCacheKey(req: SuggestRequest): string {
  return JSON.stringify({
    city: req.city,
    neighborhood: req.neighborhood,
    categories: req.categories.sort(),
    budget: req.budget,
    energy: req.energy,
    timeWindow: req.timeWindow,
    specificDate: req.specificDate,
    specificTime: req.specificTime,
    discoveryStyle: req.discoveryStyle,
    crowdPreference: req.crowdPreference,
    favoriteNeighborhoods: req.favoriteNeighborhoods?.sort(),
  });
}

// Get adjusted bucket params based on downvote reasons
function getAdjustedBucketParams(
  baseParams: BucketParams,
  bucketType: GenerationType,
  downvoteReasons?: DownvoteReasonAggregates
): BucketParams {
  if (!downvoteReasons) return baseParams;
  
  const adjusted = { ...baseParams };
  
  // "Too far" → tighten radius for EXPLORE + WILDCARD
  if (downvoteReasons.tooFar >= 2 && bucketType !== 'safe') {
    adjusted.radiusMultiplier = Math.max(1.0, adjusted.radiusMultiplier - 0.15);
  }
  
  // "Too expensive" → favor cheaper options (raise min rating to be more selective)
  if (downvoteReasons.tooExpensive >= 2) {
    adjusted.minRating = Math.min(4.5, adjusted.minRating + 0.2);
  }
  
  return adjusted;
}

// Get budget tier for filtering
function getBudgetTier(priceLevel?: string): number {
  const tiers: Record<string, number> = { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 };
  return tiers[priceLevel || '$$'] || 2;
}

// Check if option matches budget constraints with learning adjustments
function matchesBudget(opt: SuggestionOption, reqBudget: string, downvoteReasons?: DownvoteReasonAggregates, refProfile?: ReferenceProfile): boolean {
  const optTier = getBudgetTier(opt.priceLevel);
  const reqTier = getBudgetTier(reqBudget);
  
  // If many "too expensive" downvotes, be stricter about budget
  if (downvoteReasons && downvoteReasons.tooExpensive >= 2) {
    return optTier <= reqTier; // Must be at or below requested budget
  }
  
  // If reference profile exists, use its price tolerance
  if (refProfile) {
    return Math.abs(optTier - refProfile.preferredPriceTier) <= refProfile.priceTolerance;
  }
  
  return Math.abs(optTier - reqTier) <= 1; // Within 1 tier
}

// Reference venue from session
export interface ReferenceVenue {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
}

// Venue details fetched from Google Places
interface VenueDetails {
  placeId: string;
  priceLevel?: number;
  rating?: number;
  types?: string[];
  openingHours?: { weekdayText?: string[] };
}

// Fetch venue details from Google Places for reference profile extraction
async function fetchVenueDetails(placeIds: string[]): Promise<VenueDetails[]> {
  const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!GOOGLE_PLACES_API_KEY || placeIds.length === 0) return [];

  const details: VenueDetails[] = [];
  
  for (const placeId of placeIds) {
    try {
      const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'id,priceLevel,rating,types,currentOpeningHours.weekdayDescriptions',
        },
      });

      if (response.ok) {
        const data = await response.json();
        details.push({
          placeId: data.id,
          priceLevel: data.priceLevel ? priceLevelToNumber(data.priceLevel) : undefined,
          rating: data.rating,
          types: data.types,
          openingHours: data.currentOpeningHours,
        });
      }
    } catch (error) {
      devLog('suggestions', `Failed to fetch venue details for ${placeId}`, { error });
    }
  }
  
  return details;
}

function priceLevelToNumber(priceLevel: string): number {
  const levels: Record<string, number> = {
    'PRICE_LEVEL_FREE': 0,
    'PRICE_LEVEL_INEXPENSIVE': 1,
    'PRICE_LEVEL_MODERATE': 2,
    'PRICE_LEVEL_EXPENSIVE': 3,
    'PRICE_LEVEL_VERY_EXPENSIVE': 4,
  };
  return levels[priceLevel] ?? 2;
}

// Extract Reference Profile from venue details
function extractReferenceProfile(venues: VenueDetails[]): ReferenceProfile | null {
  if (venues.length === 0) return null;

  // Calculate average price tier
  const priceLevels = venues.map(v => v.priceLevel).filter((p): p is number => p !== undefined);
  const avgPrice = priceLevels.length > 0 
    ? priceLevels.reduce((a, b) => a + b, 0) / priceLevels.length 
    : 2;
  
  // Calculate price tolerance - wider if venues differ
  const priceSpread = priceLevels.length > 1 
    ? Math.max(...priceLevels) - Math.min(...priceLevels) 
    : 1;
  const priceTolerance = Math.max(1, Math.ceil(priceSpread / 2));
  
  // Collect types with frequency weighting
  const typeCounts: Record<string, number> = {};
  for (const venue of venues) {
    for (const type of venue.types || []) {
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }
  }
  const preferredTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type]) => type);
  
  // Calculate quality floor from average rating
  const ratings = venues.map(v => v.rating).filter((r): r is number => r !== undefined);
  const qualityFloor = ratings.length > 0 
    ? Math.max(3.5, (ratings.reduce((a, b) => a + b, 0) / ratings.length) - 0.5)
    : 3.8;
  
  // Estimate energy bias from opening hours (late-night = high energy)
  let lateNightCount = 0;
  for (const venue of venues) {
    const hours = venue.openingHours?.weekdayText || [];
    const hasLateHours = hours.some(h => 
      h.includes('12:00 AM') || h.includes('1:00 AM') || h.includes('2:00 AM') || 
      h.includes('3:00 AM') || h.includes('4:00 AM')
    );
    if (hasLateHours) lateNightCount++;
  }
  const energyBias: 'day' | 'night' | 'mixed' = 
    lateNightCount === venues.length ? 'night' :
    lateNightCount === 0 ? 'day' : 'mixed';
  
  // Detect conflicts (very different styles)
  const hasConflicts = priceSpread >= 2 || 
    (venues.length > 1 && new Set(venues.flatMap(v => v.types || [])).size > 10);

  return {
    preferredPriceTier: Math.round(avgPrice),
    priceTolerance,
    preferredTypes,
    qualityFloor,
    neighborhoodTolerance: 5, // Default miles
    energyBias,
    hasConflicts,
  };
}

export async function getSuggestions(
  req: SuggestRequest,
  downvoteReasons?: DownvoteReasonAggregates,
  referenceVenues?: ReferenceVenue[]
): Promise<{ options: SuggestionOption[]; meta: SuggestMeta; referenceProfile?: ReferenceProfile }> {
  const cacheKey = getCacheKey(req);
  const cached = suggestionsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      options: cached.options,
      meta: {
        city: req.city,
        centerLatLng: getSearchCenter(req.city, req.neighborhood, req.userLat, req.userLng),
        radiusMeters: 3000,
        placesCount: 0,
        eventsCount: 0,
        filteredCount: cached.options.length,
      },
    };
  }

  // Extract Reference Profile from reference venues if provided
  let refProfile: ReferenceProfile | null = null;
  if (referenceVenues && referenceVenues.length > 0) {
    const venueDetails = await fetchVenueDetails(referenceVenues.map(v => v.placeId));
    refProfile = extractReferenceProfile(venueDetails);
    
    if (refProfile) {
      devLog('suggestions', 'Reference profile extracted', {
        priceTier: refProfile.preferredPriceTier,
        qualityFloor: refProfile.qualityFloor,
        energyBias: refProfile.energyBias,
        hasConflicts: refProfile.hasConflicts,
        types: refProfile.preferredTypes.slice(0, 3),
      });
    }
  }

  const center = getSearchCenter(req.city, req.neighborhood, req.userLat, req.userLng);
  const baseRadiusMeters = 3000;

  const timeAwarePlaceTypes = getTimeAwareTypes(req.categories, req.specificTime, req.timeWindow, req.energy);
  const timeAwareTicketClasses = getTimeAwareTicketmasterClasses(req.categories, req.specificTime, req.timeWindow, req.energy);

  const maxRadiusMeters = Math.round(baseRadiusMeters * 1.3);
  
  console.log(`[Suggestions] Request: city=${req.city}, categories=[${req.categories.join(',')}], energy=${req.energy}, time=${req.specificTime || req.timeWindow || 'none'}, placeTypes=[${timeAwarePlaceTypes.join(',')}], ticketClasses=[${timeAwareTicketClasses.join(',')}]`);

  const perplexityCategories = req.categories.length > 0 ? req.categories : ['Drinks'];
  const shouldSearchPerplexity = PERPLEXITY_API_KEY && (isLateNight(req.specificTime, req.timeWindow) || isHighEnergy(req.energy));

  const [placesResults, eventsResults, trendingVenueNames] = await Promise.all([
    fetchGooglePlaces(center, maxRadiusMeters, timeAwarePlaceTypes, req.city),
    timeAwareTicketClasses.length > 0 
      ? fetchTicketmasterEvents(center, timeAwareTicketClasses, req.specificDate)
      : Promise.resolve([]),
    shouldSearchPerplexity
      ? discoverTrendingVenues(req.city, perplexityCategories, {
          crowdPreference: req.crowdPreference,
          discoveryStyle: req.discoveryStyle,
        }).catch(err => { console.error('[Suggestions] Perplexity error:', err); return [] as string[]; })
      : Promise.resolve([] as string[]),
  ]);

  if (trendingVenueNames.length > 0) {
    console.log(`[Suggestions] Perplexity trending venues: [${trendingVenueNames.join(', ')}]`);
    const trendingPlaceResults = await fetchGooglePlacesByName(center, maxRadiusMeters, trendingVenueNames, req.city);
    console.log(`[Suggestions] Resolved ${trendingPlaceResults.length} trending venues via Google Places`);
    placesResults.push(...trendingPlaceResults);
  }

  let allCandidates = [...placesResults, ...eventsResults];

  // Filter by city first
  allCandidates = allCandidates.filter(opt => {
    if (opt.lat && opt.lng) {
      return isWithinCity(req.city, opt.lat, opt.lng);
    }
    const cityLower = req.city.toLowerCase();
    const addressLower = (opt.address || '').toLowerCase();
    const optCityLower = (opt.city || '').toLowerCase();
    if (req.city === 'NYC') {
      return addressLower.includes('new york') || addressLower.includes('brooklyn') || 
             addressLower.includes('queens') || addressLower.includes('manhattan') ||
             optCityLower.includes('new york') || optCityLower === 'nyc';
    }
    return addressLower.includes(cityLower) || optCityLower.includes(cityLower);
  });

  // Calculate distance for all candidates
  for (const opt of allCandidates) {
    if (opt.lat != null && opt.lng != null) {
      const dist = haversineDistance(center.lat, center.lng, opt.lat, opt.lng);
      opt.distance = `${dist.toFixed(1)} mi`;
    }
  }

  // Deduplicate by placeId/eventId/name BEFORE bucket selection
  const uniqueIds = new Set<string>();
  const preDedupCount = allCandidates.length;
  allCandidates = allCandidates.filter(opt => {
    const id = opt.placeId || opt.eventId || opt.title.toLowerCase().trim();
    if (uniqueIds.has(id)) return false;
    uniqueIds.add(id);
    return true;
  });
  const dedupedCount = preDedupCount - allCandidates.length;

  // Hard filter: remove restaurant-primary venues for late-night plans
  const lateNightFilter = isLateNight(req.specificTime, req.timeWindow) || isHighEnergy(req.energy);
  if (lateNightFilter) {
    const beforeFilter = allCandidates.length;
    allCandidates = allCandidates.filter(opt => !looksLikeRestaurant(opt));
    const removed = beforeFilter - allCandidates.length;
    if (removed > 0) {
      console.log(`[Suggestions] Late-night filter: removed ${removed} restaurant-like venues`);
    }
  }

  // Generate buckets with diversity-first approach
  // Adjust target counts based on user's discovery style preference
  const targetCounts = getDiscoveryAdjustedCounts(req.discoveryStyle);
  const reviewThresholds = getReviewCountThresholds(req.discoveryStyle);
  const bucketCounts = { safe: 0, explore: 0, wildcard: 0 };
  const selectedOptions: SuggestionOption[] = [];
  const usedIds = new Set<string>();

  // Helper to get unique ID for deduplication
  const getUniqueId = (opt: SuggestionOption) => 
    opt.placeId || opt.eventId || opt.title.toLowerCase().trim();

  // Helper to check if option is in user's favorite neighborhoods (soft boost, not filter)
  const isInFavoriteNeighborhood = (opt: SuggestionOption): boolean => {
    if (!req.favoriteNeighborhoods || req.favoriteNeighborhoods.length === 0) return false;
    const addressLower = (opt.address || '').toLowerCase();
    return req.favoriteNeighborhoods.some(n => addressLower.includes(n.toLowerCase()));
  };

  // BUCKET A: SAFE - High confidence, expected picks (closest vibe to references)
  const safeParams = getAdjustedBucketParams(BUCKET_PARAMS.safe, 'safe', downvoteReasons);
  const safeMinRating = refProfile ? Math.max(safeParams.minRating, refProfile.qualityFloor) : safeParams.minRating;
  const safeMinReviews = reviewThresholds.safeMin;
  const safeCandidates = allCandidates
    .filter(opt => {
      const rating = parseFloat(opt.rating || '0');
      const reviewCount = opt.ratingCount || 0;
      const dist = parseFloat(opt.distance?.replace(' mi', '') || '0');
      return rating >= safeMinRating && 
             reviewCount >= safeMinReviews &&
             dist <= (baseRadiusMeters / 1609.34) * safeParams.radiusMultiplier &&
             matchesBudget(opt, req.budget || '$$', downvoteReasons, refProfile || undefined);
    })
    .sort((a, b) => {
      let scoreA = (parseFloat(a.rating || '0') * 10) + Math.min(10, (a.ratingCount || 0) / 50);
      let scoreB = (parseFloat(b.rating || '0') * 10) + Math.min(10, (b.ratingCount || 0) / 50);
      
      if (refProfile && a.tags) {
        const matchA = a.tags.some(t => refProfile.preferredTypes.includes(t.toLowerCase()));
        if (matchA) scoreA += 5;
      }
      if (refProfile && b.tags) {
        const matchB = b.tags.some(t => refProfile.preferredTypes.includes(t.toLowerCase()));
        if (matchB) scoreB += 5;
      }
      
      if (isInFavoriteNeighborhood(a)) scoreA += 3;
      if (isInFavoriteNeighborhood(b)) scoreB += 3;
      
      scoreA += matchesCrowdPreference(a, req.crowdPreference);
      scoreB += matchesCrowdPreference(b, req.crowdPreference);
      
      scoreA += scoreTimeAppropriateness(a, req.specificTime, req.timeWindow, req.energy);
      scoreB += scoreTimeAppropriateness(b, req.specificTime, req.timeWindow, req.energy);
      
      return scoreB - scoreA;
    });

  for (const opt of safeCandidates) {
    if (bucketCounts.safe >= targetCounts.safe) break;
    const id = getUniqueId(opt);
    if (!usedIds.has(id)) {
      opt.generationType = 'safe';
      selectedOptions.push(opt);
      usedIds.add(id);
      bucketCounts.safe++;
    }
  }

  // BUCKET B: EXPLORE - Novelty and variety (adjacent categories, slightly different from refs)
  const exploreParams = getAdjustedBucketParams(BUCKET_PARAMS.explore, 'explore', downvoteReasons);
  // Widen explore bucket if reference profile has conflicts
  const exploreRadiusMult = refProfile?.hasConflicts 
    ? exploreParams.radiusMultiplier * 1.1 
    : exploreParams.radiusMultiplier;
  const exploreMaxReviews = reviewThresholds.exploreMax;
  const exploreCandidates = allCandidates
    .filter(opt => {
      const rating = parseFloat(opt.rating || '0');
      const reviewCount = opt.ratingCount || 0;
      const dist = parseFloat(opt.distance?.replace(' mi', '') || '0');
      const id = getUniqueId(opt);
      // Prefer lower review count (newer/less discovered places) - threshold adjusted by discoveryStyle
      return !usedIds.has(id) &&
             rating >= exploreParams.minRating && 
             reviewCount < exploreMaxReviews &&
             dist <= (baseRadiusMeters / 1609.34) * exploreRadiusMult &&
             matchesBudget(opt, req.budget || '$$', downvoteReasons, refProfile || undefined);
    })
    .sort((a, b) => {
      let noveltyA = 100 - Math.min(100, (a.ratingCount || 0) / 2);
      let noveltyB = 100 - Math.min(100, (b.ratingCount || 0) / 2);
      
      if (isInFavoriteNeighborhood(a)) noveltyA += 20;
      if (isInFavoriteNeighborhood(b)) noveltyB += 20;
      
      noveltyA += matchesCrowdPreference(a, req.crowdPreference);
      noveltyB += matchesCrowdPreference(b, req.crowdPreference);
      
      noveltyA += scoreTimeAppropriateness(a, req.specificTime, req.timeWindow, req.energy);
      noveltyB += scoreTimeAppropriateness(b, req.specificTime, req.timeWindow, req.energy);
      
      return noveltyB - noveltyA;
    });

  for (const opt of exploreCandidates) {
    if (bucketCounts.explore >= targetCounts.explore) break;
    const id = getUniqueId(opt);
    if (!usedIds.has(id)) {
      opt.generationType = 'explore';
      selectedOptions.push(opt);
      usedIds.add(id);
      bucketCounts.explore++;
    }
  }

  // BUCKET C: WILDCARD - Surprise without chaos
  const wildcardParams = getAdjustedBucketParams(BUCKET_PARAMS.wildcard, 'wildcard', downvoteReasons);
  const wildcardCandidates = allCandidates
    .filter(opt => {
      const rating = parseFloat(opt.rating || '0');
      const dist = parseFloat(opt.distance?.replace(' mi', '') || '0');
      const id = getUniqueId(opt);
      // Allow slightly further or different types - more relaxed budget check
      return !usedIds.has(id) &&
             rating >= wildcardParams.minRating && 
             dist <= (baseRadiusMeters / 1609.34) * wildcardParams.radiusMultiplier;
    })
    // Shuffle for randomness
    .sort(() => Math.random() - 0.5);

  for (const opt of wildcardCandidates) {
    if (bucketCounts.wildcard >= targetCounts.wildcard) break;
    const id = getUniqueId(opt);
    if (!usedIds.has(id)) {
      opt.generationType = 'wildcard';
      selectedOptions.push(opt);
      usedIds.add(id);
      bucketCounts.wildcard++;
    }
  }

  // Redistribute quota if buckets are empty
  const shortfall = (targetCounts.safe - bucketCounts.safe) + 
                    (targetCounts.explore - bucketCounts.explore) + 
                    (targetCounts.wildcard - bucketCounts.wildcard);
  
  if (shortfall > 0) {
    // Fill from remaining candidates, prioritizing by rating
    const remaining = allCandidates
      .filter(opt => !usedIds.has(getUniqueId(opt)))
      .sort((a, b) => parseFloat(b.rating || '0') - parseFloat(a.rating || '0'));
    
    for (const opt of remaining) {
      if (selectedOptions.length >= 5) break;
      // Assign to bucket with most shortfall
      if (bucketCounts.safe < targetCounts.safe) {
        opt.generationType = 'safe';
        bucketCounts.safe++;
      } else if (bucketCounts.explore < targetCounts.explore) {
        opt.generationType = 'explore';
        bucketCounts.explore++;
      } else {
        opt.generationType = 'wildcard';
        bucketCounts.wildcard++;
      }
      selectedOptions.push(opt);
      usedIds.add(getUniqueId(opt));
    }
  }

  // Apply scoring and ranking to final selection
  const rankedOptions = scoreAndRank(selectedOptions, req, center);

  console.log(`[Suggestions] Pipeline results: places=${placesResults.length}, events=${eventsResults.length}, trending=${trendingVenueNames.length}, afterCityFilter=${allCandidates.length}, selected=${selectedOptions.length}`);
  console.log(`[Suggestions] Buckets: safe=${bucketCounts.safe}/${targetCounts.safe}, explore=${bucketCounts.explore}/${targetCounts.explore}, wildcard=${bucketCounts.wildcard}/${targetCounts.wildcard}`);
  console.log(`[Suggestions] Selected: ${rankedOptions.map(o => `${o.title} (${o.tags.join(',')}, score=${o.score?.toFixed(0)})`).join(' | ')}`);
  
  devLog('suggestions', `Generated ${rankedOptions.length} options`, {
    buckets: bucketCounts,
    dedupedBeforeSelection: dedupedCount,
    totalCandidates: allCandidates.length,
    downvoteReasons: downvoteReasons || 'none',
    hasReferenceProfile: !!refProfile,
  });

  suggestionsCache.set(cacheKey, { options: rankedOptions, timestamp: Date.now() });

  return {
    options: rankedOptions,
    meta: {
      city: req.city,
      centerLatLng: center,
      radiusMeters: baseRadiusMeters,
      placesCount: placesResults.length,
      eventsCount: eventsResults.length,
      filteredCount: rankedOptions.length,
      bucketCounts,
      dedupedCount: allCandidates.length - selectedOptions.length,
    },
    referenceProfile: refProfile || undefined,
  };
}

async function fetchGooglePlaces(center: LatLng, radiusMeters: number, types: string[], city: string): Promise<SuggestionOption[]> {
  if (!GOOGLE_PLACES_API_KEY) {
    console.warn('GOOGLE_PLACES_API_KEY not set');
    return [];
  }

  const results: SuggestionOption[] = [];

  for (const type of types.slice(0, 5)) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.googleMapsUri,places.primaryType,places.editorialSummary,places.currentOpeningHours',
        },
        body: JSON.stringify({
          includedTypes: [type],
          locationRestriction: {
            circle: {
              center: { latitude: center.lat, longitude: center.lng },
              radius: radiusMeters,
            },
          },
          maxResultCount: 10,
        }),
      });

      if (!response.ok) {
        console.error(`Google Places API error for type ${type}:`, await response.text());
        continue;
      }

      const data = await response.json();
      const places = data.places || [];

      for (const place of places) {
        const lat = place.location?.latitude;
        const lng = place.location?.longitude;
        const distance = lat && lng ? haversineDistance(center.lat, center.lng, lat, lng) : null;

        const openingHours = place.currentOpeningHours;

        results.push({
          optionType: 'place',
          title: place.displayName?.text || 'Unknown',
          description: place.editorialSummary?.text || `A ${type.replace('_', ' ')} in ${city}`,
          address: place.formattedAddress || '',
          city,
          lat,
          lng,
          rating: place.rating?.toString(),
          ratingCount: place.userRatingCount,
          priceLevel: priceLevelMap[place.priceLevel] || '$$',
          distance: distance ? `${distance.toFixed(1)} mi` : undefined,
          tags: [
            type.replace('_', ' '),
            ...(place.primaryType && place.primaryType !== type ? [place.primaryType.replace('_', ' ')] : []),
          ],
          detailUrl: place.websiteUri || place.googleMapsUri,
          reservationUrl: null,
          ticketUrl: null,
          eventUrl: null,
          source: 'Google',
          placeId: place.id,
          openNow: openingHours?.openNow,
          openingHoursText: openingHours?.weekdayDescriptions,
        });
      }
    } catch (err) {
      console.error(`Error fetching places for type ${type}:`, err);
    }
  }

  return results;
}

async function fetchTicketmasterEvents(center: LatLng, classifications: string[], specificDate?: string): Promise<SuggestionOption[]> {
  if (!TICKETMASTER_API_KEY) {
    console.warn('TICKETMASTER_API_KEY not set');
    return [];
  }

  const results: SuggestionOption[] = [];
  const radiusMiles = 25;

  const now = new Date();
  const startDateTime = specificDate ? new Date(specificDate) : now;
  const endDateTime = new Date(startDateTime);
  endDateTime.setDate(endDateTime.getDate() + 14);

  console.log(`[Ticketmaster] Searching for ${classifications.join(', ')} near ${center.lat},${center.lng} from ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`);

  for (const classification of classifications) {
    try {
      const params = new URLSearchParams({
        apikey: TICKETMASTER_API_KEY,
        latlong: `${center.lat},${center.lng}`,
        radius: radiusMiles.toString(),
        unit: 'miles',
        classificationName: classification,
        startDateTime: startDateTime.toISOString().split('.')[0] + 'Z',
        endDateTime: endDateTime.toISOString().split('.')[0] + 'Z',
        size: '10',
        sort: 'date,asc',
      });

      const response = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${params}`);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Ticketmaster] API error for ${classification}:`, errText);
        continue;
      }

      const data = await response.json();
      const events = data._embedded?.events || [];
      console.log(`[Ticketmaster] Found ${events.length} events for ${classification}`);

      for (const event of events) {
        const venue = event._embedded?.venues?.[0];
        const lat = venue?.location?.latitude ? parseFloat(venue.location.latitude) : undefined;
        const lng = venue?.location?.longitude ? parseFloat(venue.location.longitude) : undefined;

        results.push({
          optionType: 'event',
          title: event.name,
          description: event.info || `${classification} event`,
          address: venue?.address?.line1 ? `${venue.address.line1}, ${venue.city?.name || ''}` : '',
          city: venue?.city?.name || '',
          lat,
          lng,
          venueName: venue?.name,
          startTime: event.dates?.start?.localTime,
          tags: [classification, 'Event'],
          detailUrl: event.url,
          ticketUrl: event.url,
          reservationUrl: null,
          eventUrl: event.url,
          source: 'Ticketmaster',
          eventId: event.id, // For deduplication
        });
      }
    } catch (err) {
      console.error(`Error fetching Ticketmaster events for ${classification}:`, err);
    }
  }

  return results;
}

function scoreAndRank(options: SuggestionOption[], req: SuggestRequest, center: LatLng): SuggestionOption[] {
  const budgetScore: Record<string, number> = { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 };
  const reqBudgetLevel = budgetScore[req.budget || '$$'] || 2;

  for (const opt of options) {
    let score = 30;

    if (opt.lat != null && opt.lng != null && !isNaN(opt.lat) && !isNaN(opt.lng)) {
      const dist = haversineDistance(center.lat, center.lng, opt.lat, opt.lng);
      score += Math.max(0, 20 - dist * 4);
    }

    if (opt.priceLevel) {
      const optLevel = budgetScore[opt.priceLevel] || 2;
      const diff = Math.abs(optLevel - reqBudgetLevel);
      score += Math.max(0, 15 - diff * 5);
    } else {
      score += 10;
    }

    if (opt.rating) {
      const rating = parseFloat(opt.rating);
      if (!isNaN(rating)) {
        score += rating * 3;
      }
    }

    if (opt.ratingCount && !isNaN(opt.ratingCount)) {
      score += Math.min(10, opt.ratingCount / 100);
    }

    score += scoreTimeAppropriateness(opt, req.specificTime, req.timeWindow, req.energy);

    opt.score = score;
  }

  return options.sort((a, b) => (b.score || 0) - (a.score || 0));
}

async function fetchGooglePlacesByName(center: LatLng, radiusMeters: number, venueNames: string[], city: string): Promise<SuggestionOption[]> {
  if (!GOOGLE_PLACES_API_KEY || venueNames.length === 0) return [];

  const results: SuggestionOption[] = [];

  for (const name of venueNames.slice(0, 5)) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.googleMapsUri,places.primaryType,places.editorialSummary,places.currentOpeningHours',
        },
        body: JSON.stringify({
          textQuery: `${name} ${city}`,
          locationBias: {
            circle: {
              center: { latitude: center.lat, longitude: center.lng },
              radius: radiusMeters,
            },
          },
          maxResultCount: 1,
        }),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const place = data.places?.[0];
      if (!place) continue;

      const primaryType = (place.primaryType || '').toLowerCase();
      const invalidTypes = ['apartment', 'hotel', 'motel', 'school', 'hospital', 'church', 'parking', 'gas_station', 'grocery', 'supermarket', 'shopping_mall', 'real_estate'];
      if (invalidTypes.some(t => primaryType.includes(t))) {
        console.log(`[Suggestions] Skipping Perplexity result "${place.displayName?.text}" (type: ${primaryType})`);
        continue;
      }

      const lat = place.location?.latitude;
      const lng = place.location?.longitude;
      const distance = lat && lng ? haversineDistance(center.lat, center.lng, lat, lng) : null;
      const openingHours = place.currentOpeningHours;

      results.push({
        optionType: 'place',
        title: place.displayName?.text || name,
        description: place.editorialSummary?.text || `Trending spot in ${city}`,
        address: place.formattedAddress || '',
        city,
        lat,
        lng,
        rating: place.rating?.toString(),
        ratingCount: place.userRatingCount,
        priceLevel: priceLevelMap[place.priceLevel] || '$$',
        distance: distance ? `${distance.toFixed(1)} mi` : undefined,
        tags: [place.primaryType?.replace('_', ' ') || 'trending', 'Perplexity Pick'],
        detailUrl: place.websiteUri || place.googleMapsUri,
        reservationUrl: null,
        ticketUrl: null,
        eventUrl: null,
        source: 'Google',
        placeId: place.id,
        openNow: openingHours?.openNow,
        openingHoursText: openingHours?.weekdayDescriptions,
      });
    } catch (err) {
      console.error(`[Suggestions] Error resolving trending venue "${name}":`, err);
    }
  }

  return results;
}

export async function fetchGooglePlacesTextSearch(center: LatLng, radiusMeters: number, queries: string[], city: string): Promise<SuggestionOption[]> {
  if (!GOOGLE_PLACES_API_KEY || queries.length === 0) return [];

  const results: SuggestionOption[] = [];

  for (const query of queries.slice(0, 3)) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.googleMapsUri,places.primaryType,places.editorialSummary,places.currentOpeningHours',
        },
        body: JSON.stringify({
          textQuery: query,
          locationBias: {
            circle: {
              center: { latitude: center.lat, longitude: center.lng },
              radius: radiusMeters,
            },
          },
          maxResultCount: 5,
        }),
      });

      if (!response.ok) {
        console.error(`[Suggestions] Text search error for "${query}":`, await response.text());
        continue;
      }

      const data = await response.json();
      const places = data.places || [];

      for (const place of places) {
        const primaryType = (place.primaryType || '').toLowerCase();
        const invalidTypes = ['apartment', 'hotel', 'motel', 'school', 'hospital', 'church', 'parking', 'gas_station', 'grocery', 'supermarket', 'shopping_mall', 'real_estate'];
        if (invalidTypes.some(t => primaryType.includes(t))) continue;

        const lat = place.location?.latitude;
        const lng = place.location?.longitude;
        const distance = lat && lng ? haversineDistance(center.lat, center.lng, lat, lng) : null;
        const openingHours = place.currentOpeningHours;

        results.push({
          optionType: 'place',
          title: place.displayName?.text || 'Unknown',
          description: place.editorialSummary?.text || `A spot in ${city}`,
          address: place.formattedAddress || '',
          city,
          lat,
          lng,
          rating: place.rating?.toString(),
          ratingCount: place.userRatingCount,
          priceLevel: priceLevelMap[place.priceLevel] || '$$',
          distance: distance ? `${distance.toFixed(1)} mi` : undefined,
          tags: [
            place.primaryType?.replace('_', ' ') || 'venue',
            ...(query.toLowerCase().includes('speakeasy') ? ['speakeasy'] : []),
            ...(query.toLowerCase().includes('rooftop') ? ['rooftop'] : []),
          ],
          detailUrl: place.websiteUri || place.googleMapsUri,
          reservationUrl: null,
          ticketUrl: null,
          eventUrl: null,
          source: 'Google',
          placeId: place.id,
          openNow: openingHours?.openNow,
          openingHoursText: openingHours?.weekdayDescriptions,
        });
      }
    } catch (err) {
      console.error(`[Suggestions] Text search error for "${query}":`, err);
    }
  }

  return results;
}

export interface GroupPreferenceSummary {
  memberCount: number;
  categories: string[];
  commonCategories: string[];
  budget: string;
  energy: string;
  crowdPreference?: string;
  discoveryStyle?: string;
  favoriteNeighborhoods?: string[];
}

export function generateWhyExplanation(
  option: SuggestionOption,
  groupPrefs: GroupPreferenceSummary
): string {
  const reasons: string[] = [];
  
  // Bucket-based explanation (primary reason)
  if (option.generationType === 'safe') {
    if (option.rating && parseFloat(option.rating) >= 4.5) {
      reasons.push(`Highly rated at ${option.rating}★`);
    } else if (option.ratingCount && option.ratingCount > 100) {
      reasons.push('Crowd favorite with strong reviews');
    } else {
      reasons.push('Reliable choice with consistent quality');
    }
  } else if (option.generationType === 'explore') {
    if (option.ratingCount && option.ratingCount < 50) {
      reasons.push('Hidden gem waiting to be discovered');
    } else {
      reasons.push('Something new to try');
    }
  } else if (option.generationType === 'wildcard') {
    reasons.push('Wild card for variety');
  }

  // Category match
  const matchingCategories = option.tags.filter(tag => 
    groupPrefs.categories.some(cat => 
      tag.toLowerCase().includes(cat.toLowerCase()) || 
      cat.toLowerCase().includes(tag.toLowerCase())
    )
  );
  if (matchingCategories.length > 0) {
    reasons.push(`Matches your ${matchingCategories[0]} vibe`);
  }

  // Budget match
  if (option.priceLevel && groupPrefs.budget) {
    const budgetOrder = ['$', '$$', '$$$', '$$$$'];
    const optLevel = budgetOrder.indexOf(option.priceLevel);
    const prefLevel = budgetOrder.indexOf(groupPrefs.budget);
    if (Math.abs(optLevel - prefLevel) <= 1) {
      reasons.push(`Fits your ${groupPrefs.budget} budget`);
    }
  }

  // Crowd preference match
  if (groupPrefs.crowdPreference && groupPrefs.crowdPreference !== 'no_preference') {
    const estimatedCrowd = option.ratingCount && option.ratingCount > 300 ? 'buzzing' : 'quiet';
    if (estimatedCrowd === groupPrefs.crowdPreference) {
      reasons.push(groupPrefs.crowdPreference === 'quiet' 
        ? 'More intimate setting' 
        : 'Lively atmosphere');
    }
  }

  // Neighborhood match
  if (groupPrefs.favoriteNeighborhoods && groupPrefs.favoriteNeighborhoods.length > 0) {
    const addressLower = (option.address || '').toLowerCase();
    const matchedNeighborhood = groupPrefs.favoriteNeighborhoods.find(n => 
      addressLower.includes(n.toLowerCase())
    );
    if (matchedNeighborhood) {
      reasons.push(`In ${matchedNeighborhood}`);
    }
  }

  // Distance
  if (option.distance) {
    const dist = parseFloat(option.distance.replace(' mi', ''));
    if (dist <= 0.5) {
      reasons.push('Super close by');
    } else if (dist <= 1) {
      reasons.push('Easy walk');
    }
  }

  // Group size consideration
  if (groupPrefs.memberCount >= 5) {
    const goodForGroups = option.tags.some(t => 
      ['restaurant', 'bar', 'big group'].some(k => t.toLowerCase().includes(k))
    );
    if (goodForGroups) {
      reasons.push('Works for your group');
    }
  }

  // Nightlife / late-night relevance
  const isNightlifeVenue = option.tags.some(t => 
    ['night club', 'night_club', 'club', 'lounge', 'bar'].some(k => t.toLowerCase().includes(k))
  );
  const isNightEnergy = groupPrefs.energy === 'Going out' || groupPrefs.energy === 'Full send';
  if (isNightlifeVenue && isNightEnergy) {
    reasons.push('Perfect for a night out');
  }

  if (option.tags.some(t => t.toLowerCase().includes('perplexity'))) {
    reasons.push('Currently trending');
  }

  // Combine reasons (max 2-3 for concise explanation)
  const topReasons = reasons.slice(0, 3);
  return topReasons.join(' · ') || 'Great option for your group';
}

export async function enrichSuggestionsWithExplanations(
  options: SuggestionOption[],
  groupPrefs: GroupPreferenceSummary
): Promise<SuggestionOption[]> {
  return options.map(option => ({
    ...option,
    whyExplanation: generateWhyExplanation(option, groupPrefs),
  }));
}

export async function getOrchestratedSuggestions(
  req: SuggestRequest,
  downvoteReasons?: DownvoteReasonAggregates,
  referenceVenues?: ReferenceVenue[],
  groupPrefs?: GroupPreferenceSummary,
  feedbackHistory?: Array<{ venueName: string; rating: number; tags?: string[] | null; review?: string | null }>,
): Promise<{ options: SuggestionOption[]; meta: SuggestMeta; referenceProfile?: ReferenceProfile; brief?: OrchestratorBrief }> {
  const startTime = Date.now();
  
  console.log(`[Orchestrator] Starting orchestrated suggestion pipeline for ${req.city}`);

  let brief: OrchestratorBrief;
  try {
    brief = await synthesizeContext(req, groupPrefs, downvoteReasons, feedbackHistory);
    console.log(`[Orchestrator] Brief synthesized in ${Date.now() - startTime}ms`);
    console.log(`[Orchestrator] Intent: ${brief.naturalLanguageIntent}`);
    console.log(`[Orchestrator] Places types: [${brief.googlePlacesTypes.join(', ')}], Exclude: [${brief.excludeTypes.join(', ')}]`);
    console.log(`[Orchestrator] Perplexity query: ${brief.perplexityQuery}`);
  } catch (err) {
    console.error('[Orchestrator] Brief synthesis failed, falling back to legacy pipeline', err);
    return getSuggestions(req, downvoteReasons, referenceVenues);
  }

  let refProfile: ReferenceProfile | null = null;
  if (referenceVenues && referenceVenues.length > 0) {
    const venueDetails = await fetchVenueDetails(referenceVenues.map(v => v.placeId));
    refProfile = extractReferenceProfile(venueDetails);
  }

  const center = getSearchCenter(req.city, req.neighborhood, req.userLat, req.userLng);
  const radiusBiasMultiplier = brief.radiusBias === 'tight' ? 0.7 : brief.radiusBias === 'wide' ? 1.5 : 1.0;
  const baseRadiusMeters = Math.round(3000 * radiusBiasMultiplier);
  const maxRadiusMeters = Math.round(baseRadiusMeters * 1.3);

  const apiStart = Date.now();
  const [placesResults, textSearchResults, eventsResults, trendingVenueNames] = await Promise.all([
    fetchGooglePlaces(center, maxRadiusMeters, brief.googlePlacesTypes.slice(0, 5), req.city),
    
    brief.googlePlacesTextQueries.length > 0
      ? fetchGooglePlacesTextSearch(center, maxRadiusMeters, brief.googlePlacesTextQueries, req.city)
      : Promise.resolve([]),

    brief.ticketmasterClassifications.length > 0
      ? fetchTicketmasterEvents(center, brief.ticketmasterClassifications, req.specificDate)
      : Promise.resolve([]),

    PERPLEXITY_API_KEY
      ? discoverVenuesFromQuery(brief.perplexityQuery).catch(err => {
          console.error('[Orchestrator] Perplexity error:', err);
          return [] as string[];
        })
      : Promise.resolve([] as string[]),
  ]);
  console.log(`[Orchestrator] API calls completed in ${Date.now() - apiStart}ms: places=${placesResults.length}, textSearch=${textSearchResults.length}, events=${eventsResults.length}, trending=${trendingVenueNames.length}`);

  let trendingPlaceResults: SuggestionOption[] = [];
  if (trendingVenueNames.length > 0) {
    console.log(`[Orchestrator] Resolving trending: [${trendingVenueNames.join(', ')}]`);
    trendingPlaceResults = await fetchGooglePlacesByName(center, maxRadiusMeters, trendingVenueNames, req.city);
    console.log(`[Orchestrator] Resolved ${trendingPlaceResults.length} trending venues`);
  }

  let allCandidates = [...placesResults, ...textSearchResults, ...trendingPlaceResults, ...eventsResults];

  allCandidates = allCandidates.filter(opt => {
    if (opt.lat && opt.lng) {
      return isWithinCity(req.city, opt.lat, opt.lng);
    }
    const cityLower = req.city.toLowerCase();
    const addressLower = (opt.address || '').toLowerCase();
    const optCityLower = (opt.city || '').toLowerCase();
    if (req.city === 'NYC') {
      return addressLower.includes('new york') || addressLower.includes('brooklyn') || 
             addressLower.includes('queens') || addressLower.includes('manhattan') ||
             optCityLower.includes('new york') || optCityLower === 'nyc';
    }
    return addressLower.includes(cityLower) || optCityLower.includes(cityLower);
  });

  for (const opt of allCandidates) {
    if (opt.lat != null && opt.lng != null) {
      const dist = haversineDistance(center.lat, center.lng, opt.lat, opt.lng);
      opt.distance = `${dist.toFixed(1)} mi`;
    }
  }

  const uniqueIds = new Set<string>();
  allCandidates = allCandidates.filter(opt => {
    const id = opt.placeId || opt.eventId || opt.title.toLowerCase().trim();
    if (uniqueIds.has(id)) return false;
    uniqueIds.add(id);
    return true;
  });

  console.log(`[Orchestrator] ${allCandidates.length} unique candidates after dedup and city filter`);

  const validationStart = Date.now();
  let rankedOptions: SuggestionOption[];
  try {
    rankedOptions = await validateAndRankSuggestions(allCandidates, brief, groupPrefs);
    console.log(`[Orchestrator] AI validation completed in ${Date.now() - validationStart}ms`);
    console.log(`[Orchestrator] Final selection: ${rankedOptions.map(o => `${o.title} (score=${o.score})`).join(' | ')}`);
  } catch (err) {
    console.error('[Orchestrator] AI validation failed, using basic ranking', err);
    rankedOptions = allCandidates
      .sort((a, b) => parseFloat(b.rating || '0') - parseFloat(a.rating || '0'))
      .slice(0, 5);
  }

  const totalTime = Date.now() - startTime;
  console.log(`[Orchestrator] Total pipeline time: ${totalTime}ms`);

  return {
    options: rankedOptions,
    meta: {
      city: req.city,
      centerLatLng: center,
      radiusMeters: baseRadiusMeters,
      placesCount: placesResults.length + textSearchResults.length + trendingPlaceResults.length,
      eventsCount: eventsResults.length,
      filteredCount: rankedOptions.length,
    },
    referenceProfile: refProfile || undefined,
    brief,
  };
}
