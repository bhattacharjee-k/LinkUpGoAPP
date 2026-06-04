// Phase 1.5: Pairwise Ranking Prompting (PRP) re-rank of the top N.
//
// Per the rebuild brief §1.5:
//   - Single judge (locked to Haiku 4.5; falls back to Gemini Flash if no key).
//   - For each pair (i, j), ask twice with positions swapped. If disagreement → tie.
//   - Aggregate via Borda count.
//
// COST / RATE NOTE: call volume is C(N,2)*2 — it grows quadratically in N.
//   N=10 → 90 calls, N=6 → 30 calls. The Anthropic Haiku rate limit is a
//   PER-MINUTE throughput ceiling (50/min on the entry tier), NOT a concurrency
//   cap — so bounding in-flight calls does NOT keep you under it; total calls per
//   minute does. The caller passes a small N (6) so a single generation's burst
//   fits under 50/min. Raise N (and/or the Anthropic tier) once on a higher tier.

import type { EnrichedCandidate, SuggestionEnvelope } from './envelope';
import { getAnthropic, getGemini, MODELS } from './judges/clients';

const SYSTEM = `You are a single-pair ranker for a social-event recommendation app.
Given two venue candidates and the user's intent, decide which one is a better fit overall.

DIMENSIONS to weigh (in this order, but consider all four):
1. Vibe match (categories, energy, free-text vibe)
2. Neighborhood / spatial fit
3. Budget fit
4. Hidden-gem-vs-popular alignment with discoveryStyle

OUTPUT: JSON with the winner and a 1-sentence reason.

Possible winners: "A", "B", or "TIE".

If the candidates are essentially equivalent or the choice depends on a coin flip, return "TIE".

Return ONLY: {"winner":"A"|"B"|"TIE","reason":"..."}`;

interface PairResult {
  winner: 'A' | 'B' | 'TIE';
  reason: string;
}

async function judgePair(a: EnrichedCandidate, b: EnrichedCandidate, request: any): Promise<PairResult | null> {
  const intent = [
    `City: ${request.city}`,
    `Categories: ${(request.categories || []).join(', ') || 'flexible'}`,
    `Energy: ${request.energy || 'flexible'}`,
    `Budget: ${request.budget || 'flexible'}`,
    `Discovery style: ${request.discoveryStyle || 'mixed'}`,
    request.vibeDescription ? `Free-text vibe: "${request.vibeDescription}"` : null,
  ].filter(Boolean).join('\n');

  const describe = (c: EnrichedCandidate) => [
    `category: ${c.category || 'unknown'}`,
    `price_tier: ${c.priceTier ?? 'unknown'}`,
    `popularity_proxy: ${c.popularityProxy.toFixed(2)}`,
    `nta_id: ${c.ntaId || 'unknown'}`,
    `transport_score: ${c.transportScore.toFixed(2)}`,
    `description: ${c.description || '(none)'}`,
  ].join('\n  ');

  const userPrompt = `INTENT:\n${intent}\n\nCANDIDATE A:\n  ${describe(a)}\n\nCANDIDATE B:\n  ${describe(b)}`;
  const text = await callJudge(userPrompt);
  return parsePairResult(text);
}

async function callJudge(userPrompt: string, retries = 2): Promise<string> {
  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      const resp = await anthropic.messages.create({
        model: MODELS.haiku,
        max_tokens: 200,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.2,
      });
      const block = resp.content.find((b) => b.type === 'text');
      return block && block.type === 'text' ? block.text : '';
    } catch (err: any) {
      // Retry on rate-limit (429); back off briefly. Skip retry for other 4xx.
      if (err?.status === 429 && retries > 0) {
        await new Promise((r) => setTimeout(r, 1500));
        return callJudge(userPrompt, retries - 1);
      }
      throw err;
    }
  }
  const resp = await getGemini().chat.completions.create({
    model: MODELS.geminiFlashLite,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 200,
  });
  return resp.choices[0]?.message?.content || '';
}

