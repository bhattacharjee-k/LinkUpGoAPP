// Phase 1.2: Gemini Flash with Google Search grounding.
//
// Replaces the separate Perplexity branch by folding web discovery into the
// Phase 1 Gemini call. Output is BOTH the OrchestratorBrief AND a
// `discovered_venues[]` array with name + neighborhood + reason — the names
// then go through the existing `fetchGooglePlacesByName` flow to get
// structured Place data.
//
// We call Gemini's native REST API for grounding (the OpenAI compat layer
// doesn't expose googleSearch as a tool). The API key is reused from
// AI_INTEGRATIONS_OPENAI_API_KEY (if you're using the Gemini OpenAI-compat
// endpoint, the same key works at the native endpoint). Override with
// `GEMINI_API_KEY` if you provision a separate key.
//
// Resilience: on any failure (auth, schema, parse), we degrade gracefully and
// the caller falls back to the existing un-grounded synthesizeContext +
// optional Perplexity branch. Per the rebuild brief anti-pattern: do NOT
// delete server/perplexity.ts until v2 is at 100% rollout.

import { devLog } from '../logger';
import type { OrchestratorBrief } from '../orchestrator';
import type { SuggestRequest, GroupPreferenceSummary, DownvoteReasonAggregates } from '../suggestions';
import { HIGH_ENERGY_LEVELS } from '@shared/energy';

const GEMINI_REST = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROUNDED_MODEL = 'gemini-2.5-flash'; // grounding requires Flash or Pro, not Flash-Lite
const HIGH_ENERGY_PROMPT_LABELS = HIGH_ENERGY_LEVELS.map(level => `"${level}"`).join(', ');
const SQUAD_HISTORY_TEXT_LIMIT = 600;

export interface GroundedBrief extends OrchestratorBrief {
  /** Names + light context surfaced by the grounded search. Re-fetched via Places. */
  discoveredVenues: Array<{
    name: string;
    neighborhood?: string;
    reason?: string;
  }>;
  /** Whether grounding actually fired (false → degraded to non-grounded JSON). */
  grounded: boolean;
}

function getKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
}

function buildPrompt(
  req: SuggestRequest,
  groupPrefs?: GroupPreferenceSummary,
  downvoteReasons?: DownvoteReasonAggregates,
  feedbackHistory?: Array<{ venueName: string; rating: number; tags?: string[] | null; review?: string | null }>,
): string {
  const downvoteSummary = downvoteReasons
    ? Object.entries(downvoteReasons)
        .filter(([, count]) => count > 0)
        .map(([reason, count]) => `${reason}: ${count}x`)
        .join(', ')
    : 'none';

  const feedbackSummary = feedbackHistory && feedbackHistory.length > 0
    ? feedbackHistory.map((f) => `${f.venueName}: ${f.rating}★${f.tags?.length ? ` [${f.tags.join(', ')}]` : ''}${f.review ? ` "${f.review}"` : ''}`).join('\n')
    : 'none';

  const memberCount = groupPrefs?.memberCount || 1;
  const squadHistoryText = (req.squadHistory?.text || '').slice(0, SQUAD_HISTORY_TEXT_LIMIT);

  return `You are a social-event planning assistant for young professionals in NYC and Chicago.
Use Google Search to find current, real venues that match this group's intent. Return BOTH a structured brief AND the venue names you discovered.

PLAN REQUEST:
- City: ${req.city}
- Categories: ${(req.categories || []).join(', ')}
- Energy: ${req.energy || 'flexible'}
- Budget: ${req.budget || 'flexible'}
- Time: ${req.specificTime || req.timeWindow || 'flexible'}
- Date: ${req.specificDate || 'flexible'}
- Neighborhood: ${req.neighborhood || 'any'}
- Location Mode: ${req.locationMode || 'near_me'}
- Discovery Style: ${req.discoveryStyle || 'mixed'}
- Crowd Preference: ${req.crowdPreference || 'no_preference'}
- Favorite Neighborhoods: ${(req.favoriteNeighborhoods || []).join(', ') || 'none'}
- Group Size: ${memberCount}
${req.vibeDescription ? `- Free-text vibe: "${req.vibeDescription}"` : ''}

PAST DOWNVOTE REASONS: ${downvoteSummary}
PAST VENUE FEEDBACK:
${feedbackSummary}
${squadHistoryText ? `\nSQUAD HISTORY:\n${squadHistoryText}\n` : ''}

INSTRUCTIONS:
1. Use Search to find 8-15 real venues that match this intent — favor variety. Include genuine hidden gems alongside well-known spots.
2. AGGRESSIVELY exclude restaurant types for late-night (>9PM) or high-energy (${HIGH_ENERGY_PROMPT_LABELS}) plans.
3. Return ONLY valid JSON — no markdown fences. Schema:

{
  "naturalLanguageIntent": "2-3 sentence description of what they actually want",
  "perplexityQuery": "(legacy field; supply the same query you'd ask a local friend)",
  "googlePlacesTypes": ["night_club", "bar", ...],
  "googlePlacesTextQueries": ["speakeasy bars Chicago", ...],
  "excludeTypes": ["restaurant", "cafe"],
  "vibeKeywords": ["dance floor", "DJ", ...],
  "mustBeOpenAt": "21:00" or null,
  "maxBudgetLevel": 1-4,
  "preferredNeighborhoods": [...],
  "radiusBias": "tight" | "normal" | "wide",
  "discoveredVenues": [
    {"name": "Real venue name", "neighborhood": "Williamsburg", "reason": "why it fits"}
  ]
}`;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: unknown;
  }>;
  error?: { message?: string };
}

