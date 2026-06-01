import {
  getCityCenter,
  getNeighborhoodCenter,
  haversineDistance,
  type LatLng,
} from './geo';

export type Mode = 'walk' | 'transit' | 'car';

export interface Member {
  name?: string;
  origin: LatLng | string;
  mode: Mode;
  toleranceMin?: number;
}

export interface RouteMatrixProvider {
  getEtas(origins: LatLng[], mode: Mode, destinations: LatLng[], departBucket: string): Promise<number[][]>;
}

export interface TravelScoreResult {
  score: number;
  maxStrain: number;
  reachableByAll: boolean;
  hardUnreachable: boolean;
  perMember: Array<{ name?: string; etaMin: number; strain: number }>;
}

export const DEFAULT_TOLERANCE_MIN: Record<Mode, number> = {
  walk: 20,
  transit: 30,
  car: 45,
};

export const MODE_SPEED_MPH: Record<Mode, number> = {
  walk: 3,
  transit: 12,
  car: 18,
};

const ETA_CACHE_TTL_MS = 15 * 60 * 1000;
const HARD_UNREACHABLE_STRAIN = 2.0;
const etaCache = new Map<string, { etaSec: number; ts: number }>();

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function isLatLng(origin: LatLng | string): origin is LatLng {
  return typeof origin !== 'string' &&
    Number.isFinite(origin.lat) &&
    Number.isFinite(origin.lng);
}

function toleranceFor(member: Member): number {
  return member.toleranceMin ?? DEFAULT_TOLERANCE_MIN[member.mode];
}

function pointKey(point: LatLng): string {
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

function etaCacheKey(origin: LatLng, mode: Mode, departBucket: string, venue: LatLng): string {
  return `${pointKey(origin)}|${mode}|${departBucket}|${pointKey(venue)}`;
}

function getRoutesApiKey(): string | undefined {
  return process.env.GOOGLE_ROUTES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY;
}

export function resolveOrigin(member: Member, city: string): LatLng {
  if (isLatLng(member.origin)) return member.origin;
  return getNeighborhoodCenter(city, member.origin) || getCityCenter(city);
}

export function prefilterRadiusMiles(member: Member, city: string): number {
  resolveOrigin(member, city);
  return (toleranceFor(member) / 60) * MODE_SPEED_MPH[member.mode];
}

export function strain(etaSec: number, toleranceMin: number): number {
  if (toleranceMin <= 0) return Number.POSITIVE_INFINITY;
  return etaSec / (toleranceMin * 60);
}

function googleTravelMode(mode: Mode): 'WALK' | 'TRANSIT' | 'DRIVE' {
  if (mode === 'walk') return 'WALK';
  if (mode === 'transit') return 'TRANSIT';
  return 'DRIVE';
}

export class GoogleRoutesProvider implements RouteMatrixProvider {
  constructor(private readonly apiKey = getRoutesApiKey()) {}

  async getEtas(origins: LatLng[], mode: Mode, destinations: LatLng[], departBucket: string): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('Google Routes API key is not configured');
    }

    // TODO: transit mode may require per-leg computeRoutes or the legacy Distance Matrix API
    // for better transit-specific behavior. Keep this behind the provider boundary.
    // TODO(Phase 2 / real keys): departureTime must be a FUTURE RFC3339 timestamp and is
    // mode-restricted. The current departBucket (hour-rounded ISO, possibly in the past) will
    // make Google reject the request, causing a SILENT fallback to Haversine. Fix before relying
    // on live Google ETAs.
    const body = {
      origins: origins.map(origin => ({
        waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      })),
      destinations: destinations.map(destination => ({
        waypoint: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      })),
      travelMode: googleTravelMode(mode),
      routingPreference: mode === 'car' ? 'TRAFFIC_AWARE' : undefined,
      departureTime: departBucket,
    };

    const response = await fetch('https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'originIndex,destinationIndex,duration',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Google Routes API error: ${response.status}`);
    }

    const cells = await response.json() as Array<{
      originIndex?: number;
      destinationIndex?: number;
      duration?: string;
    }>;
    const matrix = origins.map(() => destinations.map(() => Number.POSITIVE_INFINITY));

    for (const cell of cells) {
      const originIndex = cell.originIndex ?? 0;
      const destinationIndex = cell.destinationIndex ?? 0;
      const durationSec = Number(String(cell.duration || '').replace(/s$/, ''));
      if (
        matrix[originIndex] &&
        Number.isFinite(durationSec) &&
        destinationIndex >= 0 &&
        destinationIndex < destinations.length
      ) {
        matrix[originIndex][destinationIndex] = durationSec;
      }
    }

    return matrix;
  }
}

