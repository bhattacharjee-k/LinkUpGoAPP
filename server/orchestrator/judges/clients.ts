// Lazy-init clients for the PoLL judges.
//
// HUMAN REQUIRED: ANTHROPIC_API_KEY for Claude Haiku 4.5 (vibe + hidden_gem).
// AI_INTEGRATIONS_OPENAI_API_KEY (already configured) drives Gemini for the
// neighborhood + budget judges.
//
// If ANTHROPIC_API_KEY is missing, the panel falls back to Gemini for ALL four
// judges with a console warning. This keeps the pipeline runnable end-to-end
// during bootstrap (eval harness can replay) but prints a loud reminder that
// production isn't getting the diversity-of-models that the brief settled on.

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

let _anthropic: Anthropic | null = null;
let _gemini: OpenAI | null = null;
let _anthropicWarned = false;

export function hasAnthropic(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function getAnthropic(): Anthropic | null {
  if (!hasAnthropic()) {
    if (!_anthropicWarned) {
      console.warn(
        '[judges] ANTHROPIC_API_KEY not set — Haiku-based judges will fall back to Gemini. HUMAN REQUIRED.',
      );
      _anthropicWarned = true;
    }
    return null;
  }
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

export function getGemini(): OpenAI {
  if (!_gemini) {
    _gemini = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return _gemini;
}

// Model IDs centralized so the brief's "lock the production model" can be
// enforced in one place if we ever want to change. Per the rebuild brief:
//   - Vibe + hidden_gem: Claude Haiku 4.5
//   - Neighborhood: Gemini 2.5 Flash (structured spatial features)
//   - Budget: Gemini 2.5 Flash-Lite (cheapest is fine for deterministic match)
export const MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  geminiFlash: 'gemini-2.5-flash',
  geminiFlashLite: 'gemini-2.5-flash-lite',
};