export async function groundedSynthesizeContext(
  req: SuggestRequest,
  groupPrefs?: GroupPreferenceSummary,
  downvoteReasons?: DownvoteReasonAggregates,
  feedbackHistory?: Array<{ venueName: string; rating: number; tags?: string[] | null; review?: string | null }>,
): Promise<GroundedBrief | null> {
  const key = getKey();
  if (!key) {
    devLog('warn', '[grounded] No API key for Gemini grounding — returning null (caller will fall back).');
    return null;
  }

  const prompt = buildPrompt(req, groupPrefs, downvoteReasons, feedbackHistory);
  const url = `${GEMINI_REST}/${GROUNDED_MODEL}:generateContent?key=${encodeURIComponent(key)}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2200,
      // Note: when googleSearch is enabled, structured-output / responseSchema
      // is not always honored. We rely on the prompt to enforce JSON shape.
    },
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      devLog('warn', `[grounded] Gemini ${resp.status}: ${await resp.text()}`);
      return null;
    }
    const data = (await resp.json()) as GeminiResponse;
    if (data.error) {
      devLog('warn', `[grounded] Gemini error: ${data.error.message}`);
      return null;
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    return parseGroundedBrief(text, !!data.candidates?.[0]?.groundingMetadata);
  } catch (err) {
    devLog('error', '[grounded] Gemini call failed', { error: (err as Error).message });
    return null;
  }
}

function parseGroundedBrief(text: string, grounded: boolean): GroundedBrief | null {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  // Sometimes Gemini wraps JSON inside surrounding prose when grounding fires.
  // Try to extract the first balanced JSON object.
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      naturalLanguageIntent: String(parsed.naturalLanguageIntent || ''),
      perplexityQuery: String(parsed.perplexityQuery || ''),
      googlePlacesTypes: Array.isArray(parsed.googlePlacesTypes) ? parsed.googlePlacesTypes : [],
      googlePlacesTextQueries: Array.isArray(parsed.googlePlacesTextQueries) ? parsed.googlePlacesTextQueries : [],
      excludeTypes: Array.isArray(parsed.excludeTypes) ? parsed.excludeTypes : [],
      vibeKeywords: Array.isArray(parsed.vibeKeywords) ? parsed.vibeKeywords : [],
      mustBeOpenAt: parsed.mustBeOpenAt ?? null,
      maxBudgetLevel: typeof parsed.maxBudgetLevel === 'number' ? parsed.maxBudgetLevel : 2,
      preferredNeighborhoods: Array.isArray(parsed.preferredNeighborhoods) ? parsed.preferredNeighborhoods : [],
      radiusBias: parsed.radiusBias === 'tight' || parsed.radiusBias === 'wide' ? parsed.radiusBias : 'normal',
      discoveredVenues: Array.isArray(parsed.discoveredVenues)
        ? parsed.discoveredVenues
            .filter((v: any) => v && typeof v.name === 'string')
            .map((v: any) => ({
              name: String(v.name),
              neighborhood: typeof v.neighborhood === 'string' ? v.neighborhood : undefined,
              reason: typeof v.reason === 'string' ? v.reason : undefined,
            }))
        : [],
      grounded,
    };
  } catch {
    return null;
  }
}
