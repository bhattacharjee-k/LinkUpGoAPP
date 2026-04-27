// Phase 1.3: anti-popularity preprocessing.
//
// Sits between Phase 2 (candidate sourcing) and Phase 1.4 (PoLL judges). Per
// the rebuild brief §1.3:
//
//   1. Strip venue names — replace with neutral ids in the judge payload.
//      "Single biggest debiasing lever — do not skip."
//   2. Normalize description length (truncate/pad to a fixed budget).
//   3. Compute popularity proxy = log(reviewCount + 1) as a structured feature.
//   4. Multi-tag pre-filter (intersection of tags ∩ excludeSet, not just tags[0]).
//   5. Soft transport-mode score (continuous penalty, not a hard cap).
//   6. Dedupe by (name_normalized, h3_res9), so same name across boroughs stays distinct.

import type { SuggestionOption } from '../suggestions';
import type { EnrichedCandidate, SuggestionEnvelope } from './envelope';
import { h3Cell, H3_RES_BLOCK, H3_RES_NEIGHBORHOOD, h3Coarsen } from '../geo/h3';
import { resolveByCoords } from '../geo/lookup';

const DESCRIPTION_LENGTH = 220;
const PADDING = '…';

interface TransportThresholds {
  walk: number;
  transit: number;
  car: number;
}

const DEFAULT_THRESHOLDS: TransportThresholds = { walk: 1, transit: 5, car: 15 };

function normalizeName(s: string): string {
  // Plain ASCII normalization. Loses non-Latin venue names but the audience is
  // NYC/Chicago and Google Places normalizes display names to Latin script in
  // most cases. If we expand internationally, swap to a Unicode-aware regex
  // and bump tsconfig target to ES2018+.
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateDescription(s: string | undefined): string {
  if (!s) return '';
  if (s.length <= DESCRIPTION_LENGTH) return s;
  return s.slice(0, DESCRIPTION_LENGTH - 1) + PADDING;
}

function tierFromBudget(b: string | undefined | null): number | null {
  if (!b) return null;
  const map: Record<string, number> = { '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 };
  return map[b] ?? null;
}

function multiTagPasses(
  tags: string[],
  excludeSet: Set<string>,
  includeSet: Set<string> | null,
): boolean {
  if (tags.length === 0) return true;
  const lower = tags.map((t) => t.toLowerCase().replace(/ /g, '_'));
  // If ANY tag is in the include set, candidate passes (overrides exclude).
  if (includeSet && lower.some((t) => includeSet.has(t))) return true;
  // Otherwise, exclude only if EVERY tag matches exclude set (vs. legacy:
  // exclude if FIRST tag matches). Hybrid venues with one undesirable tag still pass.
  const matches = lower.filter((t) => excludeSet.has(t)).length;
  if (matches === 0) return true;
  // Mixed venues: exclude only if >=50% of tags are undesirable.
  return matches < lower.length / 2;
}

function transportScore(distanceMiles: number, mode: 'walk' | 'transit' | 'car'): number {
  const threshold = DEFAULT_THRESHOLDS[mode];
  // Linear ramp: 1.0 at 0 miles, 0 at threshold, allow up to 1.5x as a soft cliff.
  const hardCutoff = threshold * 1.5;
  if (distanceMiles >= hardCutoff) return 0;
  return Math.max(0, 1 - distanceMiles / threshold);
}

function nMostRestrictiveMode(modes: Array<'walk' | 'transit' | 'car' | undefined>): 'walk' | 'transit' | 'car' {
  if (modes.includes('walk')) return 'walk';
  if (modes.includes('transit')) return 'transit';
  return 'car';
}

interface PreprocessParams {
  city: string;
  excludeTypes: string[];
  /** Optional include list — anything in here passes regardless of excludeTypes. */
  includeTypes?: string[];
  /** Per-participant transportation modes; we use the most restrictive. */
  transportModes?: Array<'walk' | 'transit' | 'car' | undefined>;
}

export async function preprocess(
  candidates: SuggestionOption[],
  params: PreprocessParams,
  env?: SuggestionEnvelope,
): Promise<EnrichedCandidate[]> {
  const t0 = Date.now();
  const excludeSet = new Set(params.excludeTypes.map((t) => t.toLowerCase()));
  const includeSet = params.includeTypes ? new Set(params.includeTypes.map((t) => t.toLowerCase())) : null;
  const mode = nMostRestrictiveMode(params.transportModes || []);

  // Step 1: tag-based filter (multi-tag, not just tags[0]).
  const filtered = candidates.filter((c) => multiTagPasses(c.tags || [], excludeSet, includeSet));

  // Step 2: dedupe by (normalized name, h3_res9).
  const dedupeMap = new Map<string, SuggestionOption>();
  for (const c of filtered) {
    const lat = c.lat ?? null;
    const lng = c.lng ?? null;
    const cell = lat != null && lng != null ? h3Cell(lat, lng, H3_RES_BLOCK) : 'no-coord';
    const key = `${normalizeName(c.title)}|${cell}`;
    if (!dedupeMap.has(key)) dedupeMap.set(key, c);
  }
  const deduped = Array.from(dedupeMap.values());

  // Step 3: enrich (parallelize neighborhood resolution; each call is O(50ms) Mapbox).
  const enriched: EnrichedCandidate[] = await Promise.all(
    deduped.map(async (c, i) => {
      const lat = c.lat ?? null;
      const lng = c.lng ?? null;
      const cellRes9 = lat != null && lng != null ? h3Cell(lat, lng, H3_RES_BLOCK) : null;
      const cellRes7 = cellRes9 ? h3Coarsen(cellRes9, H3_RES_NEIGHBORHOOD) : null;

      let ntaId: string | null = null;
      let mapboxNeighId: string | null = null;
      if (lat != null && lng != null) {
        const r = await resolveByCoords(params.city, lat, lng);
        ntaId = r.ntaId;
        mapboxNeighId = r.mapboxNeighId;
      }

      const distanceMiles = c.distance ? parseDistance(c.distance) : null;
      const reviewCount = c.ratingCount || 0;
      const popularityProxy = Math.log(reviewCount + 1);
      const transport = distanceMiles != null ? transportScore(distanceMiles, mode) : 0.5;
      const trending = c.tags?.some((t) => t.toLowerCase().includes('trending')) ?? false;

      return {
        id: c.placeId || `cand_${i}_${normalizeName(c.title).slice(0, 20)}`,
        neutralizedId: `CANDIDATE_${String(i + 1).padStart(2, '0')}`,
        raw: c,
        category: c.tags?.[0] || null,
        priceTier: tierFromBudget(c.priceLevel),
        popularityProxy,
        distanceMiles,
        transportScore: transport,
        description: truncateDescription(c.description),
        ntaId,
        mapboxNeighId,
        h3Res9: cellRes9,
        h3Res7: cellRes7,
        trending,
      };
    }),
  );

  if (env) {
    env.candidates = enriched;
    env.task = 'preprocess';
    env.expectedOutputSchema = 'judged';
    env.provenance.push({
      task: 'preprocess',
      latencyMs: Date.now() - t0,
      note: `${candidates.length} → ${enriched.length} after filter/dedupe`,
    });
  }
  return enriched;
}

function parseDistance(s: string): number | null {
  // The legacy `distance` field is "1.2 mi" style. Be liberal in parsing.
  const m = s.match(/([\d.]+)\s*mi/i);
  return m ? parseFloat(m[1]) : null;
}
