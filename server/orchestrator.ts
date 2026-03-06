import OpenAI from "openai";
import { SuggestionOption, SuggestRequest, DownvoteReasonAggregates, GroupPreferenceSummary } from "./suggestions";
import { devLog } from "./logger";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _openai;
}

export interface OrchestratorBrief {
  naturalLanguageIntent: string;
  perplexityQuery: string;
  googlePlacesTypes: string[];
  googlePlacesTextQueries: string[];
  excludeTypes: string[];
  vibeKeywords: string[];
  mustBeOpenAt: string | null;
  maxBudgetLevel: number;
  preferredNeighborhoods: string[];
  radiusBias: "tight" | "normal" | "wide";
}

export interface ValidatedSuggestion {
  title: string;
  address: string;
  whyExplanation: string;
  vibeScore: number;
  rank: number;
  excluded: boolean;
  excludeReason?: string;
}

export interface OrchestratorResult {
  brief: OrchestratorBrief;
  rankedSuggestions: SuggestionOption[];
}

export async function synthesizeContext(
  req: SuggestRequest,
  groupPrefs?: GroupPreferenceSummary,
  downvoteReasons?: DownvoteReasonAggregates,
  feedbackHistory?: Array<{ venueName: string; rating: number; tags?: string[] | null; review?: string | null }>,
): Promise<OrchestratorBrief> {
  const city = req.city === "NYC" ? "New York City" : req.city;
  const categories = req.categories.length > 0 ? req.categories : ["Drinks"];
  const energy = req.energy || "Vibey";
  const budget = req.budget || "$$";
  const timeWindow = req.timeWindow || "";
  const specificTime = req.specificTime || "";
  const specificDate = req.specificDate || "";
  const neighborhood = req.neighborhood || "";
  const vibeDescription = req.vibeDescription || "";
  const locationMode = req.locationMode || "near_me";
  const discoveryStyle = req.discoveryStyle || "mixed";
  const crowdPreference = req.crowdPreference || "no_preference";
  const favoriteNeighborhoods = req.favoriteNeighborhoods || [];

  const downvoteSummary = downvoteReasons
    ? Object.entries(downvoteReasons)
        .filter(([_, count]) => count > 0)
        .map(([reason, count]) => `${reason}: ${count}x`)
        .join(", ")
    : "none";

  const feedbackSummary = feedbackHistory && feedbackHistory.length > 0
    ? feedbackHistory
        .map(f => {
          const tags = f.tags?.join(", ") || "";
          return `${f.venueName}: ${f.rating}★${tags ? ` [${tags}]` : ""}${f.review ? ` "${f.review}"` : ""}`;
        })
        .join("\n")
    : "none";

  const memberCount = groupPrefs?.memberCount || 1;

  const prompt = `You are a social event planning assistant for young professionals. Analyze this group's plan request and produce a structured brief that will drive API queries to Google Places and Perplexity.

PLAN REQUEST:
- City: ${city}
- Categories: ${categories.join(", ")}
- Energy Level: ${energy}
- Budget: ${budget}
- Time: ${specificTime || timeWindow || "flexible"}
- Date: ${specificDate || "flexible"}
- Neighborhood: ${neighborhood || "any"}
- Location Mode: ${locationMode} (${locationMode === 'explore_anywhere' ? 'User wants to explore the ENTIRE city — do NOT bias by proximity or neighborhood, use "wide" radiusBias, suggest best spots city-wide regardless of distance' : locationMode === 'meet_in_the_middle' ? 'Multiple people meeting from different neighborhoods — suggest spots in central/accessible areas' : 'Prefer spots near the user'})
- Discovery Style: ${discoveryStyle} (hidden_gems = lesser-known spots, popular = well-known, mixed = both)
- Crowd Preference: ${crowdPreference}
- Favorite Neighborhoods: ${favoriteNeighborhoods.length > 0 ? favoriteNeighborhoods.join(", ") : "none"}
- Group Size: ${memberCount} people
${vibeDescription ? `- User's Vibe Description: "${vibeDescription}" (THIS IS THE MOST IMPORTANT SIGNAL — prioritize matching this free-text description over generic category/energy filters)` : ""}

PAST DOWNVOTE REASONS: ${downvoteSummary}
PAST VENUE FEEDBACK:
${feedbackSummary}

Respond with a JSON object with these fields:
1. "naturalLanguageIntent": A 2-3 sentence description of what this group ACTUALLY wants. Be specific about the vibe, setting, and experience — not just venue types. Example: "4 friends looking for a high-energy Saturday night in Chicago. They want real nightlife — clubs with DJs, dance floors, or trendy cocktail bars with late-night energy. NOT restaurant-bars or upscale dining."
2. "perplexityQuery": A natural language search query for Perplexity to find trending/current venues matching this intent. Be specific about the city, vibe, time, and what to EXCLUDE. Example: "Best nightclubs and dance bars in Chicago River North and West Loop open past 2AM on Saturdays, not restaurant-bars"
3. "googlePlacesTypes": Array of Google Places API types to search (e.g., "night_club", "bar", "restaurant", "cafe", "bowling_alley", "museum", "park", "performing_arts_theater", "amusement_center")
4. "googlePlacesTextQueries": Array of 1-3 specific text search queries for Google Places Text Search API. These find specific venue categories that type-based search misses. Example: ["speakeasy bars Chicago", "rooftop cocktail lounge Chicago"]
5. "excludeTypes": Array of Google Places primaryType values that should be EXCLUDED from results (e.g., "restaurant", "cafe" for late-night clubbing). Be aggressive about excluding mismatched types.
6. "vibeKeywords": Array of 3-5 keywords that describe the ideal venue vibe, used for validation (e.g., ["dance floor", "DJ", "late-night", "cocktails", "trendy"])
7. "mustBeOpenAt": If the user specified a time, return it in HH:MM format (24h). Otherwise null.
8. "maxBudgetLevel": Budget as number 1-4 where $=1, $$=2, $$$=3, $$$$=4
9. "preferredNeighborhoods": Array of neighborhoods to prioritize (from user favorites or request)
10. "radiusBias": "tight" if user wants walkable/nearby, "wide" if exploring, "normal" otherwise. If downvotes include "tooFar", use "tight".

IMPORTANT RULES:
- For late-night plans (after 9PM) or high-energy vibes ("Going out", "Full send"), AGGRESSIVELY exclude restaurant types. Bars that primarily serve food should be excluded too.
- For daytime/chill plans, restaurants and cafes are totally fine.
- If past feedback shows 1-2★ ratings for venues, note what to avoid. If 4-5★, note what to replicate.
- If downvotes show "tooFar", tighten the radius. If "tooExpensive", lower the budget.
- The perplexityQuery should be a question a local friend would ask, not a robotic search query.

Return ONLY valid JSON, no markdown code fences.`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gemini-2.5-flash-lite",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      devLog("warn", "[Orchestrator] Empty response from context synthesis");
      return buildFallbackBrief(req);
    }

    const cleaned = content.replace(/^```json\s*/, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned) as OrchestratorBrief;

    devLog("info", "[Orchestrator] Context synthesized", {
      intent: parsed.naturalLanguageIntent.slice(0, 100),
      placesTypes: parsed.googlePlacesTypes,
      excludeTypes: parsed.excludeTypes,
      mustBeOpenAt: parsed.mustBeOpenAt,
    });

    return parsed;
  } catch (err) {
    devLog("error", "[Orchestrator] Context synthesis failed", { error: err });
    return buildFallbackBrief(req);
  }
}

