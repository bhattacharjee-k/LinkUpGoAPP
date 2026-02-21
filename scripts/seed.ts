import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../shared/schema.js";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const hashedPassword = await bcrypt.hash("password123", 10);

console.log("Clearing existing data...");
await db.execute(sql`TRUNCATE
  event_feedback, votes, suggestions, messages, notifications, notification_prefs,
  proposed_times, session_participants, sessions, group_members, groups, refresh_tokens, users
  CASCADE`);

// --- Users ---
console.log("Creating users...");
const [alice, bob, carla, dave] = await db
  .insert(schema.users)
  .values([
    {
      username: "alice",
      password: hashedPassword,
      name: "Alice Chen",
      email: "alice@example.com",
      city: "NYC",
      budget: ["$$", "$$$"],
      energy: "Vibey",
      categories: ["Cocktail Bars", "Live Music", "Rooftop Bars"],
      hardNos: ["Karaoke"],
      discoveryStyle: "hidden_gems",
      crowdPreference: "buzzing",
      favoriteNeighborhoods: ["East Village", "Lower East Side", "Williamsburg"],
    },
    {
      username: "bob",
      password: hashedPassword,
      name: "Bob Martinez",
      email: "bob@example.com",
      city: "NYC",
      budget: ["$", "$$"],
      energy: "Chill",
      categories: ["Dive Bars", "Pizza", "Comedy Shows"],
      hardNos: ["Clubbing"],
      discoveryStyle: "mixed",
      crowdPreference: "quiet",
      favoriteNeighborhoods: ["West Village", "Bushwick"],
    },
    {
      username: "carla",
      password: hashedPassword,
      name: "Carla Washington",
      email: "carla@example.com",
      city: "Chicago",
      budget: ["$$", "$$$"],
      energy: "Going out",
      categories: ["Speakeasies", "Jazz Clubs", "Wine Bars"],
      hardNos: ["Sports Bars"],
      discoveryStyle: "popular",
      crowdPreference: "buzzing",
      favoriteNeighborhoods: ["Wicker Park", "Logan Square"],
    },
    {
      username: "dave",
      password: hashedPassword,
      name: "Dave Kim",
      email: "dave@example.com",
      city: "Chicago",
      budget: ["$", "$$", "$$$"],
      energy: "Full send",
      categories: ["Breweries", "Tacos", "Live Music", "Arcades"],
      hardNos: [],
      discoveryStyle: "mixed",
      crowdPreference: "no_preference",
      favoriteNeighborhoods: ["Pilsen", "Wicker Park", "Lincoln Park"],
    },
  ])
  .returning();

// --- Groups ---
console.log("Creating groups...");
const [nycGroup, chiGroup] = await db
  .insert(schema.groups)
  .values([
    { name: "NYC Friday Crew", adminId: alice.id, inviteCode: "NYC-FRIDAY" },
    { name: "Chicago Weekend", adminId: carla.id, inviteCode: "CHI-WKND" },
  ])
  .returning();

// --- Group Members ---
await db.insert(schema.groupMembers).values([
  { groupId: nycGroup.id, userId: alice.id },
  { groupId: nycGroup.id, userId: bob.id },
  { groupId: chiGroup.id, userId: carla.id },
  { groupId: chiGroup.id, userId: dave.id },
]);

// --- Sessions ---
console.log("Creating sessions...");
const [votingSession, draftSession] = await db
  .insert(schema.sessions)
  .values([
    {
      name: "Friday Night Out",
      groupId: nycGroup.id,
      status: "voting",
      inviteCode: "FRI-NIGHT",
      filters: {
        city: "NYC",
        date: "2026-02-27",
        time: "evening",
        budget: ["$$", "$$$"],
        category: ["Cocktail Bars", "Live Music"],
        energy: "Vibey",
        locationMode: "near_me",
      },
      guardrails: {
        maxDistance: "2 miles",
        hardNos: ["Karaoke", "Clubbing"],
      },
      neighborhood: "East Village",
    },
    {
      name: "Saturday Explore",
      groupId: chiGroup.id,
      status: "draft",
      inviteCode: "SAT-EXPLORE",
      filters: {
        city: "Chicago",
        date: "2026-02-28",
        time: "afternoon",
        budget: ["$", "$$"],
        category: ["Breweries", "Tacos"],
        energy: "Going out",
        locationMode: "explore_anywhere",
      },
      guardrails: {
        maxDistance: "5 miles",
        hardNos: ["Sports Bars"],
      },
    },
  ])
  .returning();

