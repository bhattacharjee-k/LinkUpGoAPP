import { getSearchCenter, haversineDistance, isWithinCity, LatLng } from './geo';

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;

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
  'Comedy': 'arts & theatre',
  'Culture': 'arts & theatre',
  'Museum': 'arts & theatre',
  'Active': 'sports',
};

const priceLevelMap: Record<string, string> = {
  'PRICE_LEVEL_INEXPENSIVE': '$',
  'PRICE_LEVEL_MODERATE': '$$',
  'PRICE_LEVEL_EXPENSIVE': '$$$',
  'PRICE_LEVEL_VERY_EXPENSIVE': '$$$$',
};

const suggestionsCache = new Map<string, { options: SuggestionOption[]; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

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

export async function getSuggestions(req: SuggestRequest): Promise<{ options: SuggestionOption[]; meta: SuggestMeta }> {
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

  const center = getSearchCenter(req.city, req.neighborhood, req.userLat, req.userLng);
  const radiusMeters = 3000;

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

  const [placesResults, eventsResults] = await Promise.all([
    fetchGooglePlaces(center, radiusMeters, Array.from(placeTypes), req.city),
    ticketmasterClasses.size > 0 
      ? fetchTicketmasterEvents(center, Array.from(ticketmasterClasses), req.specificDate)
      : Promise.resolve([]),
  ]);

  let allOptions = [...placesResults, ...eventsResults];

  allOptions = allOptions.filter(opt => {
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

  allOptions = scoreAndRank(allOptions, req, center);

  const topOptions = allOptions.slice(0, 5);

  suggestionsCache.set(cacheKey, { options: topOptions, timestamp: Date.now() });

  return {
    options: topOptions,
    meta: {
      city: req.city,
      centerLatLng: center,
      radiusMeters,
      placesCount: placesResults.length,
      eventsCount: eventsResults.length,
      filteredCount: topOptions.length,
    },
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
  const radiusMiles = 10;

  const now = new Date();
  const startDateTime = specificDate ? new Date(specificDate) : now;
  const endDateTime = new Date(startDateTime);
  endDateTime.setDate(endDateTime.getDate() + 7);

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
        console.error(`Ticketmaster API error:`, await response.text());
        continue;
      }

      const data = await response.json();
      const events = data._embedded?.events || [];

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
