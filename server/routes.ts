import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertUserSchema, insertGroupSchema, insertSessionSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSuggestions, getOrchestratedSuggestions, SuggestionOption, generateWhyExplanation, GroupPreferenceSummary } from "./suggestions";
import { notifyPlanJoined, notifyPlanLocked } from "./notifications";
import { requireAuth, requireGroupAdmin, requireGroupMember, requireSessionParticipant, requireSessionNotLocked } from "./middleware/auth";
import { asyncHandler, NotFoundError, ValidationError, ForbiddenError } from "./middleware/error-handler";
import { LoginRequestSchema, RegisterRequestSchema, SuggestRequestSchema, CreateGroupRequestSchema, VoteRequestSchema, CreateMessageRequestSchema } from "@shared/api-schemas";
import { logger } from "./logger";

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxAttempts: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = rateLimitStore.get(ip);
    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= maxAttempts) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message: `Too many attempts. Try again in ${retryAfter} seconds.` });
    }
    entry.count++;
    return next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 60_000);

// Store WebSocket connections by session ID
const sessionConnections: Map<string, Set<WebSocket>> = new Map();
// Track which session each socket is currently in
const socketToSession: Map<WebSocket, string> = new Map();

export function broadcastToSession(sessionId: string, message: any) {
  const connections = sessionConnections.get(sessionId);
  if (connections) {
    const messageStr = JSON.stringify(message);
    connections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    });
  }
}

