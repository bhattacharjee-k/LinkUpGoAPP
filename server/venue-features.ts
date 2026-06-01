import { nii } from '@shared/energy';
import type { SuggestionOption } from './suggestions';

export interface VenueFeatures {
  spend: number;
  lateness: number;
  intensity: number;
  crowd: number;
  distinctiveness?: number;
}

type VenueFeaturePlace = Partial<SuggestionOption> & {
  userRatingCount?: number;
  types?: string[];
  editorialSummary?: string | { text?: string };
};

const FEATURE_CACHE_TTL_MS = 15 * 60 * 1000;
const venueFeatureCache = new Map<string, { features: VenueFeatures; ts: number }>();

const PRICE_TO_SPEND: Record<string, number> = {
  '$': 0,
  '$$': 0.33,
  '$$$': 0.66,
  '$$$$': 1,
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 0,
  PRICE_LEVEL_MODERATE: 0.33,
  PRICE_LEVEL_EXPENSIVE: 0.66,
  PRICE_LEVEL_VERY_EXPENSIVE: 1,
};

const HIGH_INTENSITY_TERMS = [
  'night_club',
  'night club',
  'club',
  'dance',
  'dancing',
  'dj',
  'late-night',
  'late night',
  'lounge',
  'rooftop',
  'packed',
  'party',
];

const LOW_INTENSITY_TERMS = [
  'cafe',
  'coffee',
  'bookstore',
  'park',
  'museum',
  'wine bar',
  'wine-bar',
  'listening bar',
  'quiet',
  'low-key',
  'cozy',
  'intimate',
  'brunch',
];

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'text' in value) {
    const text = (value as { text?: unknown }).text;
    return typeof text === 'string' ? text : '';
  }
  return '';
}

export function spendFromPriceLevel(priceLevel?: string | number | null): number {
  if (typeof priceLevel === 'number') {
    if (priceLevel <= 1) return 0;
    if (priceLevel === 2) return 0.33;
    if (priceLevel === 3) return 0.66;
    return 1;
  }
  if (!priceLevel) return 0.33;
  return PRICE_TO_SPEND[priceLevel] ?? 0.33;
}

function parseMeridiemTime(rawTime: string): number | null {
  const match = rawTime.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AP]M)$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3].toUpperCase();

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (meridiem === 'AM') {
    hour = hour === 12 ? 0 : hour;
  } else {
    hour = hour === 12 ? 12 : hour + 12;
  }

  return hour + minute / 60;
}

function normalizeClosingHour(hour: number): number {
  return hour <= 8 ? hour + 24 : hour;
}

export function latenessFromOpeningHours(openingHoursText?: string[] | null): number {
  if (!openingHoursText || openingHoursText.length === 0) return 0.5;

  let latestClose: number | null = null;

  for (const line of openingHoursText) {
    const normalized = line.replace(/\u2013|\u2014/g, '-');
    if (/open 24 hours/i.test(normalized)) return 1;
    if (/closed/i.test(normalized)) continue;

    // Collect every closing time on the line — split-hours lines like
    // "11:00 AM - 2:00 PM, 5:00 PM - 11:00 PM" have more than one — and keep the latest.
    const closeTexts: string[] = [];
    const untilMatch = normalized.match(/until\s+(\d{1,2}(?::\d{2})?\s*[AP]M)/i);
    if (untilMatch?.[1]) closeTexts.push(untilMatch[1]);
    for (const rangeMatch of normalized.matchAll(/-\s*(\d{1,2}(?::\d{2})?\s*[AP]M)/gi)) {
      if (rangeMatch[1]) closeTexts.push(rangeMatch[1]);
    }

    for (const closeText of closeTexts) {
      const parsed = parseMeridiemTime(closeText);
      if (parsed == null) continue;
      const closeHour = normalizeClosingHour(parsed);
      latestClose = latestClose == null ? closeHour : Math.max(latestClose, closeHour);
    }
  }

  if (latestClose == null) return 0.5;
  if (latestClose <= 22) return 0;
  if (latestClose >= 27) return 1;
  return clamp01((latestClose - 22) / 5);
}

export function crowdFromRatingCount(ratingCount?: number | null): number {
  if (!ratingCount || ratingCount <= 0) return 0.25;
  return clamp01(Math.log10(ratingCount + 1) / Math.log10(5000));
}

export function intensityFromVenue(place: VenueFeaturePlace): number {
  const tagsAndTypes = [...(place.tags || []), ...(place.types || [])].join(' ');
  const description = [
    place.description || '',
    normalizeText(place.editorialSummary),
  ].join(' ');
  const text = `${tagsAndTypes} ${description}`.toLowerCase();

  const highHits = HIGH_INTENSITY_TERMS.filter(term => text.includes(term)).length;
  const lowHits = LOW_INTENSITY_TERMS.filter(term => text.includes(term)).length;

  // TODO: upgrade to review-NLP for a real venue-character signal.
  if (highHits === 0 && lowHits === 0) return 0.5;
  if (highHits > lowHits) return clamp01(0.65 + Math.min(0.3, highHits * 0.08) - lowHits * 0.05);
  if (lowHits > highHits) return clamp01(0.35 - Math.min(0.25, lowHits * 0.06) + highHits * 0.05);
  return 0.5;
}

export function computeVenueFeatures(place: VenueFeaturePlace): VenueFeatures {
  const ratingCount = place.ratingCount ?? place.userRatingCount;

  return {
    spend: spendFromPriceLevel(place.priceLevel),
    lateness: latenessFromOpeningHours(place.openingHoursText),
    // TODO: upgrade to review-NLP for intensity once review text is available.
    intensity: intensityFromVenue(place),
    // TODO: upgrade to review-NLP/capacity-aware crowd modeling.
    crowd: crowdFromRatingCount(ratingCount),
  };
}

export function venueNii(features: VenueFeatures): number {
  return nii(features);
}

function cacheKeyForPlace(place: VenueFeaturePlace): string | null {
  if (place.placeId) return place.placeId;
  if (place.title) return `title:${place.title.toLowerCase().trim()}`;
  return null;
}

export function getVenueFeatures(place: VenueFeaturePlace, now = Date.now()): VenueFeatures {
  const key = cacheKeyForPlace(place);
  if (key) {
    const cached = venueFeatureCache.get(key);
    if (cached && now - cached.ts < FEATURE_CACHE_TTL_MS) {
      return cached.features;
    }
  }

  const features = computeVenueFeatures(place);
  if (key) {
    venueFeatureCache.set(key, { features, ts: now });
  }
  return features;
}

export function clearVenueFeatureCache(): void {
  venueFeatureCache.clear();
}