function parsePairResult(text: string): PairResult | null {
  const cleaned = text
    .replace(/^\s*```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    const w = parsed.winner;
    if (w === 'A' || w === 'B' || w === 'TIE') {
      return { winner: w, reason: String(parsed.reason || '') };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Run pairwise PRP re-rank on the top N candidates by aggregate score.
 * Returns the candidate ids in re-ranked order.
 */
export async function pairwiseRerank(
  candidates: EnrichedCandidate[],
  scoresByCandId: Map<string, number | null>,
  request: any,
  env?: SuggestionEnvelope,
  topN = 10,
): Promise<string[]> {
  const t0 = Date.now();

  // Pick the top N by aggregate score; abstentions sort to the bottom.
  const ordered = [...candidates].sort((a, b) => {
    const sa = scoresByCandId.get(a.id) ?? -1;
    const sb = scoresByCandId.get(b.id) ?? -1;
    return sb - sa;
  });
  const top = ordered.slice(0, topN);
  if (top.length < 2) {
    if (env) {
      env.pairwiseOrder = top.map((c) => c.id);
      env.task = 'pairwise';
      env.expectedOutputSchema = 'diversified';
      env.provenance.push({ task: 'pairwise', latencyMs: Date.now() - t0, note: 'too few candidates, skipped' });
    }
    return top.map((c) => c.id);
  }

  // Build the unique pair list, then judge each twice with swapped positions.
  // Borda count: A beats B → +1 to A, -1 to B. Tie → 0 each.
  // Disagreement on swap → counted as TIE per the brief.
  const points = new Map<string, number>();
  for (const c of top) points.set(c.id, 0);

  // Build pair THUNKS (not started promises) so the concurrency limiter
  // controls how many fire at a time. NOTE: concurrency smooths the burst but
  // does NOT keep us under the 50/min ceiling — only the total call count does
  // (see the COST / RATE NOTE at the top). N is kept small by the caller for
  // exactly this reason.
  const pairThunks: Array<() => Promise<void>> = [];
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = top[i];
      const b = top[j];
      pairThunks.push(async () => {
        const [r1, r2] = await Promise.all([judgePair(a, b, request), judgePair(b, a, request)]);
        if (!r1 || !r2) return;
        const winnerR1 = r1.winner === 'A' ? a.id : r1.winner === 'B' ? b.id : null;
        const winnerR2 = r2.winner === 'A' ? b.id : r2.winner === 'B' ? a.id : null;
        if (winnerR1 == null && winnerR2 == null) return; // unanimous TIE
        if (winnerR1 !== winnerR2) return; // disagreement on swap → TIE
        const winner = winnerR1!;
        const loser = winner === a.id ? b.id : a.id;
        points.set(winner, (points.get(winner) || 0) + 1);
        points.set(loser, (points.get(loser) || 0) - 1);
      });
    }
  }

  // Bound the concurrency to smooth the burst. (This caps in-flight calls, not
  // calls-per-minute — staying under 50/min is handled by keeping N small.)
  await runWithLimit(pairThunks, 4);

  // Re-order top by Borda points, breaking ties with original aggregate score.
  const reordered = top
    .map((c) => ({ id: c.id, points: points.get(c.id) || 0, agg: scoresByCandId.get(c.id) ?? -1 }))
    .sort((a, b) => b.points - a.points || b.agg - a.agg)
    .map((x) => x.id);

  // Append everything past topN unchanged.
  const tail = ordered.slice(topN).map((c) => c.id);
  const full = [...reordered, ...tail];

  if (env) {
    env.pairwiseOrder = full;
    env.task = 'pairwise';
    env.expectedOutputSchema = 'diversified';
    env.provenance.push({
      task: 'pairwise',
      latencyMs: Date.now() - t0,
      note: `pairwise re-ranked top ${reordered.length}`,
    });
  }
  return full;
}

async function runWithLimit(thunks: Array<() => Promise<void>>, limit: number): Promise<void> {
  // Worker-pool pattern: spawn `limit` workers, each pulls thunks off the
  // shared queue until it's empty. True concurrency gating.
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= thunks.length) return;
      try {
        await thunks[idx]();
      } catch (err) {
        // Per-pair failures shouldn't poison the pool. Log + continue.
        console.error('[pairwise] pair task failed:', (err as Error)?.message || err);
      }
    }
  });
  await Promise.all(workers);
}
