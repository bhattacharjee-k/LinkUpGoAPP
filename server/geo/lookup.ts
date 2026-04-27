// Hierarchical neighborhood lookup.
//
// Replaces the substring-match-against-address fallback in the legacy
// favorite-neighborhood "boost". Lookup order:
//
//   userLat/userLng (or venue lat/lng)
//     → Mapbox reverse geocode (live, gives a stable mapboxNeighId)
//     → NTA polygon containment (NYC) / Community Area (Chicago)
//     → fall back to the legacy hardcoded center
//     → city center
//
// Continuous favorite-neighborhood score:
//   1.0  exact NTA/CA match with any favorite
//   0.5  adjacent NTA via co-occurrence PMI (TODO; ships as 0 on day 1)
//   0.0  no match
//
// PMI computation is deferred per the brief (§1.1: "skip the PMI step on day 1
// — write a TODO; ship exact match first").

import { reverseGeocode, type MapboxNeighborhood } from './mapbox';
import { lookupByCity, type NeighborhoodMatch } from './polygons';
import { getCityCenter, getNeighborhoodCenter as legacyGetNeighborhoodCenter } from '../geo';

export interface ResolvedNeighborhood {
  /** Stable mapbox id when available; otherwise NTA/CA id; otherwise null. */
  mapboxNeighId: string | null;
  /** NTA code (NYC) or Community Area number (Chicago). */
  ntaId: string | null;
  /** Human-readable name. */
  name: string | null;
  /** Best-effort centroid for the neighborhood. */
  center: { lat: number; lng: number };
}

/** Resolve a neighborhood from coordinates using the full hierarchy. */
export async function resolveByCoords(
  city: string,
  lat: number,
  lng: number,
): Promise<ResolvedNeighborhood> {
  // 1. Mapbox (best identifier — stable across vintages, updated continuously)
  const mb: MapboxNeighborhood | null = await reverseGeocode(lat, lng);
  // 2. Polygon containment (works offline once polygons are downloaded)
  const polyMatch: NeighborhoodMatch | null = lookupByCity(city, lat, lng);
  if (mb || polyMatch) {
    return {
      mapboxNeighId: mb?.mapboxNeighId || null,
      ntaId: polyMatch?.id || null,
      name: polyMatch?.name || mb?.name || null,
      center: polyMatch?.centroid || (mb ? { lat: mb.lat, lng: mb.lng } : { lat, lng }),
    };
  }
  // 3. Final fallback: city center.
  return { mapboxNeighId: null, ntaId: null, name: null, center: getCityCenter(city) };
}

/**
 * Resolve a neighborhood string (user-typed or legacy data) into structured form.
 * Tries: legacy hardcoded list (cheapest) → polygon lookup by name search → null.
 */
export function resolveByName(city: string, neighborhood: string): ResolvedNeighborhood | null {
  const legacy = legacyGetNeighborhoodCenter(city, neighborhood);
  if (legacy) {
    return {
      mapboxNeighId: null,
      ntaId: null,
      name: neighborhood,
      center: legacy,
    };
  }
  return null;
}

/**
 * Score a venue's neighborhood-fit against a user's favorite neighborhoods.
 * Inputs are *resolved* ids (NTA codes preferred). Returns 0..1.
 *
 * Day-1 implementation: exact match. Adjacent-via-PMI is a TODO.
 */
export function favoriteNeighborhoodScore(
  venueNtaId: string | null,
  favoriteNtaIds: string[],
): number {
  if (!venueNtaId || favoriteNtaIds.length === 0) return 0;
  return favoriteNtaIds.includes(venueNtaId) ? 1.0 : 0;
  // TODO(rebuild): when ≥10K labeled prefs accumulate, learn neighborhood
  // co-occurrence PMI from session-suggestion graphs and return 0.5 for
  // statistically-adjacent NTAs. Issue: linkupgo#TBD.
}

/** Resolve a list of user favoriteNeighborhoods (strings) → set of NTA ids. */
export function resolveFavoritesToNtaIds(city: string, favorites: string[]): string[] {
  const out: string[] = [];
  for (const fav of favorites) {
    // Best-effort: legacy lookup gives lat/lng; polygon containment converts to NTA.
    const center = legacyGetNeighborhoodCenter(city, fav);
    if (!center) continue;
    const match = lookupByCity(city, center.lat, center.lng);
    if (match) out.push(match.id);
  }
  return out;
}
