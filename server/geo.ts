export interface LatLng {
  lat: number;
  lng: number;
}

export const CITY_CENTERS: Record<string, LatLng> = {
  'NYC': { lat: 40.7580, lng: -73.9855 },
  'Chicago': { lat: 41.8781, lng: -87.6298 },
};

export const NYC_NEIGHBORHOODS: Record<string, LatLng> = {
  'Manhattan': { lat: 40.7831, lng: -73.9712 },
  'Midtown': { lat: 40.7549, lng: -73.9840 },
  'Upper East Side': { lat: 40.7736, lng: -73.9566 },
  'Upper West Side': { lat: 40.7870, lng: -73.9754 },
  'Chelsea': { lat: 40.7465, lng: -74.0014 },
  'West Village': { lat: 40.7358, lng: -74.0036 },
  'East Village': { lat: 40.7265, lng: -73.9815 },
  'Greenwich Village': { lat: 40.7336, lng: -73.9991 },
  'SoHo': { lat: 40.7233, lng: -73.9961 },
  'Tribeca': { lat: 40.7163, lng: -74.0086 },
  'Lower East Side': { lat: 40.7150, lng: -73.9843 },
  'Financial District': { lat: 40.7075, lng: -74.0089 },
  'Harlem': { lat: 40.8116, lng: -73.9465 },
  'Brooklyn Heights': { lat: 40.6960, lng: -73.9936 },
  'Williamsburg': { lat: 40.7081, lng: -73.9571 },
  'Bushwick': { lat: 40.6942, lng: -73.9215 },
  'Greenpoint': { lat: 40.7282, lng: -73.9510 },
  'DUMBO': { lat: 40.7033, lng: -73.9881 },
  'Park Slope': { lat: 40.6710, lng: -73.9814 },
  'Cobble Hill': { lat: 40.6869, lng: -73.9961 },
  'Carroll Gardens': { lat: 40.6795, lng: -73.9991 },
  'Prospect Heights': { lat: 40.6775, lng: -73.9692 },
  'Crown Heights': { lat: 40.6694, lng: -73.9422 },
  'Fort Greene': { lat: 40.6892, lng: -73.9742 },
  'Astoria': { lat: 40.7720, lng: -73.9301 },
  'Long Island City': { lat: 40.7447, lng: -73.9485 },
  'Flushing': { lat: 40.7654, lng: -73.8318 },
};

export const CHICAGO_NEIGHBORHOODS: Record<string, LatLng> = {
  'The Loop': { lat: 41.8819, lng: -87.6278 },
  'River North': { lat: 41.8920, lng: -87.6346 },
  'Gold Coast': { lat: 41.9044, lng: -87.6280 },
  'Old Town': { lat: 41.9109, lng: -87.6368 },
  'Lincoln Park': { lat: 41.9214, lng: -87.6513 },
  'Lakeview': { lat: 41.9434, lng: -87.6553 },
  'Boystown': { lat: 41.9453, lng: -87.6520 },
  'Wrigleyville': { lat: 41.9484, lng: -87.6553 },
  'Wicker Park': { lat: 41.9088, lng: -87.6796 },
  'Bucktown': { lat: 41.9214, lng: -87.6796 },
  'Logan Square': { lat: 41.9298, lng: -87.7083 },
  'Ukrainian Village': { lat: 41.8989, lng: -87.6827 },
  'West Loop': { lat: 41.8827, lng: -87.6519 },
  'Fulton Market': { lat: 41.8867, lng: -87.6519 },
  'Streeterville': { lat: 41.8929, lng: -87.6175 },
  'Magnificent Mile': { lat: 41.8948, lng: -87.6246 },
  'South Loop': { lat: 41.8569, lng: -87.6247 },
  'Pilsen': { lat: 41.8554, lng: -87.6637 },
  'Hyde Park': { lat: 41.7943, lng: -87.5907 },
  'Bronzeville': { lat: 41.8206, lng: -87.6172 },
  'Chinatown': { lat: 41.8517, lng: -87.6318 },
  'Bridgeport': { lat: 41.8378, lng: -87.6497 },
  'Rogers Park': { lat: 42.0087, lng: -87.6676 },
  'Uptown': { lat: 41.9659, lng: -87.6534 },
  'Andersonville': { lat: 41.9798, lng: -87.6686 },
  'Ravenswood': { lat: 41.9745, lng: -87.6742 },
  'Albany Park': { lat: 41.9681, lng: -87.7234 },
  'Irving Park': { lat: 41.9537, lng: -87.7364 },
  'Humboldt Park': { lat: 41.9064, lng: -87.7220 },
  'Garfield Park': { lat: 41.8800, lng: -87.7289 },
  'Near North Side': { lat: 41.9030, lng: -87.6324 },
};

export function getNeighborhoodCenter(city: string, neighborhood: string): LatLng | null {
  const normalizedNeighborhood = neighborhood.toLowerCase().trim();
  
  const lookupTable = city === 'NYC' ? NYC_NEIGHBORHOODS : CHICAGO_NEIGHBORHOODS;
  
  for (const [name, coords] of Object.entries(lookupTable)) {
    if (name.toLowerCase() === normalizedNeighborhood) {
      return coords;
    }
  }
  
  return null;
}

export function getCityCenter(city: string): LatLng {
  return CITY_CENTERS[city] || CITY_CENTERS['NYC'];
}

export function getSearchCenter(city: string, neighborhood?: string, userLat?: number, userLng?: number): LatLng {
  if (userLat && userLng) {
    return { lat: userLat, lng: userLng };
  }
  
  if (neighborhood) {
    const neighborhoodCenter = getNeighborhoodCenter(city, neighborhood);
    if (neighborhoodCenter) {
      return neighborhoodCenter;
    }
  }
  
  return getCityCenter(city);
}

export function isWithinCity(city: string, lat: number, lng: number): boolean {
  const cityCenter = getCityCenter(city);
  const distance = haversineDistance(cityCenter.lat, cityCenter.lng, lat, lng);
  
  const maxRadius = city === 'NYC' ? 35 : 30;
  return distance <= maxRadius;
}

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function computeMidpoint(points: LatLng[]): LatLng {
  if (points.length === 0) return { lat: 0, lng: 0 };
  if (points.length === 1) return points[0];

  let x = 0, y = 0, z = 0;
  for (const p of points) {
    const latRad = toRad(p.lat);
    const lngRad = toRad(p.lng);
    x += Math.cos(latRad) * Math.cos(lngRad);
    y += Math.cos(latRad) * Math.sin(lngRad);
    z += Math.sin(latRad);
  }
  x /= points.length;
  y /= points.length;
  z /= points.length;

  const lngRad = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const latRad = Math.atan2(z, hyp);

  return {
    lat: latRad * (180 / Math.PI),
    lng: lngRad * (180 / Math.PI),
  };
}
