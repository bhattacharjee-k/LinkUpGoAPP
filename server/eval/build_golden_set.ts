// Tier 1 golden set extraction.
// Behavioral gold from votes + event_feedback. No hand-labeling here — that's Tier 2.
//
// Attendance signal: existence of an `event_feedback` row. Per schema.ts:218 and
// docs/CURRENT-DECISION-ALGORITHM.md, feedback is post-event-only. A feedback row
// implies the user attended.
//
// Relevance scale (per the rebuild brief, §0.1):
//   3 = vote_up AND attended (event_feedback row exists for that suggestion+user)
//   2 = strong feedback: rating >= 4 AND wouldRecommend = true
//   1 = (reserved — currently we only emit 0/2/3; soft positives could be added later)
//   0 = vote_down with reasons[]  OR  impression with no action
//
// Splits: leave-last-event-out per user. Held-out = each user's most recent
// session that has any labels.

import { db } from '../storage';
import { sessions, suggestions, votes, eventFeedback, users, sessionParticipants } from '@shared/schema';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import type { GoldenExample, GoldenIntent, GoldenLabel, Relevance, GoldenSource } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'golden');
const OUT_TIER1 = path.join(OUT_DIR, 'tier1.jsonl');
const OUT_HOLDOUT = path.join(OUT_DIR, 'tier1_holdout.jsonl');

interface RawLabel {
  sessionId: string;
  userId: string;
  suggestionId: string;
  // raw signals
  voteUp: boolean;
  voteDown: boolean;
  downvoteReasons: string[] | null;
  feedbackRating: number | null;
  wouldRecommend: boolean | null;
  attended: boolean; // = event_feedback row exists for this suggestion+user
  signalAt: Date;
}

function deriveRelevance(r: RawLabel): { relevance: Relevance; source: GoldenSource } | null {
  if (r.voteUp && r.attended) return { relevance: 3, source: 'vote_up_attended' };
  if (r.feedbackRating !== null && r.feedbackRating >= 4 && r.wouldRecommend === true) {
    return { relevance: 2, source: 'feedback_high' };
  }
  if (r.voteDown && r.downvoteReasons && r.downvoteReasons.length > 0) {
    return { relevance: 0, source: 'vote_down' };
  }
  // Impressions without any action — weighted lowest. The brief warns about
  // position bias here, so we mark these as 0 with the explicit `impression_no_action`
  // source so downstream metrics can choose to reweight.
  if (!r.voteUp && !r.voteDown && r.feedbackRating === null) {
    return { relevance: 0, source: 'impression_no_action' };
  }
  return null;
}

