// Neighborhood coordinates lookup for Chicago and NYC
export interface NeighborhoodCoords {
  lat: number;
  lng: number;
}

export const NEIGHBORHOOD_COORDS: Record<string, Record<string, NeighborhoodCoords>> = {
  Chicago: {
    'River North': { lat: 41.8919, lng: -87.6278 },
    'West Loop': { lat: 41.8821, lng: -87.6477 },
    'Wicker Park': { lat: 41.9089, lng: -87.6774 },
    'Logan Square': { lat: 41.9292, lng: -87.7043 },
    'Lincoln Park': { lat: 41.9234, lng: -87.6467 },
    'Lakeview': { lat: 41.9398, lng: -87.6538 },
    'Bucktown': { lat: 41.9173, lng: -87.6799 },
    'Old Town': { lat: 41.9113, lng: -87.6345 },
    'Gold Coast': { lat: 41.9028, lng: -87.6275 },
    'Streeterville': { lat: 41.8928, lng: -87.6180 },
    'South Loop': { lat: 41.8690, lng: -87.6270 },
    'Fulton Market': { lat: 41.8862, lng: -87.6513 },
  },
  NYC: {
    'Williamsburg': { lat: 40.7081, lng: -73.9571 },
    'East Village': { lat: 40.7264, lng: -73.9818 },
    'Lower East Side': { lat: 40.7155, lng: -73.9874 },
    'Midtown': { lat: 40.7549, lng: -73.9840 },
    'Chelsea': { lat: 40.7465, lng: -74.0014 },
    'Bushwick': { lat: 40.6942, lng: -73.9197 },
    'SoHo': { lat: 40.7233, lng: -74.0030 },
    'West Village': { lat: 40.7358, lng: -74.0036 },
    'Upper East Side': { lat: 40.7736, lng: -73.9566 },
    'Upper West Side': { lat: 40.7870, lng: -73.9754 },
    'Brooklyn Heights': { lat: 40.6955, lng: -73.9937 },
    'Tribeca': { lat: 40.7163, lng: -74.0086 },
  },
};

// Get coordinates for a neighborhood or city default
export function getLocationCoords(city: string, neighborhood?: string): NeighborhoodCoords | null {
  // City default coords (from existing CITY_COORDS)
  const cityDefaults: Record<string, NeighborhoodCoords> = {
    'Chicago': { lat: 41.8781, lng: -87.6298 },
    'NYC': { lat: 40.7128, lng: -74.0060 },
  };

  if (!neighborhood) {
    return cityDefaults[city] || null;
  }

  // Try exact match first
  const cityNeighborhoods = NEIGHBORHOOD_COORDS[city];
  if (cityNeighborhoods && cityNeighborhoods[neighborhood]) {
    return cityNeighborhoods[neighborhood];
  }

  // Try case-insensitive match
  if (cityNeighborhoods) {
    const normalizedInput = neighborhood.toLowerCase().trim();
    const match = Object.keys(cityNeighborhoods).find(
      key => key.toLowerCase() === normalizedInput
    );
    if (match) {
      return cityNeighborhoods[match];
    }
  }

  // Fallback to city center
  return cityDefaults[city] || null;
}

// Get list of neighborhoods for a city (for autocomplete/suggestions)
export function getCityNeighborhoods(city: string): string[] {
  return Object.keys(NEIGHBORHOOD_COORDS[city] || {});
}
