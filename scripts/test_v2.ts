// One-shot driver for trying the v2 (or v1) suggestion pipeline against a
// hardcoded request. No DB rows, no auth, no UI — just the pipeline.
//
// Usage:
//   SUGGESTIONS_PIPELINE=v2 npx tsx --env-file=.env scripts/test_v2.ts
//   SUGGESTIONS_PIPELINE=v1 npx tsx --env-file=.env scripts/test_v2.ts
//
// Optional: set FIXTURE=<name> to flip between the variants below.
//   FIXTURE=cocktails       → default, NYC East Village Vibey cocktails
//   FIXTURE=clubbing        → late-night Going-Out clubbing in Chicago
//   FIXTURE=hidden_gems     → exercises the hidden_gem judge
//   FIXTURE=meet_in_middle  → exercises spatial midpoint logic

import type { SuggestRequest, SuggestionOption } from '../server/suggestions';

// 12 real East Village / LES cocktail bars, deliberately mixed across the
// popularity spectrum so we can see whether v2's hidden_gem judge actually
// counterbalances review-count bias.
//
//   Tier A — mainstream-popular (high review counts, "everyone knows them"):
//     Death & Co, Mr. Purple, PDT, Loreley
//   Tier B — known-but-not-tourist (mid review counts, neighborhood favorites):
//     Attaboy, Existing Conditions, The Wayland, Bourgeois Pig
//   Tier C — actual hidden gems (lower review counts, locals' choice):
//     Amor y Amargo, Bar Goto, Mace, Boilermaker
//
// If the rebuild's hidden_gem judge works, you should see Tier C candidates
// score competitively despite having ~10x fewer reviews than Tier A. If it
// doesn't, the final 5 will be Tier A heavy — same popularity bias as v1.