async function fetchRawLabels(): Promise<RawLabel[]> {
  // One row per (session, user, suggestion) with the union of vote and feedback signals.
  // Done as a single SQL pass to keep memory bounded for ~hundreds of thousands of rows.
  const rows = await db
    .select({
      sessionId: suggestions.sessionId,
      userId: votes.userId, // we'll coalesce with feedback.userId below
      suggestionId: suggestions.id,
      voteType: votes.voteType,
      reasons: votes.reasons,
      feedbackRating: eventFeedback.rating,
      wouldRecommend: eventFeedback.wouldRecommend,
      voteAt: votes.createdAt,
      feedbackAt: eventFeedback.createdAt,
    })
    .from(suggestions)
    .leftJoin(votes, eq(votes.suggestionId, suggestions.id))
    .leftJoin(
      eventFeedback,
      and(eq(eventFeedback.suggestionId, suggestions.id), eq(eventFeedback.userId, votes.userId)),
    );

  // Group by (session, user, suggestion). When a user filed feedback but never
  // voted, votes.userId is null — handled below by filling from feedback.
  const map = new Map<string, RawLabel>();
  for (const row of rows) {
    const userId = row.userId; // votes.userId
    if (!userId) continue; // skip rows with no associated user
    const key = `${row.sessionId}|${userId}|${row.suggestionId}`;
    const existing = map.get(key);
    const voteUp = row.voteType === 'up';
    const voteDown = row.voteType === 'down';
    const attended = row.feedbackRating !== null;
    const signalAt = row.feedbackAt || row.voteAt || new Date();
    if (!existing) {
      map.set(key, {
        sessionId: row.sessionId,
        userId,
        suggestionId: row.suggestionId,
        voteUp,
        voteDown,
        downvoteReasons: row.reasons,
        feedbackRating: row.feedbackRating,
        wouldRecommend: row.wouldRecommend,
        attended,
        signalAt,
      });
    } else {
      existing.voteUp = existing.voteUp || voteUp;
      existing.voteDown = existing.voteDown || voteDown;
      if (row.reasons) existing.downvoteReasons = row.reasons;
      if (row.feedbackRating !== null) existing.feedbackRating = row.feedbackRating;
      if (row.wouldRecommend !== null) existing.wouldRecommend = row.wouldRecommend;
      existing.attended = existing.attended || attended;
      if (signalAt > existing.signalAt) existing.signalAt = signalAt;
    }
  }

  // Add impressions for (session, user) pairs where the user *participated* but
  // didn't vote/feedback on every shown suggestion. These become the implicit
  // negatives. We materialize them by joining session_participants → suggestions.
  const impressionRows = await db
    .select({
      sessionId: sessionParticipants.sessionId,
      userId: sessionParticipants.userId,
      suggestionId: suggestions.id,
    })
    .from(sessionParticipants)
    .innerJoin(suggestions, eq(suggestions.sessionId, sessionParticipants.sessionId));

  for (const row of impressionRows) {
    const key = `${row.sessionId}|${row.userId}|${row.suggestionId}`;
    if (map.has(key)) continue;
    map.set(key, {
      sessionId: row.sessionId,
      userId: row.userId,
      suggestionId: row.suggestionId,
      voteUp: false,
      voteDown: false,
      downvoteReasons: null,
      feedbackRating: null,
      wouldRecommend: null,
      attended: false,
      signalAt: new Date(0), // unknown — will be filled from session.createdAt below
    });
  }

  return Array.from(map.values());
}

async function fetchIntents(sessionIds: string[]): Promise<Map<string, GoldenIntent>> {
  if (sessionIds.length === 0) return new Map();
  const sessRows = await db
    .select({
      id: sessions.id,
      filters: sessions.filters,
      neighborhood: sessions.neighborhood,
    })
    .from(sessions)
    .where(inArray(sessions.id, sessionIds));

  const userRows = await db.select().from(users);
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  const out = new Map<string, GoldenIntent>();
  for (const s of sessRows) {
    const f = (s.filters || {}) as Record<string, any>;
    // The intent is per-user, so we need a userId; we'll fill that in at
    // assembly time (one intent per (session, user) pair). The base shape is
    // here; the per-user fields come from `userMap` when we assemble.
    out.set(s.id, {
      sessionId: s.id,
      userId: '', // filled later
      city: (f.locationScope || f.city || 'NYC') as 'NYC' | 'Chicago',
      categories: Array.isArray(f.category) ? f.category : Array.isArray(f.categories) ? f.categories : [],
      budget: f.budget,
      energy: f.energy,
      timeWindow: f.timeWindow,
      specificDate: f.specificDate,
      specificTime: f.specificTime,
      neighborhood: s.neighborhood || f.neighborhood,
      vibeDescription: f.vibeDescription,
      locationMode: f.locationMode,
      discoveryStyle: undefined, // filled per-user
      crowdPreference: undefined,
      favoriteNeighborhoods: undefined,
    });
  }
  // Stash the user lookup so the assembler can fill per-user prefs.
  (out as any).__userMap = userMap;
  return out;
}

