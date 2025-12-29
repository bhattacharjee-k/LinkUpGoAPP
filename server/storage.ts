import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { eq, and, isNull } from 'drizzle-orm';
import * as schema from '@shared/schema';
import type {
  User, InsertUser,
  Group, InsertGroup,
  InsertGroupMember,
  Session, InsertSession,
  InsertSessionParticipant,
  Suggestion, InsertSuggestion,
  InsertVote,
  Message, InsertMessage
} from '@shared/schema';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  updateUserLocation(id: string, lat: string, lng: string, permission: string): Promise<User | undefined>;

  // Groups
  getGroup(id: string): Promise<Group | undefined>;
  getGroupByInviteCode(code: string): Promise<Group | undefined>;
  getUserGroups(userId: string): Promise<Array<Group & { members: string[] }>>;
  createGroup(group: InsertGroup, inviteCode: string): Promise<Group>;
  addGroupMember(groupId: string, userId: string): Promise<void>;
  getGroupMembers(groupId: string): Promise<string[]>;
  updateGroup(id: string, updates: Partial<InsertGroup>): Promise<Group | undefined>;

  // Sessions
  getSession(id: string): Promise<Session | undefined>;
  getGroupSessions(groupId: string): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, updates: Partial<InsertSession>): Promise<Session | undefined>;
  softDeleteSession(id: string): Promise<void>;
  leaveSession(sessionId: string, userId: string): Promise<void>;
  addSessionParticipant(sessionId: string, userId: string, status?: string): Promise<void>;
  getSessionParticipants(sessionId: string): Promise<Array<{ userId: string; status: string }>>;
  updateParticipantStatus(sessionId: string, userId: string, status: string): Promise<void>;

  // Suggestions
  getSuggestion(id: string): Promise<Suggestion | undefined>;
  getSessionSuggestions(sessionId: string): Promise<Suggestion[]>;
  createSuggestion(suggestion: InsertSuggestion): Promise<Suggestion>;
  deleteSessionSuggestions(sessionId: string): Promise<void>;

  // Votes
  vote(suggestionId: string, userId: string, voteType: string): Promise<void>;
  getSuggestionVotes(suggestionId: string): Promise<Array<{ userId: string; vote: string }>>;
  clearUserVotes(sessionId: string, userId: string): Promise<void>;

  // Messages
  getSessionMessages(sessionId: string): Promise<Message[]>;
  getRecentPlannerMessages(sessionId: string, limit?: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  
  // Planner context
  getSessionWithContext(sessionId: string): Promise<{
    session: Session;
    participants: Array<{ id: string; name: string; preferences: { budget: string[]; energy: string; categories: string[] } }>;
    suggestions: Suggestion[];
    recentMessages: Message[];
  } | undefined>;
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

  async getUserGroups(userId: string): Promise<Array<Group & { members: string[] }>> {
    const groupMemberships = await db
      .select()
      .from(schema.groupMembers)
      .where(eq(schema.groupMembers.userId, userId));

    const groups = await Promise.all(
      groupMemberships.map(async (membership) => {
        const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, membership.groupId));
        const members = await this.getGroupMembers(membership.groupId);
        return { ...group, members };
      })
    );

    return groups.filter(g => g.id) as Array<Group & { members: string[] }>;
  }

  async createGroup(group: InsertGroup, inviteCode: string): Promise<Group> {
    const [newGroup] = await db.insert(schema.groups).values({ ...group, inviteCode }).returning();
    await this.addGroupMember(newGroup.id, group.adminId);
    return newGroup;
  }

  async addGroupMember(groupId: string, userId: string): Promise<void> {
    await db.insert(schema.groupMembers).values({ groupId, userId });
  }

  async getGroupMembers(groupId: string): Promise<string[]> {
    const members = await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId));
    return members.map(m => m.userId);
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
    await db.insert(schema.sessionParticipants).values({ sessionId, userId, status });
  }

  async getSessionParticipants(sessionId: string): Promise<Array<{ userId: string; status: string }>> {
    const participants = await db.select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.sessionId, sessionId));
    return participants.map(p => ({ userId: p.userId, status: p.status }));
  }

  async updateParticipantStatus(sessionId: string, userId: string, status: string): Promise<void> {
    await db.update(schema.sessionParticipants)
      .set({ status })
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
    const [newSuggestion] = await db.insert(schema.suggestions).values(suggestion).returning();
    return newSuggestion;
  }

  async deleteSessionSuggestions(sessionId: string): Promise<void> {
    await db.delete(schema.suggestions).where(eq(schema.suggestions.sessionId, sessionId));
  }

  // Votes
  async vote(suggestionId: string, userId: string, voteType: string): Promise<void> {
    // Delete existing vote
    await db.delete(schema.votes).where(
      and(
        eq(schema.votes.suggestionId, suggestionId),
        eq(schema.votes.userId, userId)
      )
    );
    // Insert new vote
    await db.insert(schema.votes).values({ suggestionId, userId, vote: voteType });
  }

  async getSuggestionVotes(suggestionId: string): Promise<Array<{ userId: string; vote: string }>> {
    const votes = await db.select().from(schema.votes).where(eq(schema.votes.suggestionId, suggestionId));
    return votes.map(v => ({ userId: v.userId, vote: v.vote }));
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
    participants: Array<{ id: string; name: string; preferences: { budget: string[]; energy: string; categories: string[] } }>;
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
          name: user.name,
          preferences: {
            budget: user.budget,
            energy: user.energy,
            categories: user.categories
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
}

export const storage = new DbStorage();
