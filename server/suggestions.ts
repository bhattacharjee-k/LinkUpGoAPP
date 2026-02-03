import { getSearchCenter, haversineDistance, isWithinCity, LatLng } from './geo';
import { devLog } from './logger';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;

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
  generationType?: GenerationType; // Internal tagging for debugging
  placeId?: string; // For deduplication
  eventId?: string; // For deduplication
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

  const placeTypes = new Set<string>();
  for (const cat of req.categories) {
    const types = categoryToPlaceTypes[cat] || categoryToPlaceTypes['Drinks'];
    types.forEach(t => placeTypes.add(t));
  }

  const ticketmasterClasses = new Set<string>();
  for (const cat of req.categories) {
    if (categoryToTicketmaster[cat]) {
      ticketmasterClasses.add(categoryToTicketmaster[cat]);
    }
  }

  // Fetch all candidates with expanded radius for diversity
  const maxRadiusMeters = Math.round(baseRadiusMeters * 1.3);
  
  const [placesResults, eventsResults] = await Promise.all([
    fetchGooglePlaces(center, maxRadiusMeters, Array.from(placeTypes), req.city),
    ticketmasterClasses.size > 0 
      ? fetchTicketmasterEvents(center, Array.from(ticketmasterClasses), req.specificDate)
      : Promise.resolve([]),
  ]);

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

  // Generate buckets with diversity-first approach
  const bucketCounts = { safe: 0, explore: 0, wildcard: 0 };
  const selectedOptions: SuggestionOption[] = [];
  const usedIds = new Set<string>();

  // Helper to get unique ID for deduplication
  const getUniqueId = (opt: SuggestionOption) => 
    opt.placeId || opt.eventId || opt.title.toLowerCase().trim();

  // BUCKET A: SAFE - High confidence, expected picks (closest vibe to references)
  const safeParams = getAdjustedBucketParams(BUCKET_PARAMS.safe, 'safe', downvoteReasons);
  const safeMinRating = refProfile ? Math.max(safeParams.minRating, refProfile.qualityFloor) : safeParams.minRating;
  const safeCandidates = allCandidates
    .filter(opt => {
      const rating = parseFloat(opt.rating || '0');
      const reviewCount = opt.ratingCount || 0;
      const dist = parseFloat(opt.distance?.replace(' mi', '') || '0');
      return rating >= safeMinRating && 
             reviewCount >= safeParams.minReviewCount &&
             dist <= (baseRadiusMeters / 1609.34) * safeParams.radiusMultiplier &&
             matchesBudget(opt, req.budget || '$$', downvoteReasons, refProfile || undefined);
    })
    .sort((a, b) => {
      let scoreA = (parseFloat(a.rating || '0') * 10) + Math.min(10, (a.ratingCount || 0) / 50);
      let scoreB = (parseFloat(b.rating || '0') * 10) + Math.min(10, (b.ratingCount || 0) / 50);
      
      // Boost score if option matches reference profile's preferred types
      if (refProfile && a.tags) {
        const matchA = a.tags.some(t => refProfile.preferredTypes.includes(t.toLowerCase()));
        if (matchA) scoreA += 5;
      }
      if (refProfile && b.tags) {
        const matchB = b.tags.some(t => refProfile.preferredTypes.includes(t.toLowerCase()));
        if (matchB) scoreB += 5;
      }
      
      return scoreB - scoreA;
    });

  for (const opt of safeCandidates) {
    if (bucketCounts.safe >= safeParams.count) break;
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
  const exploreCandidates = allCandidates
    .filter(opt => {
      const rating = parseFloat(opt.rating || '0');
      const reviewCount = opt.ratingCount || 0;
      const dist = parseFloat(opt.distance?.replace(' mi', '') || '0');
      const id = getUniqueId(opt);
      // Prefer lower review count (newer/less discovered places)
      return !usedIds.has(id) &&
             rating >= exploreParams.minRating && 
             reviewCount < 200 && // Favor less-reviewed places
             dist <= (baseRadiusMeters / 1609.34) * exploreRadiusMult &&
             matchesBudget(opt, req.budget || '$$', downvoteReasons, refProfile || undefined);
    })
    .sort((a, b) => {
      // Sort by rating but prefer fewer reviews (more novel)
      const noveltyA = 100 - Math.min(100, (a.ratingCount || 0) / 2);
      const noveltyB = 100 - Math.min(100, (b.ratingCount || 0) / 2);
      return noveltyB - noveltyA;
    });

  for (const opt of exploreCandidates) {
    if (bucketCounts.explore >= exploreParams.count) break;
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
    if (bucketCounts.wildcard >= wildcardParams.count) break;
    const id = getUniqueId(opt);
    if (!usedIds.has(id)) {
      opt.generationType = 'wildcard';
      selectedOptions.push(opt);
      usedIds.add(id);
      bucketCounts.wildcard++;
    }
  }

  // Redistribute quota if buckets are empty
  const targetCounts = { safe: 2, explore: 2, wildcard: 1 };
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

  // Log bucket distribution and downvote aggregates for debugging
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

  for (const type of types.slice(0, 3)) {
    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.googleMapsUri,places.primaryType,places.editorialSummary',
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
          tags: [type.replace('_', ' ')],
          detailUrl: place.websiteUri || place.googleMapsUri,
          reservationUrl: null,
          ticketUrl: null,
          eventUrl: null,
          source: 'Google',
          placeId: place.id, // For deduplication
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

    opt.score = score;
  }

  return options.sort((a, b) => (b.score || 0) - (a.score || 0));
}
