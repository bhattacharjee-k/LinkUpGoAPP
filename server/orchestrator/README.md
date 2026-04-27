# Orchestrator (v2)

The new suggestion pipeline. Lives behind `SUGGESTIONS_PIPELINE=v2` (or `=shadow` to dual-run alongside v1). Old pipeline still lives in `server/orchestrator.ts` and `server/suggestions.ts:getSuggestions` and remains the default until v2 has been validated against the eval gate.

Read [`docs/PROJECT-CONTEXT.md`](../../docs/PROJECT-CONTEXT.md) and [`docs/CURRENT-DECISION-ALGORITHM.md`](../../docs/CURRENT-DECISION-ALGORITHM.md) before changing anything here.

## Layout

| File | Phase | What it does |
|---|---|---|
| `envelope.ts` | 1.7 | Canonical inter-stage envelope (request → final). Carries provenance, constraints, candidates, scores. |
| `grounded_synthesis.ts` | 1.2 | Gemini Flash with Google Search grounding. Returns brief + `discoveredVenues[]`. Falls back to legacy `synthesizeContext` on failure. |
| `preprocess.ts` | 1.3 | Anti-popularity preprocessing: name strip, length-normalize description, multi-tag filter, soft transport-mode score, dedupe by `(name, h3_res9)`. |
| `judges/vibe.ts` | 1.4 | Claude Haiku 4.5 vibe judge. Anthropic prompt caching on the rubric. |
| `judges/neighborhood.ts` | 1.4 | Gemini 2.5 Flash neighborhood-fit judge with structured spatial features. |
| `judges/budget.ts` | 1.4 | Gemini Flash-Lite budget-tier judge. Cheapest dimension. |
| `judges/hidden_gem.ts` | 1.4 | Claude Haiku 4.5 anti-popularity judge. Counterbalances review-count bias. |
| `judges/aggregate.ts` | 1.4 | Runs all 4 judges in parallel; weighted aggregate (vibe 0.4, neigh 0.25, budget 0.15, gem 0.2). Abstention-tolerant. |
| `pairwise.ts` | 1.5 | PRP re-rank of top 10. Position-swap + Borda count. |
| `diversity.ts` | 1.6 | MMR (λ=0.7) + Steck-style KL calibration + hard quotas (≤4 same cat / ≤2 same NTA / ≤3 same price). |
| `v2.ts` | wiring | The end-to-end pipeline. Adapts to `PipelineFn` for the eval harness. |
| `shadow.ts` + `shadow_helpers.ts` | 2.1 | Dual-run mode that serves v1 to the user and logs v2 alongside. |
| `shadow_compare.ts` | 2.2 | CLI comparison report from shadow JSONL logs. |

## Pipeline invocation

Default (legacy):
```bash
npm run dev
```

Run v2 directly:
```bash
SUGGESTIONS_PIPELINE=v2 npm run dev
```

Shadow mode (v1 served, v2 logged):
```bash
SUGGESTIONS_PIPELINE=shadow npm run dev
```

After running shadow for a while:
```bash
npm run eval:shadow-compare
```

## Key design choices (settled — do not relitigate)

Per the rebuild brief:

- **Option C (Gemini grounding folded into Phase 1)**, not Option A (Exa swap).
- **Claude Haiku 4.5** as the production judge model (with Gemini fallback when no key).
- **PoLL panel of 4** in parallel; never see each other's outputs.
- **Pointwise per-dimension scoring**; **pairwise PRP re-rank** of the top 10 in a separate stage.
- **Name stripping before judging is mandatory.**
- **MMR + KL calibration + hard quotas** for diversity, in that order.
- **Eval harness ships before architecture changes go to production.**
- **Foursquare and Yelp rejected** (licensing / pricing). Google Places stays.

## Anti-patterns (per rebuild brief)

- Do **not** turn the panel into agents that talk. They run in parallel, no debate, no reflection.
- Do **not** add a 5th judge. Four is the panel.
- Do **not** delete `server/perplexity.ts` until v2 is at 100% rollout for 4+ weeks.
- Do **not** start fine-tuning a custom judge before there are ~10K labeled pairs.
- Do **not** change Phase 3 (judging) and Phase 2 (sourcing) in the same PR.
- Do **not** run `db:neon:push:prod` casually. Ever.

## What's NOT done yet

See the HUMAN GATES section in the parent issue / PR description. Highlights:

- **Embeddings layer** for the cosine term in MMR similarity (stub returns 0 today; structured-feature similarity carries diversity until pgvector is wired in).
- **Reference-venue style anchoring** is still on v1 only — the v2 path takes `referenceVenues` as a positional arg for signature parity but doesn't yet feed it into the judges.
- **Bandit exploration slot** (Phase 3 in the brief) — not built; deferred until shadow data confirms v2 is stable.
- **PinnerSage user facets** (Phase 3) — same.
- **Llama 3.1 8B distillation** (Phase 3) — needs ≥10K labeled pairs first; stays in concept.