const MOCKED_EAST_VILLAGE_BARS: SuggestionOption[] = [
  // Tier A — mainstream-popular
  { optionType: 'place', title: 'Death & Co', placeId: 'mock_death_co', address: '433 E 6th St, New York, NY 10009', city: 'NYC', lat: 40.7242, lng: -73.9836, rating: '4.6', ratingCount: 3500, priceLevel: '$$$', distance: '0.3 mi', tags: ['cocktail_bar', 'speakeasy'], description: "Iconic East Village cocktail temple. World-class drinks, dim lighting, intricate menus. Has been on every 'best bars in NYC' list for over a decade.", source: 'mock' },
  { optionType: 'place', title: 'Mr. Purple', placeId: 'mock_mr_purple', address: '180 Orchard St, New York, NY 10002', city: 'NYC', lat: 40.7204, lng: -73.9874, rating: '4.0', ratingCount: 2800, priceLevel: '$$', distance: '0.6 mi', tags: ['rooftop_bar', 'lounge'], description: 'Rooftop bar atop the Hotel Indigo, sweeping skyline views, popular with tourists and bachelorette parties. Music gets loud after 10pm.', source: 'mock' },
  { optionType: 'place', title: 'Please Don\'t Tell (PDT)', placeId: 'mock_pdt', address: '113 St Marks Pl, New York, NY 10009', city: 'NYC', lat: 40.7283, lng: -73.9845, rating: '4.4', ratingCount: 1100, priceLevel: '$$$', distance: '0.4 mi', tags: ['speakeasy', 'cocktail_bar'], description: 'Hidden behind a phone booth in a hot dog shop. The OG NYC speakeasy — reservations required, very famous, the secret is no longer secret.', source: 'mock' },
  { optionType: 'place', title: 'Loreley Beer Garden', placeId: 'mock_loreley', address: '7 Rivington St, New York, NY 10002', city: 'NYC', lat: 40.7211, lng: -73.9920, rating: '4.0', ratingCount: 2000, priceLevel: '$$', distance: '0.7 mi', tags: ['beer_garden', 'german_restaurant'], description: 'Large German beer garden, pretzels and bratwurst, big group-friendly. Mainstream pick for after-work drinks; cocktails are not the focus.', source: 'mock' },

  // Tier B — known but not tourist
  { optionType: 'place', title: 'Attaboy', placeId: 'mock_attaboy', address: '134 Eldridge St, New York, NY 10002', city: 'NYC', lat: 40.7195, lng: -73.9920, rating: '4.6', ratingCount: 1200, priceLevel: '$$$', distance: '0.6 mi', tags: ['speakeasy', 'cocktail_bar'], description: 'No-menu bartender-driven cocktails, you describe what you want and they make it. Long wait, worth it. Beloved by the cocktail community.', source: 'mock' },
  { optionType: 'place', title: 'Existing Conditions', placeId: 'mock_existing_conditions', address: '35 W 8th St, New York, NY 10011', city: 'NYC', lat: 40.7325, lng: -73.9990, rating: '4.5', ratingCount: 600, priceLevel: '$$$', distance: '0.9 mi', tags: ['cocktail_bar'], description: 'Chef-driven cocktail program from Dave Arnold (Booker & Dax alum). Technical drinks, reasonable wait, taken seriously by craft enthusiasts.', source: 'mock' },
  { optionType: 'place', title: 'The Wayland', placeId: 'mock_wayland', address: '700 E 9th St, New York, NY 10009', city: 'NYC', lat: 40.7261, lng: -73.9783, rating: '4.4', ratingCount: 600, priceLevel: '$$', distance: '0.5 mi', tags: ['cocktail_bar'], description: "Far East Village neighborhood spot, live music some nights, no-fuss American whiskey-forward cocktails. Locals' favorite without being secretive.", source: 'mock' },
  { optionType: 'place', title: 'Bourgeois Pig', placeId: 'mock_bourgeois_pig', address: '111 E 7th St, New York, NY 10009', city: 'NYC', lat: 40.7256, lng: -73.9858, rating: '4.0', ratingCount: 1500, priceLevel: '$$', distance: '0.4 mi', tags: ['wine_bar', 'cocktail_bar'], description: 'Wine + cocktails in a velvet-heavy lounge with fondue. Date-night vibe, accessible price point, well-known in the neighborhood.', source: 'mock' },

  // Tier C — hidden gems
  { optionType: 'place', title: 'Amor y Amargo', placeId: 'mock_amor_y_amargo', address: '443 E 6th St, New York, NY 10009', city: 'NYC', lat: 40.7244, lng: -73.9831, rating: '4.6', ratingCount: 400, priceLevel: '$$', distance: '0.3 mi', tags: ['cocktail_bar', 'bitters_bar'], description: "Tiny East Village bitters-focused bar. ~12 seats, all amaro and vermouth-based cocktails, locals-only feel. No reservations, walk-in if you can grab a stool.", source: 'mock' },
  { optionType: 'place', title: 'Bar Goto', placeId: 'mock_bar_goto', address: '245 Eldridge St, New York, NY 10002', city: 'NYC', lat: 40.7218, lng: -73.9911, rating: '4.5', ratingCount: 300, priceLevel: '$$', distance: '0.5 mi', tags: ['cocktail_bar', 'japanese'], description: 'Lower East Side Japanese cocktail bar from Pegu Club alum. Sake-based drinks, exquisite ice work, quiet enough to talk. Underrated.', source: 'mock' },
  { optionType: 'place', title: 'Mace', placeId: 'mock_mace', address: '649 E 9th St, New York, NY 10009', city: 'NYC', lat: 40.7262, lng: -73.9794, rating: '4.5', ratingCount: 250, priceLevel: '$$$', distance: '0.5 mi', tags: ['cocktail_bar'], description: "Spice-and-herb-forward cocktail menu, each drink themed around a single ingredient. Quieter East Village pick, the kind of place a friend texts you about.", source: 'mock' },
  { optionType: 'place', title: 'Boilermaker', placeId: 'mock_boilermaker', address: '13 1st Ave, New York, NY 10003', city: 'NYC', lat: 40.7258, lng: -73.9876, rating: '4.3', ratingCount: 500, priceLevel: '$$', distance: '0.4 mi', tags: ['cocktail_bar', 'dive_bar'], description: 'Beer-and-shot pairings, casual atmosphere, no pretension. Honest cocktails at honest prices. Neighborhood crowd, never on a "best of" list.', source: 'mock' },
];

