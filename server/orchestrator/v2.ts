// V2 suggestion pipeline — orchestrates Phases 1.1–1.6 behind a single function.
//
// Replaces (when SUGGESTIONS_PIPELINE=v2) the legacy `getOrchestratedSuggestions`.
// The shape of the return value is the same so route handlers don't need to change.
//
// Stages:
//   1. Phase 1+2 collapse — Gemini grounding (groundedSynthesizeContext) →
//      brief + discoveredVenues. Falls back to legacy synthesizeContext if grounding fails.
//   2. Candidate sourcing — Google Places Nearby + Text Search + (re-fetch
//      discoveredVenues by name). Perplexity is left dormant per anti-pattern.
//   3. Preprocess — name strip, dedupe by (name, h3), multi-tag filter, soft transport.
//   4. PoLL judges (parallel panel of 4) → aggregate.
//   5. Pairwise PRP re-rank of top 10.
//   6. Diversity post-pass (MMR + KL calibration + hard quotas).

import { devLog } from '../logger';
import {
  fetchGooglePlaces,
  fetchGooglePlacesTextSearch,
  fetchGooglePlacesByName,
  getMaxDistanceMiles,
  type SuggestRequest,
  type SuggestionOption,
  type GroupPreferenceSummary,
  type DownvoteReasonAggregates,
  type SuggestResult,
} from '../suggestions';
import type { ReferenceVenue } from '@shared/schema';
import { synthesizeContext, type OrchestratorBrief } from '../orchestrator';
import { groundedSynthesizeContext } from './grounded_synthesis';
import { newEnvelope, recordStage, type SuggestionEnvelope } from './envelope';
import { preprocess } from './preprocess';
import { runPanel } from './judges/aggregate';
import { pairwiseRerank } from './pairwise';
import { diversify } from './diversity';
import { applyHardUnreachablePenalty, applyStructuredAdjustment, niiMatchScore, softBudgetScore } from './score';
import { resolveFavoritesToNtaIds } from '../geo/lookup';
import { getCityCenter, getSearchCenter, getNeighborhoodCenter } from '../geo';
import type { PipelineFn } from '../eval/replay';
import type { RankedItem } from '../eval/types';
import { toEnergyLevel } from '@shared/energy';
import { travelScore, type Member, type RouteMatrixProvider } from '../travel';

const RADIUS_BIAS_MULT: Record<'tight' | 'normal' | 'wide', number> = {
  tight: 0.7,
  normal: 1.0,
  wide: 1.5,
};

const BASE_RADIUS_METERS = 3000;

interface V2Options {
  /** Override the user's category history for the diversity calibration step. */
  userCategoryHistogram?: Record<string, number>;
  /** Test/internal override for deterministic travel scoring. */
  routeProvider?: RouteMatrixProvider;
  departBucket?: string;
  now?: number;
}

