# Energy Levels — Solidified Spec

> **Status:** Design spec, not built. **Date:** 2026-05-30.
> Turns the four energy levels (Chill → Vibey → Going out → Full send) from arbitrary vibe-labels
> into a measurable, standardized, self-calibrating system. Builds on
> [`SQUAD-LEARNING-DESIGN.md`](./SQUAD-LEARNING-DESIGN.md). Grounded in the measurement research
> summarized at the bottom.

## The core idea: one measurable index, four named bands

Define a single **Night Intensity Index (NII)** from 0–100, computed from *observable* attributes.
The four energy levels are labeled **bands** on that index. Crucially, **both venues and user intent
live on the same axis** — so "what the user wants tonight" and "how intense this venue is" are directly
comparable. (This is the same intensity axis as the venue-character work — demand side vs. supply side.)

```
NII(venue) = 100 × ( w_spend·spend + w_late·lateness + w_int·intensity + w_crowd·crowd )
```

| Component | Meaning | Source (observable) | Normalize |
|---|---|---|---|
| `spend` | price tier | Google Places `priceLevel` | $=0, $$=.33, $$$=.66, $$$$=1 |
| `lateness` | how late it runs | opening hours | closes ≤10pm = 0 … open 4–5am = 1 |
| `intensity` | quiet ↔ loud / scene | venue-character tags & reviews | 0–1 |
| `crowd` | intimate ↔ packed | review count / capacity + character | 0–1 |

Starting weights (tunable — see Tunable Parameters): `spend .20, lateness .30, intensity .30, crowd .20`.

The point: the slider number is no longer a feeling — it **decomposes into things we can measure on
every venue**, so it can be validated and tuned against real data instead of guessed.

## The four bands (anchored to observable criteria — BARS)

| Level | NII band | What the user sees (the anchor) | Target attribute ranges |
|---|---|---|---|
| 🌙 **Chill** | 0–25 | "Show up as you are — dive-bar easy, home whenever." | $–$$ · early · low intensity · intimate |
| ✨ **Vibey** | 25–50 | "Dressed but easy — cool bar, reasonable bedtime." | $$ · evening · med-low · moderate crowd |
| 🍸 **Going out** | 50–78 | "A real night — drinks & dancing, out late." | $$–$$$ · 1–2am · med-high · busy |
| 🚀 **Full send** | 78–100 | "All-out — clubs, big money, 4–5am." | $$$–$$$$ · 3–5am · high · packed |

The anchor text is **shown next to the slider as the user drags it** — so everyone reads the *same*
concrete definition before choosing. (This is the cheap, high-value "anchoring vignette" fix for
"my Going out ≠ your Going out": priming a shared scale, not biasing it.)

Each band is a **range, not a point** — members negotiate within it rather than being forced to one value.

## Group aggregation — ordinal, never averaged

A 346k-patient pain-scale study found these scales must be used **ordinally, not as intervals** — you can
rank levels but arithmetic on them (an "average" of 2.5) is meaningless. So:

1. Place each member's pick on the NII (band center, adjusted by their calibration — below).
2. **Group target = the *median* of member positions** (ordinal-safe), and report the **min–max spread**.
3. If the spread is wide (real conflict), favor venues whose NII sits in the **overlap** and that offer a
   calmer corner (a "bridge" venue), and **surface the split** in the UI ("3 want a big night, 1 wants chill").
   Do **not** force a consensus step — research shows it doesn't improve satisfaction.

**This fixes a live bug:** `server/routes.ts:87` currently averages energy on a broken
`['Chill','Vibey','Hype']` scale (`'Going out'`/`'Full send'` → index −1). Replace with median on the
canonical 4-level scale.

## Personal calibration — learn what each person's label *means*

The strongest objectivity comes from calibrating the stated slider against **revealed behavior** (actions
beat talk by a wide margin in the research):

1. Track each member's **revealed NII** — the actual NII of venues they pick, attend, and rate well.
2. Learn a **per-user offset**: their stated band → their personal true position. E.g., a user who always
   says "Going out" but picks $$ spots that close by midnight actually lands at NII ≈ 55, not 64.
3. **Normalize per user** against their own history (handles people who systematically skew high or low).
4. **Weight revealed over stated as data accrues**; use the calibrated value to (a) pre-fill their slider
   default and (b) re-interpret tonight's pick.

This is the formal "Differential Item Functioning" problem (same answer means different things per person)
handled pragmatically with behavioral data instead of a heavy psychometric model.

## Why this is solid, not arbitrary

- **Decomposable** — the slider maps to measurable venue attributes, so it's tunable and checkable against data.
- **Standardized** — everyone reads the same anchors as they slide (priming).
- **Ordinal-safe** — group math uses median + spread, never meaningless averages.
- **Self-correcting** — it calibrates to each person's and each squad's actual behavior over time.

## Tunable parameters (need calibration, not guessing)

- NII component **weights** (`spend/lateness/intensity/crowd`).
- Band **cutoffs** (0–25 / 25–50 / 50–78 / 78–100).
- `intensity` and `crowd` **normalization curves** (depend on the venue-character pipeline).
- Calibration **learning rate** (how fast revealed behavior overrides the stated label).

**How to validate:** measure inter-rater reliability (do different users place the same example nights in
the same band?) and fit against revealed behavior. Tune weights/cutoffs until both hold up.

## Implementation (when we build — currently spec only)

Single source of truth: **`shared/energy.ts`** (imported by client and server) holding the NII weights,
band definitions, anchor copy, and helpers:
- `nii(venue)` → 0–100
- `levelToBand(level)` → `{lo, hi}`
- `aggregateGroup(levels[])` → `{ target, spread }` (ordinal)
- `calibrate(level, userProfile)` → adjusted NII

This replaces the binary `isHighEnergy()` and the scattered prompt strings
(`orchestrator.ts`, `grounded_synthesis.ts`, `planner.ts`, `judges/vibe.ts`), and fixes `routes.ts`.
The client pulls the anchor copy from the same config so UI labels finally have definitions.

## Research basis

- **BARS** (anchor each point to observable criteria) — [guide](https://peoplemanagingpeople.com/performance-management/behaviorally-anchored-rating-scale/)
- **Anchoring vignettes / interpersonal incomparability** (show anchors before the pick) — [Gary King](https://gking.harvard.edu/category/research-interests/methods/anchoring-vignettes-for-interpersonal-incomparability), [Hopkins & King, POQ](https://academic.oup.com/poq/article-abstract/74/2/201/1936649)
- **Pain scales are ordinal, not interval** (don't average) — [NRS study, PubMed](https://pubmed.ncbi.nlm.nih.gov/37851363/)
- **IRT / Differential Item Functioning** (the formal name for the problem) — [Columbia](https://www.publichealth.columbia.edu/research/population-health-methods/differential-item-functioning)
- **Stated vs. revealed preference + per-user normalization** (calibrate from behavior) — [CEPR](https://cepr.org/voxeu/columns/reported-preference-versus-revealed-preference), [PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0220129)
