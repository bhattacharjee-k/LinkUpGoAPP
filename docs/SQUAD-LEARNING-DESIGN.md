# Squad-Based Personalization — Design Direction

> **Status:** Draft / direction agreed, not built. **Date:** 2026-05-29.
> Captures the personalization + learning model for the suggestions rebuild. Read alongside
> [`PROJECT-CONTEXT.md`](./PROJECT-CONTEXT.md) (why the rebuild) and
> [`CURRENT-DECISION-ALGORITHM.md`](./CURRENT-DECISION-ALGORITHM.md) (what exists today).
> This doc is a thinking artifact to react to and poke holes in — it is not a final spec.

## TL;DR

1. **No static personas.** A person's "type" drives *how often* and *how-intense-a-version* of a thing they want — not *which* categories. Type falls out of behavior; we don't assume it up front.
2. **Per-event, per-member constraints.** Every plan asks each member three volatile things — **budget, energy, location+transport** — pre-filled from learned defaults so it's one tap to confirm.
3. **Group aggregation — one hard rule, the rest soft, all anonymous.** Only location+transport is a true hard constraint (you can't teleport). Budget and energy are *soft*: budget is a comfort zone you'll stretch for a standout; energy is blended. Aggregates are shown **anonymously** — counts/ranges, never "X said Y."
4. **Learning is squad-based.** The group is the unit of learning, not an amalgamation of individuals (whose moods are deliberately volatile). A squad has a stable emergent taste across many plans.
5. **Squad-first information architecture.** The app opens with "add members / or solo," then runs many plans *inside* a persistent squad — like a group chat. That history is what feeds learning.

## The key decision: why not personas

The original idea was to classify people into types ("party animal," "chill vibe") and tune from there. We rejected this as the primary mechanism because:

- **It re-creates the "generic" problem** the rebuild exists to fix — everyone in a bucket gets the same output, just with a nicer label.
- **Type doesn't pick categories.** A "chill" person still clubs on a birthday. They'd just find a mega-club (e.g. TAO) overwhelming and want the intimate version. Type modulates *intensity within a category*; it never gates the category.
- **The occasion drives the vibe** far more than standing personality does — and the occasion changes every event.

So: capture the volatile stuff per event, and let *type* emerge from observed behavior over time.

## The model: three layers

| Layer | What it is | How it's captured | When it dominates |
|---|---|---|---|
| **1. Constraints** | budget · energy · location+transport | Asked per event, per member; pre-filled from learned defaults | Always — tonight's limits (reachability hard; budget & energy soft) |
| **2. Aggregation** | combine members' answers into one search | Group logic (see rules below) | Every multi-person plan |
| **3. Taste** | what this squad actually likes | Learned from the squad's plan history | Grows as the squad matures |

### 1. Per-event, per-member constraints

The three things that genuinely change every event. Only reachability is a true hard limit (you can't get to a place you can't reach); budget and energy are strong-but-flexible preferences:

- **Budget** (`$`–`$$$$`)
- **Energy** (Chill → Full send)
- **Location + transport** (where you're coming from, how you'll get there)

Asked of **each member**, not just the plan creator — that's what makes this a group product rather than one person's search that others rubber-stamp. Pre-filled from each member's learned defaults, so confirming is one tap.

### 2. Group aggregation

Different combine rules — and **only one is hard**:

- **Location + transport → the reachable set (HARD).** N starting points + N transport modes → places everyone can actually get to. Someone with no car kills anything far out. This is the one true constraint.
- **Budget → soft comfort zone, not a cap.** Center picks where everyone's comfortable, but **don't exclude** pricier spots — apply a soft penalty for going over the cheapest member's comfort, *offset by venue quality/distinctiveness*, so a standout worth stretching for still surfaces. Only an extreme outer bound is hard (never show, say, >2 tiers above the lowest comfort). People stretch for a great experience — the model should let them.
- **Energy → blend + surface conflict.** A real split ("leaning lively, a couple want it low-key") is shown — but as *shape, not names* (see anonymity below). Don't average it into bland "Vibey" mush.

**Anonymity (important):** present aggregates as group-level outcomes — "kept it wallet-friendly," "mostly $$," "leaning lively" — and **never attribute a preference to a person**, especially budget. Outing "Sam can only do $" creates social friction *and* makes people answer dishonestly; anonymity protects the person and improves the data. Surface the *shape* of a split (counts/ranges), never who picked what.

Generate **progressively** as members answer; never block on all responses (people join a plan over hours).

### 3. Squad-based learning

The group is the primary unit. A squad's pattern across many plans is far steadier than any individual's mood. Learn:

- **Cadence (frequency)** — how often this squad does each kind of thing (the "special occasion vs every night" signal).
- **Category mix** — the distribution of what they pick.
- **Venue-attribute affinity** — intimate-vs-big, hidden-vs-popular, cheap-vs-splurge. This is the answer to the "TAO problem": learn intensity tolerance from the venues they actually kept vs downvoted as "too crowded."

**Trust signals in this order:** committed + highly-rated (the venue they locked in + post-event rating) > upvotes > downvotes-with-reason > merely-seen.

**Learning ranks *within* the stated per-event constraints — it never overrides tonight's occasion.** If the squad usually does dive bars but tonight someone set "$$$ / date night," tonight wins.

**Build order:** start with the **Planner reading plan history as context** (no ML — the existing function-calling Planner reasons "4 plans, all cheap casual dinners, the one pricey spot got downvoted → lean cheap/casual"). Graduate to a structured/learned profile later, when histories get long or per-call LLM cost matters.

## Information architecture: squad-first

Flip the app from **transactional search** (plan-first) to a **persistent social space** (squad-first), modeled on a group chat:

1. Open with **"add members / or solo."**
2. Create the squad (solo = a squad of one — one system, not two).
3. Run **multiple plans inside the squad** over time.
4. That accumulated history is what the learning reads.

The squad is the persistent container; plans are episodes inside it. The squad accumulates memory — that's the retention loop.

**Tradeoff:** squad-first adds a step before a brand-new user's first value. Mitigate by keeping **"just me" one tap** and allowing **inline squad creation** for "plan with these exact people right now."

## The maturation story

- **Brand-new squad (no history):** per-event member inputs + each member's *individual* prior carry the experience. (Individuals aren't the steady-state model — they're the cold-start seed.)
- **Established squad:** the Planner reads the squad's plan history; group taste dominates ranking; per-event inputs just handle tonight's occasion.

So the three layers always hold — weight just shifts from "member aggregation" toward "squad history" as the group matures.

## How this maps to what already exists

Encouragingly, much of this is extension, not green-field:

- **Groups are first-class** (`groups`, `groupMembers`); Home already lists "Your Groups" and can launch a plan from one. Squad-first is mostly inverting the default entry.
- **Per-member location is partly built** — the meet-in-the-middle flow already asks each participant their starting neighborhood; `transportationModes` already takes each person's mode and uses the most restrictive.
- **Behavioral signals are already collected** — `votes.downvoteReasons`, `event_feedback` (rating/tags/wouldRecommend), `winningOptionId`, and session history. Today they're mostly dumped into an AI prompt as text rather than used as structured signal. "Learning" is largely about *using what's already captured*.
- **A `userCategoryHistogram` hook already exists** in the v2 pipeline's diversity step — anticipates the category-mix signal.
- **The Planner is already a function-calling agent** — the "reads history and reasons about the group" approach needs no new ML infrastructure.
- ⚠️ **One thing to change:** new-plan currently auto-matches/creates groups by *exact member set*. Squad learning wants a **named, persistent squad** tolerant of membership drift (the per-plan "can't make it" status already supports stable-squad / variable-attendance).

## Non-goals (for now)

- Static personas as the ranking mechanism.
- LLM fine-tuning (defer until there's a large labeled dataset — well beyond current data).
- Multi-city expansion (still NYC + Chicago only).
- Changing the suggestion API response shape without coordinating mobile (TestFlight) + web.

## Open questions (what research should resolve)

1. **Group recommender systems** — how do existing systems model a *group* as a persistent entity with its own emergent taste over time, vs reconciling individuals per session? Aggregation strategies, fairness, conflict-surfacing.
2. **LLMs reasoning over interaction history** — practical patterns for the "Planner reads past plans" approach: how much history fits, how to summarize/compress it, how to keep judgments grounded.
3. **Venue character / intensity modeling** — how to represent the TAO-vs-speakeasy axis as features, and where that data comes from (Google's category + review count actively works against this).
4. **Cold-start seeding** — best practice for seeding a brand-new group from its members' individual histories, and how fast to fade the individual prior as group history accrues.