// Fixtures ----------------------------------------------------------------

const FIXTURES: Record<string, SuggestRequest> = {
  cocktails: {
    city: 'NYC',
    categories: ['Cocktails', 'Drinks'],
    budget: '$$',
    energy: 'Vibey',
    timeWindow: 'evening',
    specificTime: '20:00',
    neighborhood: 'East Village',
    locationMode: 'near_me',
    discoveryStyle: 'mixed',
    crowdPreference: 'no_preference',
    favoriteNeighborhoods: ['East Village', 'Lower East Side'],
    transportationModes: ['transit'],
  },
  clubbing: {
    city: 'Chicago',
    categories: ['Club', 'Dancing'],
    budget: '$$$',
    energy: 'Going out',
    timeWindow: 'night',
    specificTime: '23:00',
    neighborhood: 'River North',
    locationMode: 'near_me',
    discoveryStyle: 'popular',
    crowdPreference: 'buzzing',
    favoriteNeighborhoods: ['River North', 'West Loop'],
    transportationModes: ['car'],
    vibeDescription: 'High-energy late-night dancing, real club not a restaurant-bar',
  },
  hidden_gems: {
    city: 'NYC',
    categories: ['Cocktails'],
    budget: '$$',
    energy: 'Vibey',
    neighborhood: 'Bushwick',
    locationMode: 'near_me',
    discoveryStyle: 'hidden_gems',
    crowdPreference: 'quiet',
    favoriteNeighborhoods: ['Bushwick', 'Greenpoint'],
    transportationModes: ['transit'],
    vibeDescription: 'Hidden cocktail bar, locals only, not a tourist spot',
  },
  meet_in_middle: {
    city: 'NYC',
    categories: ['Drinks', 'Cocktails'],
    budget: '$$',
    energy: 'Vibey',
    locationMode: 'meet_in_the_middle',
    midpointLat: 40.7281, // ~midpoint between Williamsburg + East Village
    midpointLng: -73.9693,
    discoveryStyle: 'mixed',
    transportationModes: ['transit', 'walk'],
  },
};

// Pretty-printer ----------------------------------------------------------

function pad(n: number, width = 2): string {
  return String(n).padStart(width, ' ');
}

function summarize(label: string, result: { options: any[]; meta?: any; brief?: any }) {
  const { options, meta, brief } = result;
  console.log(`\n=== ${label} ===`);
  if (brief) {
    console.log(`Intent:   ${brief.naturalLanguageIntent || '(none)'}`);
    console.log(`Types:    [${(brief.googlePlacesTypes || []).join(', ')}]`);
    console.log(`Exclude:  [${(brief.excludeTypes || []).join(', ')}]`);
    console.log(`Open at:  ${brief.mustBeOpenAt ?? 'any'}`);
    if ('grounded' in brief) console.log(`Grounded: ${brief.grounded ? 'yes' : 'no'}`);
    if ('discoveredVenues' in brief)
      console.log(`Discovered (web): ${brief.discoveredVenues?.length || 0} venues`);
  }
  if (meta) {
    console.log(`Pool:     places=${meta.placesCount ?? '?'}, postFilter=${meta.filteredCount ?? '?'}`);
  }
  console.log(`\nFinal ${options.length} venues:`);
  options.forEach((o, i) => {
    const sc = typeof o.score === 'number' ? o.score.toFixed(0) : '?';
    const cat = (o.tags && o.tags[0]) || 'unknown';
    console.log(`  ${pad(i + 1)}. ${(o.title || '?').padEnd(40)}  [${cat.padEnd(15)}]  $${o.priceLevel ?? '?'}  ★${o.rating ?? '?'} (${o.ratingCount ?? 0})  score=${sc}`);
    if (o.whyExplanation) console.log(`        why: ${o.whyExplanation}`);
  });
}

