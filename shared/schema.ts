import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, jsonb, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email"), // Optional email for notifications
  city: text("city").notNull(), // 'NYC' | 'Chicago'
  budget: text("budget").array().notNull(), // ['$', '$$', '$$$', '$$$$']
  energy: text("energy").notNull(), // 'Chill' | 'Vibey' | 'Going out' | 'Full send'
  categories: text("categories").array().notNull(), // Interests
  hardNos: text("hard_nos").array().notNull(),
  discoveryStyle: text("discovery_style").default('mixed'), // 'hidden_gems' | 'popular' | 'mixed'
  crowdPreference: text("crowd_preference").default('no_preference'), // 'quiet' | 'buzzing' | 'no_preference'
  favoriteNeighborhoods: text("favorite_neighborhoods").array().default(sql`'{}'::text[]`), // User's preferred neighborhoods
  lastKnownLat: text("last_known_lat"),
  lastKnownLng: text("last_known_lng"),
  lastLocationTimestamp: timestamp("last_location_timestamp"),
  locationPermission: text("location_permission").default('pending'), // 'pending' | 'granted' | 'denied'
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Groups table
export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  adminId: varchar("admin_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  inviteCode: varchar("invite_code").notNull().unique(),
  locked: boolean("locked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertGroupSchema = createInsertSchema(groups).omit({ id: true, createdAt: true, inviteCode: true });
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groups.$inferSelect;

// Group members junction table
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const insertGroupMemberSchema = createInsertSchema(groupMembers).omit({ id: true, joinedAt: true });
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type GroupMember = typeof groupMembers.$inferSelect;

// Reference venue type for style anchoring
export interface ReferenceVenue {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
}

// Planning sessions table
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"),
  groupId: varchar("group_id").notNull().references(() => groups.id, { onDelete: 'cascade' }),
  status: text("status").notNull().default('draft'), // 'draft' | 'voting' | 'locked'
  lockedByUserId: varchar("locked_by_user_id").references(() => users.id),
  lockedAt: timestamp("locked_at"),
  winningOptionId: varchar("winning_option_id"),
  inviteCode: varchar("invite_code").unique(),
  filters: jsonb("filters").notNull(),
  guardrails: jsonb("guardrails").notNull(),
  neighborhood: text("neighborhood"),
  referenceVenues: jsonb("reference_venues").$type<ReferenceVenue[]>(), // Optional style anchors
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Session participants
export const sessionParticipants = pgTable("session_participants", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id").notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text("status").notNull().default('active'), // 'active' | 'cant_make_it' | 'left'
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const insertSessionParticipantSchema = createInsertSchema(sessionParticipants).omit({ id: true, joinedAt: true });
export type InsertSessionParticipant = z.infer<typeof insertSessionParticipantSchema>;
export type SessionParticipant = typeof sessionParticipants.$inferSelect;

// Suggestions
export const suggestions = pgTable("suggestions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  city: text("city").notNull().default('NYC'), // 'NYC' | 'Chicago'
  source: text("source").notNull(), // 'Web' | 'Beli' | 'Partiful' | 'Posh.vip'
  kind: text("kind").default('venue'), // 'venue' | 'event'
  rating: text("rating").notNull(),
  turnout: text("turnout").notNull(),
  distance: text("distance").notNull(),
  budget: text("budget").notNull(),
  description: text("description").notNull(),
  tags: text("tags").array().notNull(),
  detailUrl: text("detail_url"), // Optional general more info link
  reservationUrl: text("reservation_url"), // Optional reservation link
  ticketUrl: text("ticket_url"), // Optional ticket purchase link
  eventUrl: text("event_url"), // Optional event page link
  venueName: text("venue_name"), // For events - the venue hosting
  startTime: text("start_time"), // For events - start time
  whyExplanation: text("why_explanation"), // AI-generated personalized reason for this suggestion
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSuggestionSchema = createInsertSchema(suggestions).omit({ id: true, createdAt: true });
export type InsertSuggestion = z.infer<typeof insertSuggestionSchema>;
export type Suggestion = typeof suggestions.$inferSelect;

// Downvote reason enum
export const DownvoteReason = {
  TOO_FAR: 'TOO_FAR',
  TOO_EXPENSIVE: 'TOO_EXPENSIVE',
  BAD_TIMING: 'BAD_TIMING',
  NOT_MY_VIBE: 'NOT_MY_VIBE',
  NOT_MY_TASTE: 'NOT_MY_TASTE',
  DOESNT_FIT_GROUP: 'DOESNT_FIT_GROUP',
  WRONG_NEIGHBORHOOD: 'WRONG_NEIGHBORHOOD',
  OTHER: 'OTHER',
} as const;
export type DownvoteReason = typeof DownvoteReason[keyof typeof DownvoteReason];

// Votes
export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  suggestionId: varchar("suggestion_id").notNull().references(() => suggestions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  voteType: text("vote_type").notNull(), // 'up' | 'down'
  reasons: text("reasons").array(), // Array of DownvoteReason for downvotes
  note: text("note"), // Optional free-text for downvotes
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVoteSchema = createInsertSchema(votes).omit({ id: true, createdAt: true });
export type InsertVote = z.infer<typeof insertVoteSchema>;
export type Vote = typeof votes.$inferSelect;

// Chat messages
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  sender: text("sender").notNull(), // 'user' | 'system' | 'planner-ai' or userId
  senderName: text("sender_name"), // Display name for the sender
  text: text("text").notNull(),
  metadata: jsonb("metadata"), // Optional AI metadata (tokens used, etc.)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text("type").notNull(), // 'INVITE' | 'AVAILABILITY_NUDGE' | 'VOTE_OPEN' | 'PLAN_LOCKED' | 'PLAN_UPDATED'
  title: text("title").notNull(),
  body: text("body").notNull(),
  url: text("url").notNull(), // Deep link path like /session/:id
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, isRead: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Notification types
export const NotificationType = {
  INVITE: 'INVITE',
  AVAILABILITY_NUDGE: 'AVAILABILITY_NUDGE',
  VOTE_OPEN: 'VOTE_OPEN',
  PLAN_LOCKED: 'PLAN_LOCKED',
  PLAN_UPDATED: 'PLAN_UPDATED',
} as const;
export type NotificationType = typeof NotificationType[keyof typeof NotificationType];

// Notification preferences
export const notificationPrefs = pgTable("notification_prefs", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  emailEnabled: boolean("email_enabled").notNull().default(true),
});

export const insertNotificationPrefsSchema = createInsertSchema(notificationPrefs).omit({ id: true });
export type InsertNotificationPrefs = z.infer<typeof insertNotificationPrefsSchema>;
export type NotificationPrefs = typeof notificationPrefs.$inferSelect;

// Proposed times for sessions
export const proposedTimes = pgTable("proposed_times", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  proposedDate: timestamp("proposed_date").notNull(),
  timeStart: text("time_start").notNull(), // "19:00"
  timeEnd: text("time_end").notNull(), // "22:00"
  note: text("note"), // Optional explanation
  votes: text("votes").array().notNull().default(sql`'{}'::text[]`), // User IDs who support this time
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertProposedTimeSchema = createInsertSchema(proposedTimes).omit({ id: true, createdAt: true, votes: true });
export type InsertProposedTime = z.infer<typeof insertProposedTimeSchema>;
export type ProposedTime = typeof proposedTimes.$inferSelect;

// Event feedback - post-event ratings and reviews
export const eventFeedback = pgTable("event_feedback", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  suggestionId: varchar("suggestion_id").references(() => suggestions.id, { onDelete: 'set null' }), // The venue/event that was chosen
  rating: integer("rating").notNull(), // 1-5 star rating
  review: text("review"), // Optional text explanation
  tags: text("tags").array().default(sql`'{}'::text[]`), // Quick feedback tags like 'great_vibe', 'too_crowded', 'perfect_price', etc.
  wouldRecommend: boolean("would_recommend"), // Would recommend to friends
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertEventFeedbackSchema = createInsertSchema(eventFeedback).omit({ id: true, createdAt: true });
export type InsertEventFeedback = z.infer<typeof insertEventFeedbackSchema>;
export type EventFeedback = typeof eventFeedback.$inferSelect;

// Feedback tags for quick selection
export const FeedbackTags = {
  GREAT_VIBE: 'great_vibe',
  TOO_CROWDED: 'too_crowded',
  PERFECT_PRICE: 'perfect_price',
  TOO_EXPENSIVE: 'too_expensive',
  GOOD_SERVICE: 'good_service',
  POOR_SERVICE: 'poor_service',
  GREAT_FOOD: 'great_food',
  DISAPPOINTING_FOOD: 'disappointing_food',
  EASY_TO_FIND: 'easy_to_find',
  HARD_TO_FIND: 'hard_to_find',
  WOULD_RETURN: 'would_return',
  WOULD_NOT_RETURN: 'would_not_return',
} as const;
export type FeedbackTag = typeof FeedbackTags[keyof typeof FeedbackTags];