function buildFallbackBrief(req: SuggestRequest): OrchestratorBrief {
  const categoryToTypes: Record<string, string[]> = {
    Dinner: ["restaurant"], Brunch: ["restaurant", "cafe"], Coffee: ["cafe"],
    Cocktails: ["bar"], Club: ["night_club"], "Live Music": ["night_club", "bar"],
    Dancing: ["night_club"], Lounge: ["bar"], Drinks: ["bar", "night_club"],
    Comedy: ["performing_arts_theater"], Museum: ["museum"], Walk: ["park"],
    Active: ["bowling_alley", "amusement_center"], Karaoke: ["bar", "night_club"],
  };

  const types = new Set<string>();
  for (const cat of req.categories) {
    (categoryToTypes[cat] || ["bar"]).forEach(t => types.add(t));
  }

  const isLateNight = (() => {
    if (req.specificTime) {
      const hour = parseInt(req.specificTime.split("-")[0]?.split(":")[0] || "19", 10);
      return hour >= 21 || hour <= 4;
    }
    return req.timeWindow?.toLowerCase().includes("night") || false;
  })();

  const isHighEnergy = req.energy === "Going out" || req.energy === "Full send";
  const excludeTypes = (isLateNight || isHighEnergy) ? ["restaurant", "cafe"] : [];

  return {
    naturalLanguageIntent: `Looking for ${req.categories.join(", ")} in ${req.city}`,
    perplexityQuery: `Best ${req.categories.join(" and ")} spots in ${req.city}`,
    googlePlacesTypes: Array.from(types),
    googlePlacesTextQueries: [],
    excludeTypes,
    vibeKeywords: req.categories.map(c => c.toLowerCase()),
    mustBeOpenAt: req.specificTime?.split("-")[0] || null,
    maxBudgetLevel: ({ "$": 1, "$$": 2, "$$$": 3, "$$$$": 4 }[req.budget || "$$"] || 2),
    preferredNeighborhoods: req.favoriteNeighborhoods || [],
    radiusBias: "normal",
  };
}