// Main --------------------------------------------------------------------

async function main() {
  const fixtureName = process.env.FIXTURE || 'cocktails';
  const fixture = FIXTURES[fixtureName];
  if (!fixture) {
    console.error(`Unknown FIXTURE='${fixtureName}'. Pick one of: ${Object.keys(FIXTURES).join(', ')}`);
    process.exit(2);
  }
  const pipeline = (process.env.SUGGESTIONS_PIPELINE || 'v1') as 'v1' | 'v2';
  console.log(`[test_v2] pipeline=${pipeline}  fixture=${fixtureName}`);
  console.log('[test_v2] Request:');
  console.log(JSON.stringify(fixture, null, 2));

  // Quick env sanity check so we fail fast and clearly when keys are missing.
  const missing: string[] = [];
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) missing.push('AI_INTEGRATIONS_OPENAI_API_KEY (Gemini)');
  if (!process.env.GOOGLE_PLACES_API_KEY) missing.push('GOOGLE_PLACES_API_KEY');
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    console.warn('[test_v2] AI_INTEGRATIONS_OPENAI_BASE_URL not set — Gemini OpenAI-compat calls will fail.');
  }
  if (missing.length > 0) {
    console.error(`\n[test_v2] Missing required env vars: ${missing.join(', ')}`);
    console.error('[test_v2] See plan Step 0 in /Users/goldbnks/.claude/plans/1-clone-and-quirky-island.md');
    process.exit(1);
  }

  const t0 = Date.now();
  if (pipeline === 'v2-brain') {
    const { runV2BrainOnly } = await import('../server/orchestrator/v2');
    console.log(`\n[test_v2] Brain-only mode: skipping Places, using ${MOCKED_EAST_VILLAGE_BARS.length} mock candidates`);
    const result = await runV2BrainOnly(fixture, MOCKED_EAST_VILLAGE_BARS);
    summarize('V2 BRAIN-ONLY RESULT', result);
    // Show per-candidate judge breakdown for transparency
    const debug = (result.options as any).__debug;
    if (debug) {
      console.log('\n--- Per-judge scores (all 12 candidates) ---');
      for (const cand of debug.enriched) {
        const s = debug.judgeScores.find((x: any) => x.candidateId === cand.id);
        if (!s) continue;
        const fmt = (j: any) => (j.score == null ? '∅' : j.score) + (j.confidence != null ? `(${j.confidence.toFixed(1)})` : '');
        console.log(`  ${cand.title.padEnd(28)} pop=${cand.popularityProxy.toFixed(1).padStart(4)}  vibe=${fmt(s.vibe).padStart(6)}  neigh=${fmt(s.neighborhood).padStart(6)}  budget=${fmt(s.budget).padStart(6)}  gem=${fmt(s.hiddenGem).padStart(6)}  agg=${s.aggregate?.toFixed(2) ?? '∅'}`);
      }
    }
  } else if (pipeline === 'v2') {
    const { getOrchestratedSuggestionsV2 } = await import('../server/orchestrator/v2');
    const result = await getOrchestratedSuggestionsV2(fixture);
    summarize('V2 RESULT', result);
  } else {
    // v1 path. We import directly to bypass the SUGGESTIONS_PIPELINE flag check.
    const prev = process.env.SUGGESTIONS_PIPELINE;
    process.env.SUGGESTIONS_PIPELINE = 'v1';
    try {
      const { getOrchestratedSuggestions } = await import('../server/suggestions');
      const result = await getOrchestratedSuggestions(fixture);
      summarize('V1 RESULT', result);
    } finally {
      process.env.SUGGESTIONS_PIPELINE = prev;
    }
  }
  console.log(`\n[test_v2] Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n[test_v2] FAILED:', err?.message || err);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  });