function removeSocketFromSession(ws: WebSocket) {
  const prevSessionId = socketToSession.get(ws);
  if (prevSessionId) {
    const connections = sessionConnections.get(prevSessionId);
    if (connections) {
      connections.delete(ws);
      if (connections.size === 0) {
        sessionConnections.delete(prevSessionId);
      }
    }
    socketToSession.delete(ws);
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up WebSocket server for real-time messaging
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws, req) => {
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'join' && msg.sessionId) {
          // Remove from previous session before joining new one
          removeSocketFromSession(ws);
          
          const sessionId = msg.sessionId;
          if (!sessionConnections.has(sessionId)) {
            sessionConnections.set(sessionId, new Set());
          }
          sessionConnections.get(sessionId)!.add(ws);
          socketToSession.set(ws, sessionId);
        } else if (msg.type === 'leave') {
          // Explicitly leave current session
          removeSocketFromSession(ws);
        }
      } catch (e) {
        // Ignore malformed messages
      }
    });
    
    ws.on('close', () => {
      removeSocketFromSession(ws);
    });
  });
  
  // Auth routes
  app.post("/api/auth/register", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    try {
      // Map frontend camelCase to database snake_case
      const { hardNos, ...rest } = req.body;
      const mappedData = {
        ...rest,
        hardNos: hardNos || [],
      };
      
      const data = insertUserSchema.parse(mappedData);
      const hashedPassword = await bcrypt.hash(data.password, 10);
      
      const user = await storage.createUser({
        ...data,
        password: hashedPassword
      });
      
      // @ts-ignore - session is added by express-session
      req.session.userId = user.id;
      
      // Map back to camelCase for frontend
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/login", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);
      
      if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // @ts-ignore
      req.session.userId = user.id;
      
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    // @ts-ignore
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  });

  app.get("/api/auth/username-available", async (req, res) => {
    try {
      const schema = z.object({
        username: z.string().min(1)
      });
      
      const { username } = schema.parse(req.query);
      const existingUser = await storage.getUserByUsername(username);
      
      res.json({ available: !existingUser });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Places autocomplete for reference venues
  app.post("/api/places/autocomplete", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { query, city } = req.body;
    
    if (!query || query.length < 2) {
      return res.json({ places: [] });
    }

    const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
    if (!GOOGLE_PLACES_API_KEY) {
      return res.json({ places: [] });
    }

    const cityBias: Record<string, { lat: number; lng: number }> = {
      'NYC': { lat: 40.7128, lng: -73.9352 },
      'Chicago': { lat: 41.8781, lng: -87.6298 },
    };
    const center = cityBias[city] || cityBias['NYC'];

    try {
      const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
        },
        body: JSON.stringify({
          textQuery: query,
          locationBias: {
            circle: {
              center: { latitude: center.lat, longitude: center.lng },
              radius: 50000,
            },
          },
          maxResultCount: 5,
        }),
      });

      if (!response.ok) {
        return res.json({ places: [] });
      }

      const data = await response.json();
      const places = (data.places || []).map((p: any) => ({
        placeId: p.id,
        name: p.displayName?.text || 'Unknown',
        address: p.formattedAddress || '',
        lat: p.location?.latitude || 0,
        lng: p.location?.longitude || 0,
      }));

      res.json({ places });
    } catch (error) {
      console.error('Places autocomplete error:', error);
      res.json({ places: [] });
    }
  }));

  app.post("/api/suggest", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const data = SuggestRequestSchema.parse(req.body);
    
    // @ts-ignore
    const userId = req.session?.userId;
    const user = userId ? await storage.getUser(userId) : null;
    const enrichedData = {
      ...data,
      discoveryStyle: data.discoveryStyle || user?.discoveryStyle as 'hidden_gems' | 'popular' | 'mixed' | undefined,
      crowdPreference: data.crowdPreference || user?.crowdPreference as 'quiet' | 'buzzing' | 'no_preference' | undefined,
      favoriteNeighborhoods: data.favoriteNeighborhoods || user?.favoriteNeighborhoods || undefined,
    };

    const groupPrefs: GroupPreferenceSummary = {
      memberCount: 1,
      categories: enrichedData.categories || [],
      commonCategories: enrichedData.categories || [],
      budget: enrichedData.budget || '$$',
      energy: enrichedData.energy || 'Vibey',
      crowdPreference: enrichedData.crowdPreference,
      discoveryStyle: enrichedData.discoveryStyle,
      favoriteNeighborhoods: enrichedData.favoriteNeighborhoods,
    };

    const result = await getOrchestratedSuggestions(
      enrichedData, undefined, data.referenceVenues, groupPrefs
    );

    const sourceMap: Record<string, string> = {
      'Google': 'Web',
      'Ticketmaster': 'Web',
    };

    const suggestions = result.options.map(opt => {
      const whyExplanation = opt.whyExplanation || generateWhyExplanation(opt, groupPrefs);
      const suggestion: Record<string, any> = {
        name: opt.title,
        city: data.city,
        source: sourceMap[opt.source] || 'Web',
        kind: opt.optionType === 'event' ? 'event' : 'venue',
        rating: opt.rating || '4.5',
        turnout: '0/0',
        distance: opt.distance || '1.0 mi',
        budget: opt.priceLevel || '$$',
        description: opt.description || `A great spot in ${data.city}`,
        tags: opt.tags || [],
        whyExplanation,
      };
      if (opt.detailUrl) suggestion.detailUrl = opt.detailUrl;
      if (opt.reservationUrl) suggestion.reservationUrl = opt.reservationUrl;
      if (opt.ticketUrl) suggestion.ticketUrl = opt.ticketUrl;
      if (opt.eventUrl) suggestion.eventUrl = opt.eventUrl;
      if (opt.venueName) suggestion.venueName = opt.venueName;
      if (opt.startTime) suggestion.startTime = opt.startTime;
      return suggestion;
    });

    res.json({ suggestions, meta: result.meta });
  }));

  // User routes
  app.patch("/api/users/me", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const updates = req.body;
      const user = await storage.updateUser(userId, updates);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/users/me/location", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { lat, lng, permission } = req.body;
      
      if (!lat || !lng || !permission) {
        return res.status(400).json({ message: "Missing required fields: lat, lng, permission" });
      }
      
      const user = await storage.updateUserLocation(userId, lat, lng, permission);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Group routes
  app.get("/api/groups", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const groups = await storage.getUserGroups(userId);
      res.json(groups);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/groups", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const { name } = CreateGroupRequestSchema.parse(req.body);
    const inviteCode = generateInviteCode();
    
    const group = await storage.createGroup({
      name,
      adminId: req.userId!,
      locked: false
    }, inviteCode);
    
    const members = await storage.getGroupMembers(group.id);
    res.json({ ...group, members });
  }));

  app.get("/api/groups/:id", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const group = await storage.getGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      const members = await storage.getGroupMembers(group.id);
      res.json({ ...group, members });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/groups/:id", requireAuth, requireGroupAdmin, asyncHandler(async (req: Request, res: Response) => {
    const updated = await storage.updateGroup(req.params.id, req.body);
    const members = await storage.getGroupMembers(req.params.id);
    res.json({ ...updated, members });
  }));

  app.post("/api/groups/:id/members", requireAuth, requireGroupAdmin, asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.body;
    if (!memberId) {
      throw new ValidationError("memberId is required");
    }
    
    const member = await storage.getUser(memberId);
    if (!member) {
      throw new NotFoundError("User");
    }
    
    const group = await storage.getGroup(req.params.id);
    await storage.addGroupMember(group!.id, memberId);
    
    const members = await storage.getGroupMembers(group!.id);
    res.json({ ...group, members });
  }));

  app.post("/api/groups/join/:inviteCode", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const group = await storage.getGroupByInviteCode(req.params.inviteCode);
      if (!group) {
        return res.status(404).json({ message: "Invalid invite code" });
      }
      
      if (group.locked) {
        return res.status(403).json({ message: "Group is locked" });
      }
      
      await storage.addGroupMember(group.id, userId);
      
      // Also add user to all active sessions of this group
      const sessions = await storage.getGroupSessions(group.id);
      for (const session of sessions) {
        // Only add to active (non-locked, non-deleted) sessions
        if (session.status !== 'locked' && !session.deletedAt) {
          try {
            await storage.addSessionParticipant(session.id, userId, 'active');
          } catch (e) {
            // Ignore if already a participant
          }
        }
      }
      
      const members = await storage.getGroupMembers(group.id);
      res.json({ ...group, members });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Join a session directly via session invite code
  app.post("/api/sessions/join/:inviteCode", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      console.log(`[Join] Looking up session with inviteCode=${req.params.inviteCode} for userId=${userId}`);
      const session = await storage.getSessionByInviteCode(req.params.inviteCode);
      if (!session) {
        console.log(`[Join] No session found for inviteCode=${req.params.inviteCode}`);
        return res.status(404).json({ message: "Invalid session invite code" });
      }
      
      console.log(`[Join] Found session id=${session.id} status=${session.status} inviteCode=${session.inviteCode}`);
      
      if (session.deletedAt) {
        console.log(`[Join] Session ${session.id} is deleted`);
        return res.status(404).json({ message: "This plan no longer exists" });
      }
      
      if (session.status === 'locked' || session.status === 'archived' || session.status === 'completed') {
        return res.status(403).json({ message: "This plan is no longer accepting new participants" });
      }
      
      // First add user to the group if not already a member
      const group = await storage.getGroup(session.groupId);
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      const members = await storage.getGroupMembers(group.id);
      if (!members.includes(userId)) {
        if (group.locked) {
          return res.status(403).json({ message: "Group is locked" });
        }
        await storage.addGroupMember(group.id, userId);
      }
      
      // Add user to the session as participant
      try {
        await storage.addSessionParticipant(session.id, userId, 'active');
        
        // Send notifications asynchronously
        const user = await storage.getUser(userId);
        notifyPlanJoined({
          sessionId: session.id,
          sessionName: session.name || 'the plan',
          joinerId: userId,
          joinerName: user?.name || 'Someone',
          adminId: group.adminId,
        }).catch(err => console.error('[Notify] Error sending join notification:', err));
      } catch (e) {
        // Ignore if already a participant
      }
      
      res.json({ session, group: { ...group, members: await storage.getGroupMembers(group.id) } });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Session routes
  app.get("/api/sessions", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const groups = await storage.getUserGroups(userId);
      const allSessions = await Promise.all(
        groups.map(g => storage.getGroupSessions(g.id))
      );
      
      // Enrich each session with participants, suggestions, and messages
      const enrichedSessions = await Promise.all(
        allSessions.flat().map(async (session) => {
          const participants = await storage.getSessionParticipants(session.id);
          const suggestions = await storage.getSessionSuggestions(session.id);
          const messages = await storage.getSessionMessages(session.id);
          
          // Get participant details (names)
          const participantDetails = await Promise.all(
            participants.map(async (p) => {
              const user = await storage.getUser(p.userId);
              return { id: p.userId, name: user?.name || user?.username || 'Unknown', status: p.status };
            })
          );
          
          const suggestionsWithVotes = await Promise.all(
            suggestions.map(async (s) => {
              const votes = await storage.getSuggestionVotes(s.id);
              const votesRecord: Record<string, { voteType: string; reasons?: string[] | null; note?: string | null }> = {};
              votes.forEach(v => {
                votesRecord[v.userId] = { voteType: v.voteType, reasons: v.reasons, note: v.note };
              });
              return { ...s, votes: votesRecord };
            })
          );
          
          return {
            ...session,
            participants: participants.map(p => p.userId),
            participantDetails,
            participantStatusByUserId: participants.reduce((acc, p) => {
              acc[p.userId] = p.status;
              return acc;
            }, {} as Record<string, string>),
            suggestions: suggestionsWithVotes,
            messages
          };
        })
      );
      
      res.json(enrichedSessions);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/sessions", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { groupId, name, filters, guardrails, referenceVenues } = req.body;
      
      const inviteCode = filters?.inviteCode || Math.random().toString(36).substr(2, 6).toUpperCase();
      console.log(`[Session] Creating session for group ${groupId} with inviteCode=${inviteCode}`);
      
      const session = await storage.createSession({
        groupId,
        name,
        status: 'draft',
        inviteCode,
        filters,
        guardrails,
        referenceVenues: referenceVenues || null
      });
      
      console.log(`[Session] Created session id=${session.id} inviteCode=${session.inviteCode}`);
      
      // Add all group members as participants (including creator)
      const groupMembers = await storage.getGroupMembers(groupId);
      for (const memberId of groupMembers) {
        try {
          await storage.addSessionParticipant(session.id, memberId, 'active');
        } catch (e) {
          // Ignore if already a participant
        }
      }
      
      res.json(session);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      const participants = await storage.getSessionParticipants(session.id);
      const suggestions = await storage.getSessionSuggestions(session.id);
      const messages = await storage.getSessionMessages(session.id);
      
      // Get participant details (names)
      const participantDetails = await Promise.all(
        participants.map(async (p) => {
          const user = await storage.getUser(p.userId);
          return { id: p.userId, name: user?.name || user?.username || 'Unknown', status: p.status };
        })
      );
      
      // Get votes for each suggestion
      const suggestionsWithVotes = await Promise.all(
        suggestions.map(async (s) => {
          const votes = await storage.getSuggestionVotes(s.id);
          const votesRecord: Record<string, { voteType: string; reasons?: string[] | null; note?: string | null }> = {};
          votes.forEach(v => {
            votesRecord[v.userId] = { voteType: v.voteType, reasons: v.reasons, note: v.note };
          });
          return { ...s, votes: votesRecord };
        })
      );
      
      res.json({
        ...session,
        participants: participants.map(p => p.userId),
        participantDetails,
        participantStatusByUserId: participants.reduce((acc, p) => {
          acc[p.userId] = p.status;
          return acc;
        }, {} as Record<string, string>),
        suggestions: suggestionsWithVotes,
        messages
      });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/sessions/:id", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      const group = await storage.getGroup(session.groupId);
      if (group?.adminId !== userId && req.body.status === 'locked') {
        return res.status(403).json({ message: "Only admin can lock session" });
      }
      
      const updatePayload = { ...req.body };
      if (updatePayload.status === 'locked' && session.status !== 'locked') {
        updatePayload.lockedAt = new Date();
      }
      const updated = await storage.updateSession(req.params.id, updatePayload);
      
      // If session was just locked, notify all participants with calendar invite
      if (req.body.status === 'locked' && session.status !== 'locked') {
        const participants = await storage.getSessionParticipants(req.params.id);
        const participantIds = participants.filter(p => p.status !== 'left').map(p => p.userId);
        const suggestions = await storage.getSessionSuggestions(req.params.id);
        const winningOptionId = updated?.winningOptionId || req.body.winningOptionId;
        const winningSuggestion = winningOptionId 
          ? suggestions.find(s => s.id === winningOptionId)
          : suggestions[0];
        const winningOption = winningSuggestion?.name || 'the plan';
        
        // Build event details for calendar invite
        let eventDetails: { location: string; startDate: Date; description?: string } | undefined;
        
        // Get the confirmed date from the session or use a proposed time
        const confirmedDate = updated?.confirmedDate || req.body.confirmedDate;
        if (confirmedDate && winningSuggestion) {
          const parsedDate = new Date(confirmedDate);
          // Only include event details if the date is valid
          if (!isNaN(parsedDate.getTime())) {
            eventDetails = {
              location: winningSuggestion.name || 'See venue details',
              startDate: parsedDate,
              description: winningSuggestion.description || undefined,
            };
          }
        }
        
        notifyPlanLocked({
          sessionId: req.params.id,
          sessionName: session.name || 'Your plan',
          winningOption,
          participantIds,
          eventDetails,
        }).catch(err => console.error('[Notify] Error sending lock notification:', err));
        
        const locker = await storage.getUser(userId);
        const lockerName = locker?.name || locker?.username || 'Someone';
        const lockMessage = await storage.createMessage({
          sessionId: req.params.id,
          sender: 'system',
          senderName: 'System',
          text: `${lockerName} locked in the plan — you're going to ${winningOption}!`,
        });
        broadcastToSession(req.params.id, {
          type: 'new_message',
          message: lockMessage,
        });
      }
      
      broadcastToSession(req.params.id, {
        type: 'session_update',
        session: updated,
      });
      
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/sessions/:id/participants", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      const { memberId, status } = req.body;
      let joinedUserId: string;
      if (memberId) {
        const group = await storage.getGroup(session.groupId);
        if (group?.adminId !== userId) {
          return res.status(403).json({ message: "Only admin can add other participants" });
        }
        await storage.addSessionParticipant(req.params.id, memberId, status || 'active');
        joinedUserId = memberId;
      } else {
        await storage.addSessionParticipant(req.params.id, userId, status || 'active');
        joinedUserId = userId;
      }
      
      const joinedUser = await storage.getUser(joinedUserId);
      const joinedName = joinedUser?.name || joinedUser?.username || 'Someone';
      const joinMessage = await storage.createMessage({
        sessionId: req.params.id,
        sender: 'system',
        senderName: 'System',
        text: `${joinedName} joined the plan`,
      });
      broadcastToSession(req.params.id, {
        type: 'new_message',
        message: joinMessage,
      });
      broadcastToSession(req.params.id, {
        type: 'session_update',
        session: { ...session, id: req.params.id },
      });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/sessions/:id/participants/:participantId", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      await storage.updateParticipantStatus(req.params.id, req.params.participantId, req.body.status);
      
      const participant = await storage.getUser(req.params.participantId);
      const participantName = participant?.name || participant?.username || 'Someone';
      const statusText = req.body.status === 'cant_make_it' ? "can't make it" : 
                          req.body.status === 'left' ? 'left the plan' : 'is back in';
      const statusMessage = await storage.createMessage({
        sessionId: req.params.id,
        sender: 'system',
        senderName: 'System',
        text: `${participantName} ${statusText}`,
      });
      broadcastToSession(req.params.id, {
        type: 'new_message',
        message: statusMessage,
      });
      broadcastToSession(req.params.id, {
        type: 'session_update',
        session: { id: req.params.id },
      });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Suggestion routes
  app.post("/api/suggestions", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const suggestion = await storage.createSuggestion(req.body);
      res.json(suggestion);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/sessions/:id/suggestions", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      await storage.deleteSessionSuggestions(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Replace a single suggestion with a new one (admin only)
  app.post("/api/sessions/:id/suggestions/:suggestionId/replace", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Check if user is admin
      const group = await storage.getGroup(session.groupId);
      if (!group || group.adminId !== userId) {
        return res.status(403).json({ message: "Only the group admin can replace suggestions" });
      }
      
      // Delete the old suggestion
      await storage.deleteSuggestion(req.params.suggestionId);
      
      // Get current suggestions to avoid duplicates
      const currentSuggestions = await storage.getSessionSuggestions(session.id);
      const existingNames = new Set(currentSuggestions.map(s => s.name.toLowerCase()));
      
      const { getOrchestratedSuggestions: getOrchSuggestions } = await import('./suggestions');
      
      const filters = session.filters as any;
      const { options } = await getOrchSuggestions({
        city: filters?.locationScope || 'NYC',
        categories: filters?.category || ['Drinks'],
        budget: filters?.budget || '$$',
        specificDate: filters?.specificDate || undefined,
        specificTime: filters?.specificTime || undefined,
        timeWindow: filters?.timeWindow || undefined,
        energy: filters?.energy || undefined,
        neighborhood: session.neighborhood || undefined,
      });
      
      // Filter out duplicates and pick one
      const newCandidates = options.filter((s) => !existingNames.has(s.title.toLowerCase()));
      
      if (newCandidates.length === 0) {
        return res.json({ newSuggestion: null, message: "No new alternatives found" });
      }
      
      // Pick the first non-duplicate suggestion
      const newOption = newCandidates[0];
      
      // Save the new suggestion
      const created = await storage.createSuggestion({
        sessionId: session.id,
        name: newOption.title,
        city: filters?.locationScope || 'NYC',
        source: newOption.source || 'Google Places',
        kind: newOption.optionType === 'event' ? 'event' : 'venue',
        budget: newOption.priceLevel || '$$',
        rating: newOption.rating || '4.0',
        turnout: 'Medium',
        distance: newOption.distance || 'Nearby',
        description: newOption.description || '',
        tags: newOption.tags || [],
        reservationUrl: newOption.reservationUrl || null,
        ticketUrl: newOption.ticketUrl || null,
        eventUrl: newOption.eventUrl || null,
        detailUrl: newOption.detailUrl || null,
        whyExplanation: newOption.whyExplanation || null,
      });
      
      res.json({ newSuggestion: created });
    } catch (error: any) {
      console.error('[Replace Suggestion Error]', error);
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/sessions/:id/leave", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Check if user is a participant
      const participants = await storage.getSessionParticipants(session.id);
      const isParticipant = participants.some(p => p.userId === userId);
      
      if (!isParticipant) {
        return res.status(403).json({ message: "Not a participant in this session" });
      }
      
      await storage.leaveSession(session.id, userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.delete("/api/sessions/:id", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Check if user is the group admin
      const group = await storage.getGroup(session.groupId);
      if (!group) {
        return res.status(404).json({ message: "Group not found" });
      }
      
      if (group.adminId !== userId) {
        return res.status(403).json({ message: "Only group admin can delete sessions" });
      }
      
      await storage.softDeleteSession(session.id);
      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Vote routes
  app.post("/api/votes", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { suggestionId, voteType, reasons, note } = req.body;
      
      // Validate voteType
      if (voteType !== 'up' && voteType !== 'down') {
        return res.status(400).json({ message: "voteType must be 'up' or 'down'" });
      }
      
      // For downvotes, validate reasons
      if (voteType === 'down') {
        const hasReasons = reasons && Array.isArray(reasons) && reasons.length > 0;
        const hasNote = note && typeof note === 'string' && note.trim().length >= 3;
        if (!hasReasons && !hasNote) {
          return res.status(400).json({ message: "Downvote requires at least one reason or a note (3+ chars)" });
        }
      }
      
      await storage.vote(suggestionId, userId, voteType, reasons, note);
      
      const suggestion = await storage.getSuggestion(suggestionId);
      if (suggestion) {
        const sessionId = suggestion.sessionId;
        const allVotes = await storage.getSuggestionVotes(suggestionId);
        const votesRecord: Record<string, { voteType: string; reasons?: string[] | null; note?: string | null }> = {};
        allVotes.forEach(v => {
          votesRecord[v.userId] = { voteType: v.voteType, reasons: v.reasons, note: v.note };
        });
        
        broadcastToSession(sessionId, {
          type: 'vote_update',
          sessionId,
          suggestionId,
          votes: votesRecord,
        });
        
        const voter = await storage.getUser(userId);
        const voterName = voter?.name || voter?.username || 'Someone';
        const action = voteType === 'up' ? 'voted for' : 'voted against';
        const systemMessage = await storage.createMessage({
          sessionId,
          sender: 'system',
          senderName: 'System',
          text: `${voterName} ${action} ${suggestion.name}`,
        });
        broadcastToSession(sessionId, {
          type: 'new_message',
          message: systemMessage,
        });
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  // Remove vote
  app.delete("/api/votes/:suggestionId", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { suggestionId } = req.params;
      // Delete vote by calling vote with empty (will be handled in storage or just delete)
      const { eq, and } = await import('drizzle-orm');
      const db = (await import('./storage')).storage;
      // Just delete directly through a new method or inline
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Message routes
  app.post("/api/messages", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      // Get sender name for user messages
      let senderName = req.body.senderName;
      if (!senderName && req.body.sender !== 'system' && req.body.sender !== 'planner-ai') {
        const user = await storage.getUser(userId);
        senderName = user?.name || user?.username || 'Anonymous';
      }
      
      const message = await storage.createMessage({
        ...req.body,
        senderName
      });
      
      // Broadcast to all connected clients in this session
      broadcastToSession(message.sessionId, {
        type: 'new_message',
        message
      });
      
      res.json(message);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Planner AI endpoint with SSE streaming
  app.post("/api/sessions/:id/planner", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const sessionId = req.params.id;
      const { message: userMessage } = req.body;
      
      if (!userMessage) {
        return res.status(400).json({ message: "Message is required" });
      }
      
      // Check if user is a participant
      const participants = await storage.getSessionParticipants(sessionId);
      const isParticipant = participants.some(p => p.userId === userId && p.status !== 'left');
      
      if (!isParticipant) {
        return res.status(403).json({ message: "Not a participant in this session" });
      }
      
      // Get session context for the planner
      const context = await storage.getSessionWithContext(sessionId);
      if (!context) {
        return res.status(404).json({ message: "Session not found" });
      }
      
      // Get current user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      // Save the user's message first
      await storage.createMessage({
        sessionId,
        sender: userId,
        text: userMessage
      });
      
      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Import and use the planner
      const { streamPlannerResponse, fetchLiveEvents } = await import('./planner');
      
      // Fetch live events for the planner context
      const filters = context.session.filters as any;
      const liveEvents = await fetchLiveEvents(
        filters?.locationScope || user.city || 'NYC',
        filters?.specificDate
      );
      
      // Fetch user's historical feedback for AI memory
      const userFeedback = await storage.getUserFeedbackWithVenues(userId);
      
      let fullResponse = '';
      let plannerResult: any = null;
      
      try {
        const generator = streamPlannerResponse({ ...context, user, liveEvents, userFeedback }, userMessage);
        
        while (true) {
          const { value, done } = await generator.next();
          if (done) {
            plannerResult = value;
            break;
          }
          if (typeof value === 'string') {
            fullResponse += value;
            res.write(`data: ${JSON.stringify({ content: value })}\n\n`);
          }
        }
        
        // Save the AI response
        await storage.createMessage({
          sessionId,
          sender: 'planner-ai',
          text: fullResponse || plannerResult?.text || '',
          metadata: { kind: 'planner', suggestionsUpdated: plannerResult?.suggestionsUpdated }
        });
        
        // Send done event with suggestions updated flag
        res.write(`data: ${JSON.stringify({ 
          done: true, 
          suggestionsUpdated: plannerResult?.suggestionsUpdated || false,
          newSuggestions: plannerResult?.newSuggestions || null
        })}\n\n`);
        res.end();
      } catch (streamError: any) {
        console.error('[Planner] Stream error:', streamError);
        res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      console.error('[Planner] Error:', error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ message: error.message });
      }
    }
  });

  // Notification routes
  app.get("/api/notifications", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const count = await storage.getUnreadCount(userId);
      res.json({ count });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/notifications/read", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ message: "Notification id is required" });
      }
      
      await storage.markAsRead(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      await storage.markAllAsRead(userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/notification-prefs", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const prefs = await storage.getNotificationPrefs(userId);
      res.json(prefs || { emailEnabled: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/notification-prefs", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { emailEnabled } = req.body;
      const prefs = await storage.upsertNotificationPrefs(userId, emailEnabled);
      res.json(prefs);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Event Feedback routes
  app.get("/api/sessions/:sessionId/feedback", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const feedback = await storage.getSessionFeedback(req.params.sessionId);
      const hasSubmitted = await storage.hasUserSubmittedFeedback(req.params.sessionId, userId);
      res.json({ feedback, hasSubmitted });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/sessions/:sessionId/feedback", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { rating, review, tags, wouldRecommend, suggestionId } = req.body;
      
      // Validate rating
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }
      
      // Check if already submitted
      const hasSubmitted = await storage.hasUserSubmittedFeedback(req.params.sessionId, userId);
      if (hasSubmitted) {
        return res.status(400).json({ message: "You have already submitted feedback for this event" });
      }
      
      const feedback = await storage.createFeedback({
        sessionId: req.params.sessionId,
        userId,
        suggestionId: suggestionId || null,
        rating,
        review: review || null,
        tags: tags || [],
        wouldRecommend: wouldRecommend ?? null,
      });
      
      res.json(feedback);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/feedback/venue/:name", async (req, res) => {
    try {
      const averageRating = await storage.getVenueAverageRating(req.params.name);
      res.json(averageRating || { avgRating: 0, count: 0 });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  return httpServer;
}