export async function getOrchestratedSuggestionsV2(
  req: SuggestRequest,
  downvoteReasons?: DownvoteReasonAggregates,
  referenceVenues?: ReferenceVenue[], // accepted for v1 signature parity; not yet wired into v2
  groupPrefs?: GroupPreferenceSummary,
  feedbackHistory?: Array<{ venueName: string; rating: number; tags?: string[] | null; review?: string | null }>,
  opts: V2Options = {},
): Promise<SuggestResult> {
  void referenceVenues; // TODO: re-integrate reference-venue style anchoring as a soft feature into the judge prompts
  const env = newEnvelope(req, { userId: groupPrefs ? `group_${groupPrefs.memberCount}` : undefined });
  const t0 = Date.now();

  // ---- Stage 1: brief + discoveredVenues (grounded if possible, legacy if not) ----
  const tBrief = Date.now();
  let brief: OrchestratorBrief & { discoveredVenues?: Array<{ name: string }>; grounded?: boolean };
  const grounded = await groundedSynthesizeContext(req, groupPrefs, downvoteReasons, feedbackHistory);
  if (grounded) {
    brief = grounded;
    devLog('info', '[v2] Grounded synthesis succeeded', {
      grounded: grounded.grounded,
      discovered: grounded.discoveredVenues.length,
    });
  } else {
    const legacy = await synthesizeContext(req, groupPrefs, downvoteReasons, feedbackHistory);
    brief = { ...legacy, discoveredVenues: [], grounded: false };
    devLog('info', '[v2] Fell back to legacy synthesizeContext (no grounding)');
  }
  recordStage(env, { task: 'sourcing', latencyMs: Date.now() - tBrief, note: 'brief synthesized' });
  env.constraints = {
    excludeTypes: brief.excludeTypes,
    mustBeOpenAt: brief.mustBeOpenAt,
    maxBudgetLevel: brief.maxBudgetLevel,
    maxDistanceMiles: getMaxDistanceMiles(req.transportationModes),
  };

  // ---- Stage 2: candidate sourcing (Places + grounded venue re-fetch) ----
  const tSrc = Date.now();
  const center = pickSearchCenter(req);
  const radiusMeters = BASE_RADIUS_METERS * RADIUS_BIAS_MULT[brief.radiusBias || 'normal'];

  const [placesResults, textSearchResults, groundedFetched] = await Promise.all([
    fetchGooglePlaces(center, radiusMeters, brief.googlePlacesTypes.slice(0, 5), req.city).catch(
      () => [] as SuggestionOption[],
    ),
    brief.googlePlacesTextQueries.length > 0
      ? fetchGooglePlacesTextSearch(center, radiusMeters, brief.googlePlacesTextQueries, req.city).catch(
          () => [] as SuggestionOption[],
        )
      : Promise.resolve([] as SuggestionOption[]),
    brief.discoveredVenues && brief.discoveredVenues.length > 0
      ? fetchGooglePlacesByName(
          center,
          radiusMeters,
          brief.discoveredVenues.map((v) => v.name),
          req.city,
        ).catch(() => [] as SuggestionOption[])
      : Promise.resolve([] as SuggestionOption[]),
  ]);

  // Tag grounded-fetched ones with `trending` so the hidden-gem judge weights them.
  for (const c of groundedFetched) {
    if (!c.tags?.some((t) => t.includes('trending'))) {
      c.tags = [...(c.tags || []), 'trending'];
    }
  }

  const allCandidates: SuggestionOption[] = [...placesResults, ...textSearchResults, ...groundedFetched];
  recordStage(env, {
    task: 'sourcing',
    latencyMs: Date.now() - tSrc,
    note: `places=${placesResults.length} text=${textSearchResults.length} grounded=${groundedFetched.length}`,
  });

  if (allCandidates.length === 0) {
    devLog('warn', '[v2] Zero candidates after sourcing; returning empty result.');
    return emptyResult(req, env);
  }

  // ---- Stage 3: preprocess (strip names, dedupe, soft-transport, resolve neighborhoods) ----
  const enriched = await preprocess(
    allCandidates,
    {
      city: req.city,
      excludeTypes: brief.excludeTypes,
      includeTypes: brief.googlePlacesTypes, // explicit include list overrides exclude on overlap
      transportModes: (req.transportationModes || []) as Array<'walk' | 'transit' | 'car' | undefined>,
    },
    env,
  );

  if (enriched.length === 0) {
    devLog('warn', '[v2] All candidates filtered out by preprocess.');
    return emptyResult(req, env);
  }

  // ---- Stage 4: PoLL judges ----
  const favoriteNtaIds = resolveFavoritesToNtaIds(req.city, req.favoriteNeighborhoods || []);
  const scores = await runPanel(enriched, { request: req, favoriteNtaIds }, env);

  // Re-attribute candidate ids to the original `EnrichedCandidate.id`. The
  // judges return scores keyed by raw candidate id (we set candidateId to c.id
  // in the aggregator). Build the lookup map.
  const aggMap = new Map<string, number | null>();
  for (const s of scores) aggMap.set(s.candidateId, s.aggregate);
  await applyV2StructuredAdjustments(enriched, aggMap, req, opts);

  // ---- Stage 5: pairwise PRP re-rank of top 10 ----
  const orderedIds = await pairwiseRerank(enriched, aggMap, req, env, 10);

  // ---- Stage 6: diversity post-pass ----
  // Reorder enriched candidates per the pairwise output, then run MMR+KL+quotas.
  const idToCand = new Map(enriched.map((c) => [c.id, c]));
  const ranked = orderedIds.map((id) => idToCand.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  const { final, klToHistory } = diversify(
    ranked,
    aggMap,
    {
      k: 10,
      lambda: 0.7,
      userCategoryHistogram: opts.userCategoryHistogram,
    },
    undefined, // embeddings — wire in once pgvector lands
    env,
  );

  // ---- Compose response ----
  const options: SuggestionOption[] = final.map((c, idx) => {
    const aggregate = aggMap.get(c.id);
    const out: SuggestionOption = {
      ...c.raw,
      score: aggregate != null ? aggregate * 20 : c.raw.score, // 0..5 → 0..100 for readability
      generationType:
        aggregate != null && aggregate >= 4
          ? 'safe'
          : aggregate != null && aggregate >= 2.5
            ? 'explore'
            : 'wildcard',
    };
    return out;
  });

  recordStage(env, { task: 'final', latencyMs: Date.now() - t0, note: `final ${options.length} options; KL=${Number.isNaN(klToHistory) ? 'cold' : klToHistory.toFixed(3)}` });

  return {
    options,
    meta: {
      city: req.city,
      centerLatLng: center,
      radiusMeters,
      placesCount: allCandidates.length,
      filteredCount: enriched.length,
      categories: req.categories,
    },
    brief,
  };
}

/**
 * Test-only entry point: runs Phase 3+ (preprocess → judges → pairwise → diversity)
 * on a hand-built candidate pool, skipping Phase 2 (Places sourcing). The brief is
 * synthesized normally via Gemini so we still exercise that, but we never call
 * Google Places — useful when Places auth is broken or you want determinism.
 */
export async function runV2BrainOnly(
  req: SuggestRequest,
  injectedCandidates: SuggestionOption[],
  opts: V2Options = {},
): Promise<SuggestResult> {
  const env = newEnvelope(req, {});
  const t0 = Date.now();

  // Stage 1: brief (real Gemini call — exercises the synthesis path)
  let brief: any;
  const grounded = await groundedSynthesizeContext(req);
  if (grounded) {
    brief = grounded;
  } else {
    const legacy = await synthesizeContext(req);
    brief = { ...legacy, discoveredVenues: [], grounded: false };
  }
  recordStage(env, { task: 'sourcing', latencyMs: Date.now() - t0, note: 'brief synthesized (brain-only mode)' });
  env.constraints = {
    excludeTypes: brief.excludeTypes,
    mustBeOpenAt: brief.mustBeOpenAt,
    maxBudgetLevel: brief.maxBudgetLevel,
    maxDistanceMiles: getMaxDistanceMiles(req.transportationModes),
  };

  devLog('info', `[v2-brain] Skipping Places; using ${injectedCandidates.length} injected candidates`);

  // Stages 3-6: same as full pipeline
  const enriched = await preprocess(
    injectedCandidates,
    {
      city: req.city,
      excludeTypes: brief.excludeTypes,
      includeTypes: brief.googlePlacesTypes,
      transportModes: (req.transportationModes || []) as Array<'walk' | 'transit' | 'car' | undefined>,
    },
    env,
  );

  if (enriched.length === 0) {
    devLog('warn', '[v2-brain] All candidates filtered by preprocess — too aggressive?');
  }

  const favoriteNtaIds = resolveFavoritesToNtaIds(req.city, req.favoriteNeighborhoods || []);
  const scores = await runPanel(enriched, { request: req, favoriteNtaIds }, env);
  const aggMap = new Map<string, number | null>();
  for (const s of scores) aggMap.set(s.candidateId, s.aggregate);
  await applyV2StructuredAdjustments(enriched, aggMap, req, opts);

  const orderedIds = await pairwiseRerank(enriched, aggMap, req, env, 10);
  const idToCand = new Map(enriched.map((c) => [c.id, c]));
  const ranked = orderedIds.map((id) => idToCand.get(id)).filter((c): c is NonNullable<typeof c> => !!c);
  const { final, klToHistory } = diversify(
    ranked,
    aggMap,
    { k: 10, lambda: 0.7, userCategoryHistogram: opts.userCategoryHistogram },
    undefined,
    env,
  );

  const options: SuggestionOption[] = final.map((c) => ({
    ...c.raw,
    score: aggMap.get(c.id) != null ? (aggMap.get(c.id) as number) * 20 : c.raw.score,
    generationType:
      (aggMap.get(c.id) ?? 0) >= 4 ? 'safe' : (aggMap.get(c.id) ?? 0) >= 2.5 ? 'explore' : 'wildcard',
  }));

  recordStage(env, {
    task: 'final',
    latencyMs: Date.now() - t0,
    note: `brain-only final ${options.length} options; KL=${Number.isNaN(klToHistory) ? 'cold' : klToHistory.toFixed(3)}`,
  });

  // Expose per-candidate judge scores so the test driver can show why each ranked.
  (options as any).__debug = {
    judgeScores: scores,
    enriched: enriched.map((c) => ({ id: c.id, neutralizedId: c.neutralizedId, title: c.raw.title, popularityProxy: c.popularityProxy })),
    pairwiseOrder: orderedIds,
    finalOrder: final.map((c) => c.id),
    klToHistory,
  };

  return {
    options,
    meta: {
      city: req.city,
      centerLatLng: pickSearchCenter(req),
      radiusMeters: BASE_RADIUS_METERS,
      placesCount: injectedCandidates.length,
      filteredCount: enriched.length,
      categories: req.categories,
    },
    brief,
  };
}

function pickSearchCenter(req: SuggestRequest) {
  if (req.locationMode === 'meet_in_the_middle' && req.midpointLat != null && req.midpointLng != null) {
    return { lat: req.midpointLat, lng: req.midpointLng };
  }
  if (req.locationMode === 'explore_anywhere') {
    return getCityCenter(req.city);
  }
  if (req.userLat != null && req.userLng != null) {
    return { lat: req.userLat, lng: req.userLng };
  }
  if (req.neighborhood) {
    const nb = getNeighborhoodCenter(req.city, req.neighborhood);
    if (nb) return nb;
  }
  return getSearchCenter(req.city, req.neighborhood, req.userLat, req.userLng);
}

function emptyResult(req: SuggestRequest, env: SuggestionEnvelope): SuggestResult {
  return {
    options: [],
    meta: {
      city: req.city,
      centerLatLng: getCityCenter(req.city),
      radiusMeters: BASE_RADIUS_METERS,
      placesCount: 0,
      filteredCount: 0,
      categories: req.categories,
    },
  };
}

// Eval harness adapter — exported so server/eval/replay.ts can plug in v2.
export const v2Pipeline: PipelineFn = async (intent) => {
  const result = await getOrchestratedSuggestionsV2({
    city: intent.city,
    categories: intent.categories,
    budget: intent.budget,
    energy: intent.energy,
    timeWindow: intent.timeWindow,
    specificDate: intent.specificDate,
    specificTime: intent.specificTime,
    neighborhood: intent.neighborhood,
    vibeDescription: intent.vibeDescription,
    locationMode: intent.locationMode as any,
    discoveryStyle: intent.discoveryStyle as any,
    crowdPreference: intent.crowdPreference as any,
    favoriteNeighborhoods: intent.favoriteNeighborhoods,
  });
  return result.options.map(
    (o, i): RankedItem => ({
      suggestionId: o.placeId || o.title.toLowerCase(),
      rank: i + 1,
      category: o.tags?.[0],
      priceTier: priceTierFromBudget(o.priceLevel),
      reviewCount: o.ratingCount,
    }),
  );
};

function priceTierFromBudget(b?: string): number | undefined {
  if (!b) return undefined;
  return ({ '$': 1, '$$': 2, '$$$': 3, '$$$$': 4 } as Record<string, number>)[b];
}

export async function applyV2StructuredAdjustments(
  candidates: Array<{ id: string; venueNii?: number; priceTier: number | null; raw: { lat?: number; lng?: number } }>,
  aggMap: Map<string, number | null>,
  req: SuggestRequest,
  opts: Pick<V2Options, 'routeProvider' | 'departBucket' | 'now'> = {},
): Promise<void> {
  const targetEnergy = toEnergyLevel(req.energy);
  const comfortTier = priceTierFromBudget(req.budget) || 2;
  const members: Member[] = (req.participantTravel || []).map(member => ({
    origin: member.origin,
    mode: member.mode,
    toleranceMin: member.toleranceMin,
  }));

  for (const candidate of candidates) {
    const aggregate = aggMap.get(candidate.id) ?? null;
    const quality = aggregate == null ? 0.5 : aggregate / 5;
    const niiMatch = candidate.venueNii == null ? 1 : niiMatchScore(candidate.venueNii, targetEnergy);
    const softBudget = candidate.priceTier == null
      ? 1
      : softBudgetScore(candidate.priceTier, comfortTier, quality);
    let travel: number | undefined;

    if (members.length > 0 && candidate.raw.lat != null && candidate.raw.lng != null) {
      const result = await travelScore(
        members,
        { lat: candidate.raw.lat, lng: candidate.raw.lng },
        {
          city: req.city,
          provider: opts.routeProvider,
          departBucket: opts.departBucket,
          now: opts.now,
        },
      );
      if (result.hardUnreachable) {
        aggMap.set(candidate.id, applyHardUnreachablePenalty(aggregate));
        continue;
      }
      travel = result.score;
    }

    aggMap.set(candidate.id, applyStructuredAdjustment(aggregate, { niiMatch, softBudget, travel }));
  }
}
