// Thin wrapper around Mapbox Geocoding v6 reverse geocoding.
// HUMAN REQUIRED: provision MAPBOX_API_KEY before this module returns non-null
// data — falls back gracefully when unset so dev/test environments don't break.
//
// Docs: https://docs.mapbox.com/api/search/geocoding/

const MAPBOX_REVERSE_URL = 'https://api.mapbox.com/search/geocode/v6/reverse';

export interface MapboxNeighborhood {
  /** Mapbox neighborhood id (stable identifier), e.g. 'neighborhood.123456'. */
  mapboxNeighId: string;
  name: string;
  /** Center coords from the Mapbox feature. */
  lat: number;
  lng: number;
}

interface MapboxFeature {
  id: string;
  properties: {
    feature_type: string;
    name: string;
    context?: Record<string, { id?: string; name?: string }>;
  };
  geometry: { coordinates: [number, number] };
}

interface MapboxReverseResponse {
  features: MapboxFeature[];
}

let warned = false;

export async function reverseGeocode(lat: number, lng: number): Promise<MapboxNeighborhood | null> {
  const key = process.env.MAPBOX_API_KEY;
  if (!key) {
    if (!warned) {
      console.warn('[mapbox] MAPBOX_API_KEY not set — reverseGeocode returning null. HUMAN REQUIRED.');
      warned = true;
    }
    return null;
  }
  try {
    const url = `${MAPBOX_REVERSE_URL}?longitude=${lng}&latitude=${lat}&types=neighborhood&access_token=${encodeURIComponent(key)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`[mapbox] reverseGeocode ${resp.status}: ${await resp.text()}`);
      return null;
    }
    const data = (await resp.json()) as MapboxReverseResponse;
    const f = data.features?.find((feat) => feat.properties.feature_type === 'neighborhood');
    if (!f) return null;
    return {
      mapboxNeighId: f.id,
      name: f.properties.name,
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    };
  } catch (err) {
    console.error('[mapbox] reverseGeocode failed:', err);
    return null;
  }
}