function leaveLastEventOut(examples: GoldenExample[]): {
  train: GoldenExample[];
  holdout: GoldenExample[];
} {
  // Group by user, take their most recent session as holdout.
  const byUser = new Map<string, GoldenExample[]>();
  for (const ex of examples) {
    const u = ex.intent.userId;
    if (!u) continue;
    const arr = byUser.get(u) || [];
    arr.push(ex);
    byUser.set(u, arr);
  }
  const train: GoldenExample[] = [];
  const holdout: GoldenExample[] = [];
  byUser.forEach((userExamples) => {
    if (userExamples.length === 0) return;
    userExamples.sort((a: GoldenExample, b: GoldenExample) => {
      const aMax = Math.max(...a.labels.map((l: GoldenLabel) => Date.parse(l.signalAt) || 0));
      const bMax = Math.max(...b.labels.map((l: GoldenLabel) => Date.parse(l.signalAt) || 0));
      return aMax - bMax;
    });
    if (userExamples.length === 1) {
      train.push(userExamples[0]);
    } else {
      train.push(...userExamples.slice(0, -1));
      holdout.push(userExamples[userExamples.length - 1]);
    }
  });
  return { train, holdout };
}

export async function buildGoldenSet(): Promise<{
  totalLabels: number;
  posCount: number;
  attendedCount: number;
  negCount: number;
  trainExamples: number;
  holdoutExamples: number;
}> {
  console.log('[golden] Fetching raw labels...');
  const raw = await fetchRawLabels();
  console.log(`[golden] ${raw.length} raw (session,user,suggestion) rows`);

  // Build labels per row.
  const labels: GoldenLabel[] = [];
  for (const r of raw) {
    const derived = deriveRelevance(r);
    if (!derived) continue;
    labels.push({
      id: `${r.sessionId}|${r.userId}|${r.suggestionId}`,
      userId: r.userId,
      sessionId: r.sessionId,
      suggestionId: r.suggestionId,
      relevance: derived.relevance,
      downvoteReasons: r.downvoteReasons || undefined,
      source: derived.source,
      signalAt: r.signalAt.toISOString(),
    });
  }

  // Group labels by (session, user) → one GoldenExample per user-session pair.
  const exampleMap = new Map<string, GoldenLabel[]>();
  for (const l of labels) {
    const key = `${l.sessionId}|${l.userId}`;
    const arr = exampleMap.get(key) || [];
    arr.push(l);
    exampleMap.set(key, arr);
  }

  const sessionIds = Array.from(new Set(labels.map((l) => l.sessionId)));
  const intents = await fetchIntents(sessionIds);
  const userMap: Map<string, any> = (intents as any).__userMap || new Map();

  const examples: GoldenExample[] = [];
  exampleMap.forEach((lab, key) => {
    const [sessionId, userId] = key.split('|');
    const baseIntent = intents.get(sessionId);
    if (!baseIntent) return;
    const u = userMap.get(userId);
    examples.push({
      intent: {
        ...baseIntent,
        userId,
        discoveryStyle: u?.discoveryStyle,
        crowdPreference: u?.crowdPreference,
        favoriteNeighborhoods: u?.favoriteNeighborhoods,
      },
      labels: lab,
    });
  });

  const { train, holdout } = leaveLastEventOut(examples);

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_TIER1, train.map((e) => JSON.stringify(e)).join('\n'));
  fs.writeFileSync(OUT_HOLDOUT, holdout.map((e) => JSON.stringify(e)).join('\n'));

  const stats = {
    totalLabels: labels.length,
    posCount: labels.filter((l) => l.relevance >= 2).length,
    attendedCount: labels.filter((l) => l.relevance === 3).length,
    negCount: labels.filter((l) => l.relevance === 0).length,
    trainExamples: train.length,
    holdoutExamples: holdout.length,
  };
  console.log('[golden] Stats:', stats);
  console.log(`[golden] Wrote ${OUT_TIER1} and ${OUT_HOLDOUT}`);
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildGoldenSet()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[golden] Failed:', err);
      process.exit(1);
    });
}
