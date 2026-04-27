// Strict JSON parse for judge output. Returns null on parse failure so the
// caller can degrade to abstention rather than crashing the panel.

import type { JudgeVerdict } from './types';

interface RawVerdict {
  candidateId?: string;
  reasoning?: string;
  score?: number | null;
  confidence?: number | null;
}

export function parseVerdictArray(text: string, judgeLabel = 'judge'): JudgeVerdict[] | null {
  const isDev = process.env.NODE_ENV === 'development';
  if (!text) {
    if (isDev) console.log(`[parse:${judgeLabel}] empty response`);
    return null;
  }
  // Strip markdown fences if the model added them despite the prompt.
  const cleaned = text
    .replace(/^\s*```json\s*/i, '')
    .replace(/^\s*```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err: any) {
    if (isDev) {
      const head = cleaned.slice(0, 100).replace(/\s+/g, ' ');
      const tail = cleaned.slice(-100).replace(/\s+/g, ' ');
      console.log(
        `[parse:${judgeLabel}] FAIL len=${cleaned.length} err="${err?.message || err}"\n  head: ${head}\n  tail: ${tail}`,
      );
    }
    // Salvage: try to extract complete `{...}` objects when the array was truncated.
    const salvaged = salvageVerdicts(cleaned);
    if (salvaged.length > 0) {
      if (isDev) console.log(`[parse:${judgeLabel}] SALVAGED ${salvaged.length} entries`);
      return salvaged;
    }
    return null;
  }
  if (!Array.isArray(parsed)) {
    if (isDev) console.log(`[parse:${judgeLabel}] FAIL: not an array, got ${typeof parsed}`);
    return null;
  }

  const verdicts: JudgeVerdict[] = parsed.map((r: RawVerdict, i: number) => ({
    candidateId: String(r.candidateId ?? `unknown_${i}`),
    score: validScore(r.score),
    confidence: validConfidence(r.confidence),
    reasoning: String(r.reasoning ?? ''),
  }));
  if (isDev) {
    const scored = verdicts.filter((v) => v.score != null).length;
    const abstained = verdicts.length - scored;
    console.log(
      `[parse:${judgeLabel}] OK len=${cleaned.length} entries=${verdicts.length} scored=${scored} abstain=${abstained}`,
    );
  }
  return verdicts;
}

/**
 * Salvage parser: when a response is truncated mid-array (token limit), extract
 * whatever complete `{...}` objects we can. Brace-matching, not regex, to handle
 * nested objects in `reasoning` strings.
 */
function salvageVerdicts(text: string): JudgeVerdict[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  const verdicts: JudgeVerdict[] = [];
  for (const objText of objects) {
    try {
      const r = JSON.parse(objText) as RawVerdict;
      verdicts.push({
        candidateId: String(r.candidateId ?? ''),
        score: validScore(r.score),
        confidence: validConfidence(r.confidence),
        reasoning: String(r.reasoning ?? ''),
      });
    } catch {
      // skip malformed
    }
  }
  return verdicts;
}

function validScore(s: any): number | null {
  if (s === null || s === undefined) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 5) return null;
  return Math.round(n);
}

function validConfidence(c: any): number | null {
  if (c === null || c === undefined) return null;
  const n = Number(c);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 1) return null;
  return n;
}