// --- Session Participants ---
await db.insert(schema.sessionParticipants).values([
  { sessionId: votingSession.id, userId: alice.id, status: "active" },
  { sessionId: votingSession.id, userId: bob.id, status: "active" },
  { sessionId: draftSession.id, userId: carla.id, status: "active" },
  { sessionId: draftSession.id, userId: dave.id, status: "active" },
]);

// --- Suggestions for voting session ---
console.log("Creating suggestions...");
const suggestionData = await db
  .insert(schema.suggestions)
  .values([
    {
      sessionId: votingSession.id,
      name: "Death & Co",
      city: "NYC",
      source: "Web",
      kind: "venue",
      rating: "4.7",
      turnout: "High",
      distance: "0.3 mi",
      budget: "$$$",
      description: "Award-winning cocktail bar with inventive drinks and a speakeasy atmosphere.",
      tags: ["Cocktails", "Speakeasy", "Date Night"],
      detailUrl: "https://www.deathandcompany.com",
      reservationUrl: "https://resy.com/cities/ny/death-and-co",
      whyExplanation: "Matches Alice's love for cocktail bars and hidden gems in the East Village.",
    },
    {
      sessionId: votingSession.id,
      name: "Please Don't Tell",
      city: "NYC",
      source: "Web",
      kind: "venue",
      rating: "4.5",
      turnout: "Medium",
      distance: "0.2 mi",
      budget: "$$$",
      description: "Hidden speakeasy behind a phone booth in a hot dog shop. Creative cocktails.",
      tags: ["Speakeasy", "Cocktails", "Hidden Gem"],
      whyExplanation: "A true hidden gem that both Alice and Bob will enjoy — intimate and vibey.",
    },
    {
      sessionId: votingSession.id,
      name: "Nublu",
      city: "NYC",
      source: "Web",
      kind: "venue",
      rating: "4.3",
      turnout: "Medium",
      distance: "0.4 mi",
      budget: "$$",
      description: "Eclectic live music venue with jazz, funk, and world music in the East Village.",
      tags: ["Live Music", "Jazz", "Dance"],
      whyExplanation: "Great live music pick — matches the group's interest in music venues.",
    },
    {
      sessionId: votingSession.id,
      name: "Amor y Amargo",
      city: "NYC",
      source: "Web",
      kind: "venue",
      rating: "4.6",
      turnout: "Low",
      distance: "0.1 mi",
      budget: "$$",
      description: "Tiny bitters-focused cocktail bar. Standing room only, incredible drinks.",
      tags: ["Cocktails", "Intimate", "Unique"],
      whyExplanation: "An East Village cocktail gem — small and buzzing, right up Alice's alley.",
    },
    {
      sessionId: votingSession.id,
      name: "Jazz at Lincoln Center - Dizzy's Club",
      city: "NYC",
      source: "Web",
      kind: "event",
      rating: "4.8",
      turnout: "High",
      distance: "2.1 mi",
      budget: "$$$",
      description: "World-class jazz performances with stunning Columbus Circle views.",
      tags: ["Jazz", "Live Music", "Premium"],
      venueName: "Dizzy's Club",
      startTime: "7:30 PM",
      whyExplanation: "Premium live jazz experience — a step up from the usual bar scene.",
    },
    {
      sessionId: votingSession.id,
      name: "The Wayland",
      city: "NYC",
      source: "Web",
      kind: "venue",
      rating: "4.4",
      turnout: "High",
      distance: "0.5 mi",
      budget: "$$",
      description: "Neighborhood cocktail bar with a great backyard and rotating DJs.",
      tags: ["Cocktails", "Outdoor", "DJs"],
      whyExplanation: "Laid-back enough for Bob, vibey enough for Alice — a solid compromise.",
    },
    {
      sessionId: votingSession.id,
      name: "2A",
      city: "NYC",
      source: "Web",
      kind: "venue",
      rating: "4.1",
      turnout: "Medium",
      distance: "0.2 mi",
      budget: "$",
      description: "Cash-only dive bar with a fireplace and cheap drinks on Avenue A.",
      tags: ["Dive Bar", "Cheap Drinks", "Laid Back"],
      whyExplanation: "Bob's kind of spot — chill, cheap, no pretension. Great for starting the night.",
    },
  ])
  .returning();

