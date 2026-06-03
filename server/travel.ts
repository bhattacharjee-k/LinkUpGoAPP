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

function distanceMatrixMode(mode: Mode): 'driving' | 'walking' | 'transit' {
  if (mode === 'walk') return 'walking';
  if (mode === 'transit') return 'transit';
  return 'driving';
}

// Google Distance Matrix needs a now-or-FUTURE epoch (seconds): required for transit,
// and enables traffic for driving. Coerce a past/invalid departBucket forward.
export function futureDepartureEpochSec(departBucket: string, nowMs: number = Date.now()): number {
  const ts = Date.parse(departBucket);
  if (Number.isFinite(ts) && ts > nowMs) return Math.floor(ts / 1000);
  return Math.floor(nowMs / 1000) + 60;
}

interface DistanceMatrixResponse {
  status: string;
  rows?: Array<{
    elements?: Array<{
      status: string;
      duration?: { value: number };
      duration_in_traffic?: { value: number };
    }>;
  }>;
}

// Uses the Google Distance Matrix API. Unlike Routes API computeRouteMatrix, this supports
// TRANSIT (NYC's dominant mode) alongside driving/walking in a single matrix call, with a
// now-or-future departure_time (schedule-aware for transit, traffic-aware for driving).
export class GoogleDistanceMatrixProvider implements RouteMatrixProvider {
  constructor(private readonly apiKey = getRoutesApiKey()) {}

  async getEtas(origins: LatLng[], mode: Mode, destinations: LatLng[], departBucket: string): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('Google Distance Matrix API key is not configured');
    }

    const params = new URLSearchParams({
      origins: origins.map(o => `${o.lat},${o.lng}`).join('|'),
      destinations: destinations.map(d => `${d.lat},${d.lng}`).join('|'),
      mode: distanceMatrixMode(mode),
      departure_time: String(futureDepartureEpochSec(departBucket)),
      key: this.apiKey,
    });

    const response = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Google Distance Matrix HTTP ${response.status}`);
    }

    const data = (await response.json()) as DistanceMatrixResponse;
    if (data.status !== 'OK') {
      throw new Error(`Google Distance Matrix status: ${data.status}`);
    }

    // Per-cell: prefer traffic-aware duration; non-OK element → non-finite so the caller
    // falls back to Haversine for that pair.
    return origins.map((_, i) =>
      destinations.map((_, j) => {
        const el = data.rows?.[i]?.elements?.[j];
        if (!el || el.status !== 'OK') return Number.POSITIVE_INFINITY;
        const sec = el.duration_in_traffic?.value ?? el.duration?.value;
        return typeof sec === 'number' && Number.isFinite(sec) ? sec : Number.POSITIVE_INFINITY;
      }),
    );
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
  const provider = opts.provider || (getRoutesApiKey() ? new GoogleDistanceMatrixProvider() : new HaversineFallbackProvider());

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
