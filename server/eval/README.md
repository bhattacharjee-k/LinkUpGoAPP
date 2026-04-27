# Eval harness

The Phase 0 gate for the suggestion-pipeline rebuild. Nothing in `server/orchestrator/v2` ships to production until the harness here is green.

## What's here

| File | Purpose |
|---|---|
| `types.ts` | Shared `GoldenExample`, `GoldenLabel`, `PipelineRun`, `MetricsReport` types |
| `build_golden_set.ts` | Tier 1 extraction from `votes` + `event_feedback` (behavioral gold) |
| `metrics.ts` | NDCG@10, Recall@20, ILD, Gini, tail-coverage@20, Cohen's κ — pure TS |
| `replay.ts` | Run a pipeline against `tier1.jsonl` and produce a metrics report |
| `judge.ts` | LLM eval-judge (different model family from production) for offline meta-eval |
| `set_baseline.ts` | Promote a `current` report to the regression baseline |
| `regression.test.ts` | Vitest gate: blocks merges on >5% NDCG or >10% ILD regression |
| `golden/` | Tier 1, Tier 2, baseline live here (gitignore in your fork once data lands) |
| `reports/` | One JSON report per replay run (timestamped) |

## Running it

### One-time: build the Tier 1 golden set

Requires `DATABASE_URL` pointing at a database with real session/vote/feedback data — your local dev DB has none, so this runs against Neon dev (or whichever env has signal). Coordinate with the human before pointing at prod.

```bash
npm run eval:build-golden
```

Writes `server/eval/golden/tier1.jsonl` and `tier1_holdout.jsonl` with leave-last-event-out splits.

### Establish the baseline

```bash
npm run eval:replay -- --pipeline=current
npm run eval:set-baseline
```

That runs the existing `getOrchestratedSuggestions` pipeline against the golden set and freezes the result as the regression floor.

### Replay a candidate pipeline

```bash
npm run eval:replay -- --pipeline=v2
```

Then rerun `npm run test` — the regression gate compares the latest `v2` report against the baseline.

### Calibrate the LLM eval-judge (HUMAN-blocked)

Tier 2 (hand-labeled hard cases) must exist first. See [Tier 2 labeling](#tier-2-labeling-human-required) below.

```bash
npx tsx server/eval/judge.ts
```

Reports Cohen's κ. Target > 0.6. Below that, iterate the rubric in `judge.ts:OVERALL_RUBRIC`.

## Phase 0 exit criteria

Per the rebuild brief:

- [x] Tier 1 generation script (`build_golden_set.ts`) ✅
- [x] Metrics module (`metrics.ts`) ✅
- [x] Replay runner (`replay.ts`) ✅
- [x] Regression Vitest gate (`regression.test.ts`) ✅
- [x] LLM eval-judge skeleton (`judge.ts`) ✅
- [ ] **Tier 1 generated against real data** — needs `DATABASE_URL` with actual sessions
- [ ] **Tier 2 hand-labeled, ≥50 examples** — HUMAN REQUIRED
- [ ] **Eval-judge calibrated to κ > 0.6 against Tier 2** — depends on Tier 2
- [ ] **Baseline frozen from current pipeline run** — needs Tier 1 + a successful replay

## Tier 2 labeling (HUMAN REQUIRED)

Per §0.2 of the rebuild brief, Tier 2 needs taste — Claude Code is explicitly told *not* to generate it. The format is:

```jsonl
{"input": {"intent": {...}, "candidate": {...}}, "goldScore": 2}
{"input": {"intent": {...}, "candidate": {...}}, "goldScore": 0}
```

50–100 examples, balanced across the four downvote-reason classes (`tooFar`, `tooExpensive`, `notMyVibe`, `tooCrowded`), plus cold-start users (≤2 prior events) and edge neighborhoods (not in the hardcoded list — see [`docs/CURRENT-DECISION-ALGORITHM.md`](../../docs/CURRENT-DECISION-ALGORITHM.md) §6).

Score each candidate 0–3 against the user's profile + intent. Persist to `server/eval/golden/tier2.jsonl`.

## Notes on the attendance signal

A Tier 1 label of `relevance=3` (attended + voted up) is derived from the existence of an `event_feedback` row for the (user, suggestion) pair. Per `shared/schema.ts:218` and `replit.md`, feedback is collected post-event only — so a feedback row implies attendance. There is no separate `attended` column and no `session_participants.status='attended'` value.

If the future schema introduces an explicit attendance signal, update `deriveRelevance()` in `build_golden_set.ts` accordingly.