// --- Votes ---
console.log("Creating votes...");
await db.insert(schema.votes).values([
  // Alice votes
  { suggestionId: suggestionData[0].id, userId: alice.id, voteType: "up" },
  { suggestionId: suggestionData[1].id, userId: alice.id, voteType: "up" },
  { suggestionId: suggestionData[3].id, userId: alice.id, voteType: "up" },
  { suggestionId: suggestionData[6].id, userId: alice.id, voteType: "down", reasons: ["NOT_MY_VIBE"] },
  // Bob votes
  { suggestionId: suggestionData[2].id, userId: bob.id, voteType: "up" },
  { suggestionId: suggestionData[5].id, userId: bob.id, voteType: "up" },
  { suggestionId: suggestionData[6].id, userId: bob.id, voteType: "up" },
  { suggestionId: suggestionData[4].id, userId: bob.id, voteType: "down", reasons: ["TOO_EXPENSIVE", "TOO_FAR"] },
]);

// --- Messages ---
console.log("Creating messages...");
await db.insert(schema.messages).values([
  {
    sessionId: votingSession.id,
    sender: alice.id,
    senderName: "Alice Chen",
    text: "Hey! I set up the session for Friday — let's find something fun in the East Village!",
  },
  {
    sessionId: votingSession.id,
    sender: bob.id,
    senderName: "Bob Martinez",
    text: "Looks good! I'm down for whatever, but nothing too pricey please 😅",
  },
  {
    sessionId: votingSession.id,
    sender: "planner-ai",
    senderName: "Planner",
    text: "I found 7 options in the East Village area that match your group's vibe. Death & Co and Amor y Amargo are standouts for cocktails, and Nublu has great live music tonight. Vote on your favorites!",
    metadata: { tokensUsed: 342 },
  },
  {
    sessionId: votingSession.id,
    sender: alice.id,
    senderName: "Alice Chen",
    text: "@Planner any hidden speakeasies we're missing?",
  },
]);

// --- Notifications ---
console.log("Creating notifications...");
await db.insert(schema.notifications).values([
  {
    userId: bob.id,
    type: "VOTE_OPEN",
    title: "Voting is open!",
    body: 'Alice started voting for "Friday Night Out" — cast your votes!',
    url: `/session/${votingSession.id}`,
  },
  {
    userId: alice.id,
    type: "INVITE",
    title: "New group invite",
    body: "You've been invited to NYC Friday Crew",
    url: `/groups/${nycGroup.id}`,
    isRead: true,
  },
  {
    userId: dave.id,
    type: "INVITE",
    title: "New group invite",
    body: "Carla invited you to Chicago Weekend",
    url: `/groups/${chiGroup.id}`,
  },
]);

console.log("Seed complete!");
console.log(`  Users: ${[alice, bob, carla, dave].map((u) => u.username).join(", ")}`);
console.log(`  Groups: ${nycGroup.name}, ${chiGroup.name}`);
console.log(`  Sessions: ${votingSession.name} (voting), ${draftSession.name} (draft)`);
console.log(`  Suggestions: ${suggestionData.length} in voting session`);
console.log("  Password for all users: password123");

await pool.end();