export class HaversineFallbackProvider implements RouteMatrixProvider {
  async getEtas(origins: LatLng[], mode: Mode, destinations: LatLng[], _departBucket: string): Promise<number[][]> {
    const speed = MODE_SPEED_MPH[mode];
    return origins.map(origin =>
      destinations.map(destination =>
        (haversineDistance(origin.lat, origin.lng, destination.lat, destination.lng) / speed) * 3600,
      ),
    );
  }
}

function defaultDepartBucket(now: number): string {
  const date = new Date(now);
  date.setMinutes(0, 0, 0);
  return date.toISOString();
}

async function getEtaSec(
  origin: LatLng,
  mode: Mode,
  venue: LatLng,
  departBucket: string,
  now: number,
  provider: RouteMatrixProvider,
): Promise<number> {
  const key = etaCacheKey(origin, mode, departBucket, venue);
  const cached = etaCache.get(key);
  if (cached && now - cached.ts < ETA_CACHE_TTL_MS) {
    return cached.etaSec;
  }

  let etaSec: number;
  try {
    const matrix = await provider.getEtas([origin], mode, [venue], departBucket);
    etaSec = matrix[0]?.[0];
    if (!Number.isFinite(etaSec)) {
      throw new Error('Route provider returned a non-finite ETA');
    }
  } catch {
    const fallback = new HaversineFallbackProvider();
    const matrix = await fallback.getEtas([origin], mode, [venue], departBucket);
    etaSec = matrix[0][0];
  }

  etaCache.set(key, { etaSec, ts: now });
  return etaSec;
}

export async function travelScore(
  members: Member[],
  venue: LatLng,
  opts: { city: string; provider?: RouteMatrixProvider; departBucket?: string; now?: number },
): Promise<TravelScoreResult> {
  const now = opts.now ?? Date.now();
  const departBucket = opts.departBucket || defaultDepartBucket(now);
  const provider = opts.provider || (getRoutesApiKey() ? new GoogleRoutesProvider() : new HaversineFallbackProvider());

  if (members.length === 0) {
    return { score: 1, maxStrain: 0, reachableByAll: true, hardUnreachable: false, perMember: [] };
  }

  const perMember = await Promise.all(members.map(async member => {
    const origin = resolveOrigin(member, opts.city);
    const etaSec = await getEtaSec(origin, member.mode, venue, departBucket, now, provider);
    const memberStrain = strain(etaSec, toleranceFor(member));
    return {
      name: member.name,
      etaMin: etaSec / 60,
      strain: memberStrain,
    };
  }));

  const strains = perMember.map(member => member.strain);
  const maxStrain = Math.max(...strains);
  const minStrain = Math.min(...strains);
  const balance = maxStrain - minStrain;
  const score = clamp01(clamp01(1 - maxStrain) - 0.1 * balance);

  return {
    score,
    maxStrain,
    reachableByAll: maxStrain <= 1,
    hardUnreachable: maxStrain > HARD_UNREACHABLE_STRAIN,
    perMember,
  };
}

export function clearTravelCache(): void {
  etaCache.clear();
}