export async function validateAndRankSuggestions(
  candidates: SuggestionOption[],
  brief: OrchestratorBrief,
  groupPrefs?: GroupPreferenceSummary,
): Promise<SuggestionOption[]> {
  if (candidates.length === 0) return [];

  if (brief.excludeTypes.length > 0) {
    const excludeSet = new Set(brief.excludeTypes.map(t => t.toLowerCase()));
    const preFilterCount = candidates.length;
    candidates = candidates.filter(c => {
      const primaryTag = c.tags[0]?.toLowerCase().replace(/ /g, '_') || '';
      return !excludeSet.has(primaryTag);
    });
    const removed = preFilterCount - candidates.length;
    if (removed > 0) {
      devLog("info", `[Orchestrator] Pre-filter removed ${removed} venues with excluded primary types`);
    }
  }

  const candidateSummaries = candidates.map((c, i) => {
    const parts = [
      `${i + 1}. "${c.title}"`,
      `Type: ${c.tags.join(", ")}`,
      `Rating: ${c.rating || "N/A"} (${c.ratingCount || 0} reviews)`,
      `Price: ${c.priceLevel || "N/A"}`,
      `Distance: ${c.distance || "N/A"}`,
      `Address: ${c.address}`,
      `Source: ${c.source}`,
    ];
    if (c.description) parts.push(`Description: ${c.description.slice(0, 100)}`);
    if (c.openNow !== undefined) parts.push(`Currently open: ${c.openNow ? "yes" : "no"}`);
    if (c.openingHoursText && c.openingHoursText.length > 0) {
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const todayHours = c.openingHoursText.find(h => h.startsWith(today));
      if (todayHours) parts.push(`Today's hours: ${todayHours}`);
    }
    return parts.join(" | ");
  }).join("\n");

  const prompt = `You are a venue curator for a social event planning app. Review these ${candidates.length} venue/event candidates and select the BEST 5 for this group.

GROUP'S INTENT:
${brief.naturalLanguageIntent}

VIBE KEYWORDS: ${brief.vibeKeywords.join(", ")}
MUST BE OPEN AT: ${brief.mustBeOpenAt || "any time"}
MAX BUDGET: ${"$".repeat(brief.maxBudgetLevel)}
EXCLUDE TYPES: ${brief.excludeTypes.length > 0 ? brief.excludeTypes.join(", ") : "none"}
PREFERRED NEIGHBORHOODS: ${brief.preferredNeighborhoods.length > 0 ? brief.preferredNeighborhoods.join(", ") : "any"}
${groupPrefs ? `GROUP SIZE: ${groupPrefs.memberCount} people` : ""}

CANDIDATES:
${candidateSummaries}

For each candidate, decide:
1. Should it be INCLUDED or EXCLUDED? 
   - EXCLUDE if the venue type doesn't match the intent (e.g., a restaurant when they want nightlife)
   - EXCLUDE if it's likely closed at the requested time
   - EXCLUDE if it clearly doesn't match the vibe
2. Rate its vibe match from 1-10 (10 = perfect match for what they want)
3. Write a short, personalized "why" explanation (1 sentence, casual tone, like a friend recommending it)

Respond with a JSON array of objects, one per candidate, ordered by your ranking (best first):
[
  {
    "index": 1,
    "include": true,
    "vibeScore": 9,
    "whyExplanation": "Killer rooftop with DJ sets every Saturday — exactly the vibe you're after"
  }
]

RULES:
- Select exactly 5 venues (or fewer if not enough good candidates)
- Prioritize DIVERSITY: mix of well-known and hidden gems, different neighborhoods if possible
- The "whyExplanation" should feel like a friend's text, not a review. Be specific about WHY this place matches.
- If a candidate is clearly a restaurant but they want nightlife, EXCLUDE it even if it has "bar" in its tags
Return ONLY valid JSON array, no markdown code fences.`;

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gemini-2.5-flash-lite",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 1200,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      devLog("warn", "[Orchestrator] Empty response from validation");
      return fallbackRank(candidates, brief);
    }

    const cleaned = content.replace(/^```json\s*/, "").replace(/```\s*$/, "");
    const rankings = JSON.parse(cleaned) as Array<{
      index: number;
      include: boolean;
      vibeScore: number;
      whyExplanation: string;
    }>;

    const included = rankings
      .filter(r => r.include)
      .sort((a, b) => b.vibeScore - a.vibeScore)
      .slice(0, 5);

    const rankedOptions: SuggestionOption[] = [];
    for (const rank of included) {
      const idx = rank.index - 1;
      if (idx >= 0 && idx < candidates.length) {
        const opt = { ...candidates[idx] };
        opt.whyExplanation = rank.whyExplanation;
        opt.score = rank.vibeScore * 10;
        opt.generationType = rank.vibeScore >= 8 ? "safe" : rank.vibeScore >= 5 ? "explore" : "wildcard";
        rankedOptions.push(opt);
      }
    }

    if (rankedOptions.length === 0) {
      devLog("warn", "[Orchestrator] No suggestions after validation, using fallback");
      return fallbackRank(candidates, brief);
    }

    devLog("info", "[Orchestrator] Validated and ranked", {
      inputCount: candidates.length,
      outputCount: rankedOptions.length,
      topPick: rankedOptions[0]?.title,
      excluded: rankings.filter(r => !r.include).length,
    });

    return rankedOptions;
  } catch (err) {
    devLog("error", "[Orchestrator] Validation failed", { error: err });
    return fallbackRank(candidates, brief);
  }
}

function fallbackRank(candidates: SuggestionOption[], brief: OrchestratorBrief): SuggestionOption[] {
  const excludeSet = new Set(brief.excludeTypes.map(t => t.toLowerCase()));

  const filtered = candidates.filter(c => {
    const tags = c.tags.map(t => t.toLowerCase());
    return !tags.some(t => excludeSet.has(t));
  });

  const sorted = (filtered.length > 0 ? filtered : candidates)
    .sort((a, b) => {
      const ratingA = parseFloat(a.rating || "0");
      const ratingB = parseFloat(b.rating || "0");
      return ratingB - ratingA;
    })
    .slice(0, 5);

  return sorted;
}
