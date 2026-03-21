import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { eq, and, isNull, sql } from 'drizzle-orm';
import * as schema from '@shared/schema';
import type {
  User, InsertUser,
  Group, InsertGroup,
  InsertGroupMember,
  Session, InsertSession,
  InsertSessionParticipant,
  Suggestion, InsertSuggestion,
  InsertVote,
  Message, InsertMessage,
  Notification, InsertNotification,
  NotificationPrefs, InsertNotificationPrefs,
  EventFeedback, InsertEventFeedback
} from '@shared/schema';

// Wrap DATABASE_URL to inject search_path for Neon pooled connections
// (PgBouncer ignores search_path in URL options, so we prepend SET on each query via pool event)
const dbSchema = process.env.DB_SCHEMA;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

if (dbSchema) {
  // Fires for every new connection from the pool, including the first
  pool.on('connect', async (client) => {
    await client.query(`SET search_path TO "${dbSchema}"`);
  });
}

export const db = drizzle(pool, { schema });

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByFacebookId(facebookId: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  updateUserLocation(id: string, lat: string, lng: string, permission: string): Promise<User | undefined>;

  // Groups
  getGroup(id: string): Promise<Group | undefined>;
  getGroupByInviteCode(code: string): Promise<Group | undefined>;
  getUserGroups(userId: string): Promise<Array<Group & { members: string[], memberDetails: Array<{id: string, name: string, username: string}> }>>;
  createGroup(group: InsertGroup, inviteCode: string): Promise<Group>;
  addGroupMember(groupId: string, userId: string): Promise<void>;
  getGroupMembers(groupId: string): Promise<string[]>;
  getGroupMemberDetails(groupId: string): Promise<Array<{id: string, name: string, username: string}>>;
  updateGroup(id: string, updates: Partial<InsertGroup>): Promise<Group | undefined>;

  // Sessions
  getSession(id: string): Promise<Session | undefined>;
  getSessionByInviteCode(inviteCode: string): Promise<Session | undefined>;
  getGroupSessions(groupId: string): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, updates: Partial<InsertSession>): Promise<Session | undefined>;
  softDeleteSession(id: string): Promise<void>;
  leaveSession(sessionId: string, userId: string): Promise<void>;
  addSessionParticipant(sessionId: string, userId: string, status?: string): Promise<void>;
  getSessionParticipants(sessionId: string): Promise<Array<{ userId: string; status: string; startingNeighborhood?: string | null }>>;
  updateParticipantStatus(sessionId: string, userId: string, status: string): Promise<void>;
  updateParticipantNeighborhood(sessionId: string, userId: string, neighborhood: string): Promise<void>;

  // Suggestions
  getSuggestion(id: string): Promise<Suggestion | undefined>;
  getSessionSuggestions(sessionId: string): Promise<Suggestion[]>;
  createSuggestion(suggestion: InsertSuggestion): Promise<Suggestion>;
  updateSuggestion(id: string, updates: Partial<InsertSuggestion>): Promise<Suggestion | undefined>;
  deleteSuggestion(id: string): Promise<void>;
  deleteSessionSuggestions(sessionId: string): Promise<void>;

  // Votes
  vote(suggestionId: string, userId: string, voteType: 'up' | 'down', reasons?: string[], note?: string): Promise<void>;
  getSuggestionVotes(suggestionId: string): Promise<Array<{ userId: string; voteType: string; reasons?: string[] | null; note?: string | null }>>;
  clearUserVotes(sessionId: string, userId: string): Promise<void>;

  // Messages
  getSessionMessages(sessionId: string): Promise<Message[]>;
  getRecentPlannerMessages(sessionId: string, limit?: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  // Planner context
  getSessionWithContext(sessionId: string): Promise<{
    session: Session;
    participants: Array<{ 
      id: string; 
      userId: string;
      name: string; 
      preferences: { 
        budget: string[]; 
        energy: string; 
        categories: string[];
        hardNos?: string[];
        discoveryStyle?: string | null;
        crowdPreference?: string | null;
        favoriteNeighborhoods?: string[] | null;
      } 
    }>;
    suggestions: Suggestion[];
    recentMessages: Message[];
  } | undefined>;

  // Notifications
  getUserNotifications(userId: string): Promise<Notification[]>;
  getUnreadCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markAsRead(id: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
  getNotificationPrefs(userId: string): Promise<NotificationPrefs | undefined>;
  upsertNotificationPrefs(userId: string, emailEnabled: boolean): Promise<NotificationPrefs>;
  getRecentNudge(userId: string, sessionId: string): Promise<Notification | undefined>;

  // Event Feedback
  getSessionFeedback(sessionId: string): Promise<EventFeedback[]>;
  getUserFeedback(userId: string): Promise<EventFeedback[]>;
  getUserFeedbackWithVenues(userId: string): Promise<Array<{
    rating: number;
    review: string | null;
    tags: string[] | null;
    venueName: string;
    createdAt: Date;
  }>>;
  createFeedback(data: InsertEventFeedback): Promise<EventFeedback>;
  hasUserSubmittedFeedback(sessionId: string, userId: string): Promise<boolean>;
  getVenueAverageRating(suggestionName: string): Promise<{ avgRating: number; count: number } | null>;
}

export class DbStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return user;
  }

  async getUserByFacebookId(facebookId: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.facebookId, facebookId));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(schema.users).values(user).returning();
    return newUser;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(schema.users).set(updates).where(eq(schema.users.id, id)).returning();
    return updated;
  }

  async updateUserLocation(id: string, lat: string, lng: string, permission: string): Promise<User | undefined> {
    const [updated] = await db.update(schema.users)
      .set({
        lastKnownLat: lat,
        lastKnownLng: lng,
        lastLocationTimestamp: new Date(),
        locationPermission: permission
      })
      .where(eq(schema.users.id, id))
      .returning();
    return updated;
  }

  // Groups
  async getGroup(id: string): Promise<Group | undefined> {
    const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, id));
    return group;
  }

  async getGroupByInviteCode(code: string): Promise<Group | undefined> {
    const [group] = await db.select().from(schema.groups).where(eq(schema.groups.inviteCode, code));
    return group;
  }

  async getUserGroups(userId: string): Promise<Array<Group & { members: string[], memberDetails: Array<{id: string, name: string, username: string}> }>> {
    const groupMemberships = await db
      .select()
      .from(schema.groupMembers)
      .where(eq(schema.groupMembers.userId, userId));

    const groups = await Promise.all(
      groupMemberships.map(async (membership) => {
        const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, membership.groupId));
        const members = await this.getGroupMembers(membership.groupId);
        const memberDetails = await this.getGroupMemberDetails(membership.groupId);
        return { ...group, members, memberDetails };
      })
    );

    return groups.filter(g => g.id) as Array<Group & { members: string[], memberDetails: Array<{id: string, name: string, username: string}> }>;
  }

  async createGroup(group: InsertGroup, inviteCode: string): Promise<Group> {
    const [newGroup] = await db.insert(schema.groups).values({ ...group, inviteCode }).returning();
    await this.addGroupMember(newGroup.id, group.adminId);
    return newGroup;
  }

  async addGroupMember(groupId: string, userId: string): Promise<void> {
    await db.insert(schema.groupMembers)
      .values({ groupId, userId })
      .onConflictDoNothing();
  }

  async getGroupMembers(groupId: string): Promise<string[]> {
    const members = await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId));
    // Deduplicate member IDs in case of duplicate entries
    return [...new Set(members.map(m => m.userId))];
  }

  async getGroupMemberDetails(groupId: string): Promise<Array<{id: string, name: string, username: string}>> {
    const memberIds = await this.getGroupMembers(groupId);
    const details = await Promise.all(
      memberIds.map(async (id) => {
        const user = await this.getUser(id);
        return user ? { id: user.id, name: user.name, username: user.username } : null;
      })
    );
    return details.filter((d): d is {id: string, name: string, username: string} => d !== null);
  }

  async updateGroup(id: string, updates: Partial<InsertGroup>): Promise<Group | undefined> {
    const [updated] = await db.update(schema.groups).set(updates).where(eq(schema.groups.id, id)).returning();
    return updated;
  }

  // Sessions
  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id));
    return session;
  }

  async getSessionByInviteCode(inviteCode: string): Promise<Session | undefined> {
    const [session] = await db.select().from(schema.sessions).where(
      and(
        eq(schema.sessions.inviteCode, inviteCode),
        isNull(schema.sessions.deletedAt)
      )
    );
    return session;
  }

  async getGroupSessions(groupId: string): Promise<Session[]> {
    return db.select().from(schema.sessions).where(
      and(
        eq(schema.sessions.groupId, groupId),
        isNull(schema.sessions.deletedAt)
      )
    );
  }

  async createSession(session: InsertSession): Promise<Session> {
    const [newSession] = await db.insert(schema.sessions).values(session).returning();
    return newSession;
  }

  async updateSession(id: string, updates: Partial<InsertSession>): Promise<Session | undefined> {
    const [updated] = await db.update(schema.sessions).set(updates).where(eq(schema.sessions.id, id)).returning();
    return updated;
  }

  async softDeleteSession(id: string): Promise<void> {
    await db.update(schema.sessions)
      .set({ deletedAt: new Date() })
      .where(eq(schema.sessions.id, id));
  }

  async leaveSession(sessionId: string, userId: string): Promise<void> {
    // Update participant status to 'left'
    await this.updateParticipantStatus(sessionId, userId, 'left');
    
    // Clear all votes from this user for this session's suggestions
    await this.clearUserVotes(sessionId, userId);
  }

  async addSessionParticipant(sessionId: string, userId: string, status: string = 'active'): Promise<void> {
    await db.insert(schema.sessionParticipants)
      .values({ sessionId, userId, status })
      .onConflictDoNothing();
  }

  async getSessionParticipants(sessionId: string): Promise<Array<{ userId: string; status: string; startingNeighborhood?: string | null }>> {
    const participants = await db.select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.sessionId, sessionId));
    const uniqueParticipants = new Map<string, { status: string; startingNeighborhood: string | null }>();
    participants.forEach(p => {
      uniqueParticipants.set(p.userId, { status: p.status, startingNeighborhood: p.startingNeighborhood });
    });
    return Array.from(uniqueParticipants.entries()).map(([userId, data]) => ({ userId, status: data.status, startingNeighborhood: data.startingNeighborhood }));
  }

  async updateParticipantStatus(sessionId: string, userId: string, status: string): Promise<void> {
    await db.update(schema.sessionParticipants)
      .set({ status })
      .where(and(
        eq(schema.sessionParticipants.sessionId, sessionId),
        eq(schema.sessionParticipants.userId, userId)
      ));
  }

  async updateParticipantNeighborhood(sessionId: string, userId: string, neighborhood: string): Promise<void> {
    await db.update(schema.sessionParticipants)
      .set({ startingNeighborhood: neighborhood })
      .where(and(
        eq(schema.sessionParticipants.sessionId, sessionId),
        eq(schema.sessionParticipants.userId, userId)
      ));
  }

  // Suggestions
  async getSuggestion(id: string): Promise<Suggestion | undefined> {
    const [suggestion] = await db.select().from(schema.suggestions).where(eq(schema.suggestions.id, id));
    return suggestion;
  }

  async getSessionSuggestions(sessionId: string): Promise<Suggestion[]> {
    return db.select().from(schema.suggestions).where(eq(schema.suggestions.sessionId, sessionId));
  }

  async createSuggestion(suggestion: InsertSuggestion): Promise<Suggestion> {
    // Check for duplicate by name in the same session
    const existing = await db.select().from(schema.suggestions)
      .where(and(
        eq(schema.suggestions.sessionId, suggestion.sessionId),
        eq(schema.suggestions.name, suggestion.name)
      ));
    
    if (existing.length > 0) {
      // Return existing suggestion instead of creating duplicate
      return existing[0];
    }
    
    const [newSuggestion] = await db.insert(schema.suggestions).values(suggestion).returning();
    return newSuggestion;
  }

  async updateSuggestion(id: string, updates: Partial<InsertSuggestion>): Promise<Suggestion | undefined> {
    const [updated] = await db.update(schema.suggestions).set(updates).where(eq(schema.suggestions.id, id)).returning();
    return updated;
  }

  async deleteSuggestion(id: string): Promise<void> {
    await db.delete(schema.suggestions).where(eq(schema.suggestions.id, id));
  }

  async deleteSessionSuggestions(sessionId: string): Promise<void> {
    await db.delete(schema.suggestions).where(eq(schema.suggestions.sessionId, sessionId));
  }

  // Votes
  async vote(suggestionId: string, userId: string, voteType: 'up' | 'down', reasons?: string[], note?: string): Promise<void> {
    // Delete existing vote
    await db.delete(schema.votes).where(
      and(
        eq(schema.votes.suggestionId, suggestionId),
        eq(schema.votes.userId, userId)
      )
    );
    // Insert new vote
    await db.insert(schema.votes).values({ 
      suggestionId, 
      userId, 
      voteType,
      reasons: reasons || null,
      note: note || null
    });
  }

  async getSuggestionVotes(suggestionId: string): Promise<Array<{ userId: string; voteType: string; reasons?: string[] | null; note?: string | null }>> {
    const votes = await db.select().from(schema.votes).where(eq(schema.votes.suggestionId, suggestionId));
    return votes.map(v => ({ userId: v.userId, voteType: v.voteType, reasons: v.reasons, note: v.note }));
  }

  async clearUserVotes(sessionId: string, userId: string): Promise<void> {
    // Get all suggestions for this session
    const suggestions = await this.getSessionSuggestions(sessionId);
    const suggestionIds = suggestions.map(s => s.id);
    
    // Delete all votes from this user for these suggestions
    for (const suggestionId of suggestionIds) {
      await db.delete(schema.votes).where(
        and(
          eq(schema.votes.suggestionId, suggestionId),
          eq(schema.votes.userId, userId)
        )
      );
    }
  }

  // Messages
  async getSessionMessages(sessionId: string): Promise<Message[]> {
    return db.select().from(schema.messages).where(eq(schema.messages.sessionId, sessionId));
  }

  async getRecentPlannerMessages(sessionId: string, limit: number = 20): Promise<Message[]> {
    const allMessages = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.sessionId, sessionId));
    
    // Filter to only planner-relevant messages and get last N
    const plannerMessages = allMessages
      .filter(m => m.sender === 'planner-ai' || (m.sender !== 'system'))
      .slice(-limit);
    
    return plannerMessages;
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(schema.messages).values(message).returning();
    return newMessage;
  }

  async getSessionWithContext(sessionId: string): Promise<{
    session: Session;
    participants: Array<{ 
      id: string; 
      userId: string;
      name: string; 
      preferences: { 
        budget: string[]; 
        energy: string; 
        categories: string[];
        hardNos?: string[];
        discoveryStyle?: string | null;
        crowdPreference?: string | null;
        favoriteNeighborhoods?: string[] | null;
      } 
    }>;
    suggestions: Suggestion[];
    recentMessages: Message[];
  } | undefined> {
    const session = await this.getSession(sessionId);
    if (!session) return undefined;
    
    // Get participants with their user data
    const participantRecords = await this.getSessionParticipants(sessionId);
    const activeParticipants = participantRecords.filter(p => p.status !== 'left');
    
    const participants = await Promise.all(
      activeParticipants.map(async (p) => {
        const user = await this.getUser(p.userId);
        if (!user) return null;
        return {
          id: user.id,
          userId: user.id,
          name: user.name,
          preferences: {
            budget: user.budget,
            energy: user.energy,
            categories: user.categories,
            hardNos: user.hardNos || [],
            discoveryStyle: user.discoveryStyle,
            crowdPreference: user.crowdPreference,
            favoriteNeighborhoods: user.favoriteNeighborhoods,
          }
        };
      })
    );
    
    const validParticipants = participants.filter((p): p is NonNullable<typeof p> => p !== null);
    
    // Get suggestions
    const suggestions = await this.getSessionSuggestions(sessionId);
    
    // Get recent messages for conversation context
    const recentMessages = await this.getRecentPlannerMessages(sessionId, 15);
    
    return {
      session,
      participants: validParticipants,
      suggestions,
      recentMessages
    };
  }

  // Notifications
  async getUserNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(sql`${schema.notifications.createdAt} DESC`);
  }

  async getUnreadCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.isRead, false)
      ));
    return Number(result[0]?.count || 0);
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(schema.notifications).values(notification).returning();
    return newNotification;
  }

  async markAsRead(id: string): Promise<void> {
    await db.update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.id, id));
  }

  async markAllAsRead(userId: string): Promise<void> {
    await db.update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.userId, userId));
  }

  async getNotificationPrefs(userId: string): Promise<NotificationPrefs | undefined> {
    const [prefs] = await db.select().from(schema.notificationPrefs)
      .where(eq(schema.notificationPrefs.userId, userId));
    return prefs;
  }

  async upsertNotificationPrefs(userId: string, emailEnabled: boolean): Promise<NotificationPrefs> {
    const existing = await this.getNotificationPrefs(userId);
    if (existing) {
      const [updated] = await db.update(schema.notificationPrefs)
        .set({ emailEnabled })
        .where(eq(schema.notificationPrefs.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.notificationPrefs)
        .values({ userId, emailEnabled })
        .returning();
      return created;
    }
  }

  async getRecentNudge(userId: string, sessionId: string): Promise<Notification | undefined> {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const [nudge] = await db.select().from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.type, 'AVAILABILITY_NUDGE'),
        sql`${schema.notifications.url} LIKE ${`%${sessionId}%`}`,
        sql`${schema.notifications.createdAt} > ${twelveHoursAgo}`
      ));
    return nudge;
  }

  // Event Feedback
  async getSessionFeedback(sessionId: string): Promise<EventFeedback[]> {
    const feedback = await db.select().from(schema.eventFeedback)
      .where(eq(schema.eventFeedback.sessionId, sessionId))
      .orderBy(schema.eventFeedback.createdAt);
    return feedback;
  }

  async getUserFeedback(userId: string): Promise<EventFeedback[]> {
    const feedback = await db.select().from(schema.eventFeedback)
      .where(eq(schema.eventFeedback.userId, userId))
      .orderBy(schema.eventFeedback.createdAt);
    return feedback;
  }

  async getUserFeedbackWithVenues(userId: string): Promise<Array<{
    rating: number;
    review: string | null;
    tags: string[] | null;
    venueName: string;
    createdAt: Date;
  }>> {
    const results = await db.select({
      rating: schema.eventFeedback.rating,
      review: schema.eventFeedback.review,
      tags: schema.eventFeedback.tags,
      venueName: schema.suggestions.name,
      createdAt: schema.eventFeedback.createdAt,
    }).from(schema.eventFeedback)
      .innerJoin(schema.suggestions, eq(schema.eventFeedback.suggestionId, schema.suggestions.id))
      .where(eq(schema.eventFeedback.userId, userId))
      .orderBy(schema.eventFeedback.createdAt)
      .limit(20); // Last 20 reviews for context
    
    return results;
  }

  async createFeedback(data: InsertEventFeedback): Promise<EventFeedback> {
    const [created] = await db.insert(schema.eventFeedback).values(data).returning();
    return created;
  }

  async hasUserSubmittedFeedback(sessionId: string, userId: string): Promise<boolean> {
    const [existing] = await db.select().from(schema.eventFeedback)
      .where(and(
        eq(schema.eventFeedback.sessionId, sessionId),
        eq(schema.eventFeedback.userId, userId)
      ));
    return !!existing;
  }

  async getVenueAverageRating(suggestionName: string): Promise<{ avgRating: number; count: number } | null> {
    // Get all feedback for suggestions with matching names (via join)
    const results = await db.select({
      rating: schema.eventFeedback.rating,
    }).from(schema.eventFeedback)
      .innerJoin(schema.suggestions, eq(schema.eventFeedback.suggestionId, schema.suggestions.id))
      .where(eq(schema.suggestions.name, suggestionName));
    
    if (results.length === 0) return null;
    
    const sum = results.reduce((acc, r) => acc + r.rating, 0);
    return { avgRating: sum / results.length, count: results.length };
  }
}

export const storage = new DbStorage();
