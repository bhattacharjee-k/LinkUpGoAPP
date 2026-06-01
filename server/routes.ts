import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertUserSchema, insertGroupSchema, insertSessionSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSuggestions, getOrchestratedSuggestions, SuggestionOption, generateWhyExplanation, GroupPreferenceSummary } from "./suggestions";
import { computeMidpoint, getNeighborhoodCenter, LatLng } from "./geo";
import { notifyPlanJoined, notifyPlanLocked, notifyVotingOpen } from "./notifications";
import { sendPushToUsers } from "./push";
import { requireAuth, requireGroupAdmin, requireGroupMember, requireSessionParticipant, requireSessionNotLocked } from "./middleware/auth";
import { signAccessToken, signRefreshToken, storeRefreshToken, validateAndRotateRefreshToken, revokeAllRefreshTokens, extractBearerToken, verifyToken } from "./middleware/jwt-auth";
import { asyncHandler, NotFoundError, ValidationError, ForbiddenError } from "./middleware/error-handler";
import { LoginRequestSchema, RegisterRequestSchema, SuggestRequestSchema, CreateGroupRequestSchema, VoteRequestSchema, CreateMessageRequestSchema, UpdateParticipantTravelRequestSchema } from "@shared/api-schemas";
import { logger } from "./logger";
import { aggregateEnergy, toEnergyLevel } from "@shared/energy";

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

// Shared helper to regenerate suggestions for a session after membership changes
async function regenerateSuggestionsForSession(sessionId: string, session: any, maxWidenAttempts: number = 0): Promise<void> {
  const participants = await storage.getSessionParticipants(sessionId);
  const activeParticipants = participants.filter(p => p.status !== 'left');
  const participantUsers = await Promise.all(
    activeParticipants.map(p => storage.getUser(p.userId))
  );
  const validUsers = participantUsers.filter(Boolean) as any[];
  if (validUsers.length === 0) return;

  const allCategories = validUsers.flatMap((u: any) => u.categories || []);
  const categoryFreq: Record<string, number> = {};
  allCategories.forEach((c: string) => { categoryFreq[c] = (categoryFreq[c] || 0) + 1; });
  const commonCategories = Object.entries(categoryFreq)
    .filter(([_, count]) => count >= Math.ceil(validUsers.length / 2))
    .map(([cat]) => cat);

  const budgetOrder = ['$', '$$', '$$$', '$$$$'];
  const budgets = validUsers.map((u: any) => u.budget || '$$');
  const avgBudgetIdx = Math.round(budgets.reduce((sum: number, b: string) => sum + budgetOrder.indexOf(b), 0) / budgets.length);

  const energies = validUsers.map((u: any) => u.energy || 'Vibey');
  const energyAggregate = aggregateEnergy(energies.map((e: string) => toEnergyLevel(e)));

  const allNeighborhoods = validUsers.flatMap((u: any) => u.favoriteNeighborhoods || []);
  const uniqueNeighborhoods = [...new Set(allNeighborhoods)] as string[];

  const filters = session.filters as any || {};
  const mergedGroupPrefs: GroupPreferenceSummary = {
    memberCount: validUsers.length,
    categories: [...new Set(allCategories)] as string[],
    commonCategories: commonCategories.length > 0 ? commonCategories : (filters.categories || filters.category || ['Drinks']),
    budget: budgetOrder[avgBudgetIdx] || '$$',
    energy: energyAggregate.target,
    crowdPreference: validUsers[0]?.crowdPreference || 'no_preference',
    discoveryStyle: validUsers[0]?.discoveryStyle || 'mixed',
    favoriteNeighborhoods: uniqueNeighborhoods,
  };

  await storage.deleteSessionSuggestions(sessionId);

  const enrichedData: any = {
    city: filters.locationScope || validUsers[0]?.city || 'NYC',
    neighborhood: filters.neighborhood,
    categories: mergedGroupPrefs.commonCategories,
    budget: mergedGroupPrefs.budget,
    energy: mergedGroupPrefs.energy,
    timeWindow: filters.timeWindow,
    specificDate: filters.specificDate,
    specificTime: filters.specificTime,
    vibeDescription: filters.vibeDescription,
    locationMode: filters.locationMode as 'near_me' | 'explore_anywhere' | 'meet_in_the_middle' | undefined,
    midpointLat: filters.midpointLat,
    midpointLng: filters.midpointLng,
    discoveryStyle: mergedGroupPrefs.discoveryStyle as any,
    crowdPreference: mergedGroupPrefs.crowdPreference as any,
    favoriteNeighborhoods: mergedGroupPrefs.favoriteNeighborhoods,
    transportationModes: validUsers.map((u: any) => u.transportationMode || 'car'),
  };

  let result = await getOrchestratedSuggestions(
    enrichedData, undefined, filters.referenceVenues, mergedGroupPrefs
  );

  // Auto-widen search if results are empty (Bug 7)
  let widenAttempt = 0;
  while (result.options.length === 0 && widenAttempt < maxWidenAttempts) {
    widenAttempt++;
    // Remove transport distance cap progressively by widening modes
    if (widenAttempt === 1) {
      // First attempt: upgrade all walkers to transit range
      enrichedData.transportationModes = enrichedData.transportationModes.map(
        (m: string) => m === 'walk' ? 'transit' : m
      );
    } else {
      // Subsequent attempts: remove transport filter entirely
      delete enrichedData.transportationModes;
    }
    logger.debug({ sessionId, widenAttempt, maxWidenAttempts }, '[Session] Auto-widen attempt');
    result = await getOrchestratedSuggestions(
      enrichedData, undefined, filters.referenceVenues, mergedGroupPrefs
    );
  }

  const sourceMap: Record<string, string> = { 'Google': 'Web' };
  for (const opt of result.options) {
    const whyExplanation = opt.whyExplanation || generateWhyExplanation(opt, mergedGroupPrefs);
    const suggestion: Record<string, any> = {
      sessionId,
      name: opt.title,
      city: enrichedData.city,
      source: sourceMap[opt.source] || 'Web',
      kind: 'venue',
      rating: opt.rating || '4.5',
      turnout: '0/0',
      distance: opt.distance || '1.0 mi',
      budget: opt.priceLevel || '$$',
      description: opt.description || `A great spot in ${enrichedData.city}`,
      tags: opt.tags || [],
      whyExplanation,
    };
    if (opt.detailUrl) suggestion.detailUrl = opt.detailUrl;
    if (opt.reservationUrl) suggestion.reservationUrl = opt.reservationUrl;
    await storage.createSuggestion(suggestion as any);
  }

  const updatedSession = await storage.getSessionWithContext(sessionId);
  const regenMessage = await storage.createMessage({
    sessionId,
    sender: 'system',
    senderName: 'System',
    text: `Suggestions updated to match everyone's preferences`,
  });
  broadcastToSession(sessionId, { type: 'new_message', message: regenMessage });
  if (updatedSession) {
    broadcastToSession(sessionId, { type: 'session_update', session: updatedSession.session });
  }
  logger.info({ sessionId, participantCount: validUsers.length }, '[Session] Regenerated suggestions');
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
    // Support JWT auth via query param for mobile clients
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (token) {
        const payload = verifyToken(token);
        if (payload && payload.type === 'access') {
          (ws as any).userId = payload.userId;
        }
      }
    } catch {}

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
  // Global middleware: populate req.userId from JWT Bearer token or session cookie
  // This allows all routes to use req.userId regardless of auth method
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // Try JWT first
    const token = extractBearerToken(req.headers.authorization);
    if (token) {
      const payload = verifyToken(token);
      if (payload && payload.type === 'access') {
        req.userId = payload.userId;
      }
    }
    // Fall back to session cookie
    if (!req.userId) {
      const sessionUserId = (req.session as any)?.userId;
      if (sessionUserId) {
        req.userId = sessionUserId;
      }
    }
    next();
  });

  app.post("/api/auth/register", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    try {
      // Map frontend camelCase to database snake_case
      const { hardNos, ...rest } = req.body;
      const mappedData = {
        ...rest,
        hardNos: hardNos || [],
      };
      
      const data = insertUserSchema.parse(mappedData);
      if (!data.password) {
        return res.status(400).json({ message: "Password is required" });
      }
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
      
      if (!user || !user.password || !await bcrypt.compare(password, user.password)) {
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

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.userId!);
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

  // Mobile JWT auth endpoints
  app.post("/api/auth/mobile/register", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    try {
      const { hardNos, ...rest } = req.body;
      const mappedData = { ...rest, hardNos: hardNos || [] };

      const data = insertUserSchema.parse(mappedData);
      if (!data.password) {
        return res.status(400).json({ message: "Password is required" });
      }
      const hashedPassword = await bcrypt.hash(data.password, 10);

      const user = await storage.createUser({ ...data, password: hashedPassword });

      const accessToken = signAccessToken(user.id);
      const refreshToken = signRefreshToken(user.id);
      await storeRefreshToken(user.id, refreshToken);

      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, accessToken, refreshToken });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/mobile/login", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await storage.getUserByUsername(username);

      if (!user || !user.password || !await bcrypt.compare(password, user.password)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const accessToken = signAccessToken(user.id);
      const refreshToken = signRefreshToken(user.id);
      await storeRefreshToken(user.id, refreshToken);

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, accessToken, refreshToken });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/mobile/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ message: "Refresh token required" });
      }

      const result = await validateAndRotateRefreshToken(refreshToken);
      if (!result) {
        return res.status(401).json({ message: "Invalid refresh token", code: "REFRESH_INVALID" });
      }

      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
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
      logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Places] Autocomplete error');
      res.json({ places: [] });
    }
  }));

  app.post("/api/suggest", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const data = SuggestRequestSchema.parse(req.body);
    
    const userId = req.userId;
    const user = userId ? await storage.getUser(userId) : null;
    const enrichedData = {
      ...data,
      discoveryStyle: data.discoveryStyle || user?.discoveryStyle as 'hidden_gems' | 'popular' | 'mixed' | undefined,
      crowdPreference: data.crowdPreference || user?.crowdPreference as 'quiet' | 'buzzing' | 'no_preference' | undefined,
      favoriteNeighborhoods: data.favoriteNeighborhoods || user?.favoriteNeighborhoods || undefined,
      transportationModes: user?.transportationMode ? [user.transportationMode] : undefined,
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
    };

    const suggestions = result.options.map(opt => {
      const whyExplanation = opt.whyExplanation || generateWhyExplanation(opt, groupPrefs);
      const suggestion: Record<string, any> = {
        name: opt.title,
        city: data.city,
        source: sourceMap[opt.source] || 'Web',
        kind: 'venue',
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
      return suggestion;
    });

    res.json({ suggestions, meta: result.meta });
  }));

  // User routes
  app.patch("/api/users/me", async (req, res) => {
    try {
      const userId = req.userId;
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
      const userId = req.userId;
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

  // Push token registration
  app.post("/api/users/push-token", requireAuth, async (req, res) => {
    try {
      const userId = req.userId!;
      const { pushToken } = req.body;

      if (!pushToken || typeof pushToken !== 'string') {
        return res.status(400).json({ message: "pushToken is required" });
      }

      const user = await storage.updateUser(userId, { pushToken });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Facebook login (mobile)
  app.post("/api/auth/mobile/facebook", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
    try {
      const { accessToken: fbToken } = req.body;
      if (!fbToken) {
        return res.status(400).json({ message: "Facebook access token required" });
      }

      // Verify token with Facebook Graph API
      const fbResponse = await fetch(
        `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(fbToken)}`
      );

      if (!fbResponse.ok) {
        return res.status(401).json({ message: "Invalid Facebook token" });
      }

      const fbUser = await fbResponse.json();
      if (!fbUser.id) {
        return res.status(401).json({ message: "Could not verify Facebook identity" });
      }

      // Look up existing user by facebookId
      let user = await storage.getUserByFacebookId(fbUser.id);
      let isNewUser = false;

      if (!user) {
        // Check if email matches existing user (account linking)
        if (fbUser.email) {
          const existingByEmail = await storage.getUserByEmail(fbUser.email);
          if (existingByEmail) {
            // Link Facebook to existing account
            user = await storage.updateUser(existingByEmail.id, {
              facebookId: fbUser.id,
              authProvider: 'facebook',
              avatarUrl: fbUser.picture?.data?.url || null,
            });
          }
        }

        if (!user) {
          // Create new user with defaults — client will complete profile setup
          const username = `${fbUser.name.toLowerCase().replace(/\s+/g, '_')}_${Math.random().toString(36).substring(2, 6)}`;
          user = await storage.createUser({
            username,
            password: null,
            name: fbUser.name,
            email: fbUser.email || null,
            city: 'NYC',
            budget: ['$$'],
            energy: 'Vibey',
            categories: ['Drinks'],
            hardNos: [],
            authProvider: 'facebook',
            facebookId: fbUser.id,
            avatarUrl: fbUser.picture?.data?.url || null,
          });
          isNewUser = true;
        }
      }

      if (!user) {
        return res.status(500).json({ message: "Failed to create or find user" });
      }

      const jwtAccessToken = signAccessToken(user.id);
      const jwtRefreshToken = signRefreshToken(user.id);
      await storeRefreshToken(user.id, jwtRefreshToken);

      const { password, ...userWithoutPassword } = user;
      res.json({
        user: userWithoutPassword,
        accessToken: jwtAccessToken,
        refreshToken: jwtRefreshToken,
        isNewUser,
      });
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Facebook Auth] Error');
      res.status(400).json({ message: error.message });
    }
  });

  // Group routes
  app.get("/api/groups", requireAuth, async (req, res) => {
    try {
      const userId = req.userId!;

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
      const userId = req.userId;
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
      const userId = req.userId;
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
      const joiner = await storage.getUser(userId);
      const joinerName = joiner?.name || 'Someone';
      for (const session of sessions) {
        // Only add to active (non-locked, non-deleted) sessions
        if (session.status !== 'locked' && !session.deletedAt) {
          try {
            await storage.addSessionParticipant(session.id, userId, 'active');
            // Broadcast join to session participants
            const joinMsg = await storage.createMessage({
              sessionId: session.id,
              sender: 'system',
              senderName: 'System',
              text: `${joinerName} joined the plan`,
            });
            broadcastToSession(session.id, { type: 'new_message', message: joinMsg });
            broadcastToSession(session.id, { type: 'session_update', session: { ...session, id: session.id } });
            // Trigger suggestion regeneration with auto-widen
            regenerateSuggestionsForSession(session.id, session, 4).catch(err =>
              logger.error({ err: err instanceof Error ? err.message : String(err) }, '[Group Join] Failed to regenerate suggestions')
            );
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
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      logger.debug({ inviteCode: req.params.inviteCode, userId }, '[Join] Looking up session');
      const session = await storage.getSessionByInviteCode(req.params.inviteCode);
      if (!session) {
        logger.debug({ inviteCode: req.params.inviteCode }, '[Join] No session found');
        return res.status(404).json({ message: "Invalid session invite code" });
      }
      
      logger.debug({ sessionId: session.id, status: session.status, inviteCode: session.inviteCode }, '[Join] Found session');
      
      if (session.deletedAt) {
        logger.warn({ sessionId: session.id }, '[Join] Session is deleted');
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
        const joinerName = user?.name || 'Someone';
        notifyPlanJoined({
          sessionId: session.id,
          sessionName: session.name || 'the plan',
          joinerId: userId,
          joinerName,
          adminId: group.adminId,
        }).catch(err => logger.error({ err: err instanceof Error ? err.message : String(err) }, '[Notify] Error sending join notification'));

        // Broadcast real-time update to session participants
        const joinMsg = await storage.createMessage({
          sessionId: session.id,
          sender: 'system',
          senderName: 'System',
          text: `${joinerName} joined the plan`,
        });
        broadcastToSession(session.id, { type: 'new_message', message: joinMsg });
        broadcastToSession(session.id, { type: 'session_update', session: { ...session, id: session.id } });

        // Trigger suggestion regeneration in background
        if (session.status !== 'locked') {
          regenerateSuggestionsForSession(session.id, session, 4).catch(err =>
            logger.error({ err: err instanceof Error ? err.message : String(err) }, '[Join] Failed to regenerate suggestions')
          );
        }
      } catch (e) {
        // Ignore if already a participant
      }

      res.json({ session, group: { ...group, members: await storage.getGroupMembers(group.id) } });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Session routes
  app.get("/api/sessions", requireAuth, async (req, res) => {
    try {
      const userId = req.userId!;
      
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
            participantNeighborhoods: participants.reduce((acc, p) => {
              if (p.startingNeighborhood) acc[p.userId] = p.startingNeighborhood;
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
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { groupId, name, filters, guardrails, referenceVenues } = req.body;
      
      const inviteCode = filters?.inviteCode || Math.random().toString(36).substr(2, 6).toUpperCase();
      logger.debug({ groupId, inviteCode }, '[Session] Creating session');
      
      const session = await storage.createSession({
        groupId,
        name,
        status: 'draft',
        inviteCode,
        filters,
        guardrails,
        referenceVenues: referenceVenues || null
      });
      
      logger.info({ sessionId: session.id, inviteCode: session.inviteCode }, '[Session] Created session');
      
      // Add all group members as participants (including creator)
      const groupMembers = await storage.getGroupMembers(groupId);
      for (const memberId of groupMembers) {
        try {
          await storage.addSessionParticipant(session.id, memberId, 'active');
        } catch (e) {
          // Ignore if already a participant
        }
      }

      // Push notification to group members about new plan
      const creator = await storage.getUser(userId);
      const creatorName = creator?.name || 'Someone';
      const planName = name || 'a new plan';
      sendPushToUsers({
        userIds: groupMembers,
        title: 'New Plan Started',
        body: `${creatorName} started ${planName}. Check out the suggestions!`,
        url: `/session/${session.id}`,
        excludeUserId: userId,
      }).catch(err => logger.error({ err: err instanceof Error ? err.message : String(err) }, '[Push] Session created notification failed'));

      res.json(session);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    try {
      const userId = req.userId;
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
        participantNeighborhoods: participants.reduce((acc, p) => {
          if (p.startingNeighborhood) acc[p.userId] = p.startingNeighborhood;
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
      const userId = req.userId;
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
        
        // Get the confirmed date from the request body (sessions schema has no confirmedDate column).
        const confirmedDate = req.body.confirmedDate;
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
        }).catch(err => logger.error({ err: err instanceof Error ? err.message : String(err) }, '[Notify] Error sending lock notification'));
        
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
      const userId = req.userId;
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

      if (session.status !== 'locked') {
        regenerateSuggestionsForSession(req.params.id, session).catch(err =>
          logger.error({ err: err instanceof Error ? err.message : String(err) }, '[Session] Failed to regenerate suggestions after participant added')
        );
      }
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.patch("/api/sessions/:id/participants/:participantId", async (req, res) => {
    try {
      const userId = req.userId;
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

  app.patch("/api/sessions/:id/participants/:participantId/neighborhood", requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const parsed = UpdateParticipantTravelRequestSchema.safeParse({
      ...req.body,
      startingNeighborhood: req.body.startingNeighborhood ?? req.body.neighborhood,
    });
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid participant travel info" });
    }
    const { transportMode, travelToleranceMin } = parsed.data;
    const startingNeighborhood = parsed.data.startingNeighborhood?.trim();

    const userId = req.userId;
    if (userId !== req.params.participantId) {
      return res.status(403).json({ message: "You can only set your own starting neighborhood" });
    }

    if (parsed.data.startingNeighborhood !== undefined && !startingNeighborhood) {
      return res.status(400).json({ message: "Neighborhood cannot be empty" });
    }

    await storage.updateParticipantTravel(req.params.id, req.params.participantId, {
      ...(startingNeighborhood ? { startingNeighborhood } : {}),
      ...(transportMode ? { transportMode } : {}),
      ...(travelToleranceMin !== undefined ? { travelToleranceMin } : {}),
    });

    const session = await storage.getSession(req.params.id);
    const filters = (session?.filters as any) || {};

    if (startingNeighborhood && filters.locationMode === 'meet_in_the_middle') {
      const participants = await storage.getSessionParticipants(req.params.id);
      const city = filters.locationScope || 'NYC';
      const points: LatLng[] = [];

      for (const p of participants) {
        if (p.startingNeighborhood && p.status !== 'left') {
          const center = getNeighborhoodCenter(city, p.startingNeighborhood);
          if (center) points.push(center);
        }
      }

      if (points.length >= 2) {
        const midpoint = computeMidpoint(points);
        await storage.updateSession(req.params.id, {
          filters: { ...filters, midpointLat: midpoint.lat, midpointLng: midpoint.lng }
        } as any);
      }
    }

    if (startingNeighborhood) {
      const participant = await storage.getUser(req.params.participantId);
      const participantName = participant?.name || participant?.username || 'Someone';
      const systemMsg = await storage.createMessage({
        sessionId: req.params.id,
        sender: 'system',
        senderName: 'System',
        text: `${participantName} is coming from ${startingNeighborhood}`,
      });
      broadcastToSession(req.params.id, { type: 'new_message', message: systemMsg });
    }
    broadcastToSession(req.params.id, { type: 'session_update', session: { id: req.params.id } });

    res.json({ success: true });
  }));

  // Suggestion routes
  app.post("/api/suggestions", async (req, res) => {
    try {
      const userId = req.userId;
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
      const userId = req.userId;
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
      const userId = req.userId;
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
        kind: 'venue',
        budget: newOption.priceLevel || '$$',
        rating: newOption.rating || '4.0',
        turnout: 'Medium',
        distance: newOption.distance || 'Nearby',
        description: newOption.description || '',
        tags: newOption.tags || [],
        reservationUrl: newOption.reservationUrl || null,
        detailUrl: newOption.detailUrl || null,
        whyExplanation: newOption.whyExplanation || null,
      });
      
      res.json({ newSuggestion: created });
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Replace Suggestion] Error');
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/sessions/:id/leave", async (req, res) => {
    try {
      const userId = req.userId;
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
      const userId = req.userId;
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
      const userId = req.userId;
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

        // Push notification for vote
        const participants = await storage.getSessionParticipants(sessionId);
        const participantIds = participants.map(p => p.userId);
        sendPushToUsers({
          userIds: participantIds,
          title: 'New Vote',
          body: `${voterName} ${action} ${suggestion.name}`,
          url: `/session/${sessionId}`,
          excludeUserId: userId,
        }).catch(err => logger.error({ err: err instanceof Error ? err.message : String(err) }, '[Push] Vote notification failed'));
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });
  
  // Remove vote
  app.delete("/api/votes/:suggestionId", async (req, res) => {
    try {
      const userId = req.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const { suggestionId } = req.params;
      const { eq, and } = await import('drizzle-orm');
      const { db } = await import('./storage');
      const { votes } = await import('../shared/schema');

      await db.delete(votes).where(
        and(
          eq(votes.suggestionId, suggestionId),
          eq(votes.userId, userId)
        )
      );

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Message routes
  app.post("/api/messages", async (req, res) => {
    try {
      const userId = req.userId;
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
      const userId = req.userId;
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
      
      // Save the user's message first and broadcast to all clients
      const senderName = user.name || user.username || 'Anonymous';
      const userMsg = await storage.createMessage({
        sessionId,
        sender: userId,
        senderName,
        text: userMessage
      });
      broadcastToSession(sessionId, {
        type: 'new_message',
        message: userMsg
      });
      
      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Import and use the planner
      const { streamPlannerResponse } = await import('./planner');

      // Fetch user's historical feedback for AI memory
      const userFeedback = await storage.getUserFeedbackWithVenues(userId);
      
      let fullResponse = '';
      let plannerResult: any = null;
      
      try {
        const generator = streamPlannerResponse({ ...context, user, userFeedback }, userMessage);
        
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
        
        // Save the AI response and broadcast to all clients
        const aiMsg = await storage.createMessage({
          sessionId,
          sender: 'planner-ai',
          senderName: 'Planner AI',
          text: fullResponse || plannerResult?.text || '',
          metadata: { kind: 'planner', suggestionsUpdated: plannerResult?.suggestionsUpdated }
        });
        broadcastToSession(sessionId, {
          type: 'new_message',
          message: aiMsg
        });
        
        if (plannerResult?.suggestionsUpdated) {
          const updatedSession = await storage.getSessionWithContext(sessionId);
          if (updatedSession) {
            broadcastToSession(sessionId, {
              type: 'session_update',
              session: updatedSession.session,
            });
          }
        }
        
        res.write(`data: ${JSON.stringify({ 
          done: true, 
          suggestionsUpdated: plannerResult?.suggestionsUpdated || false,
          newSuggestions: plannerResult?.newSuggestions || null
        })}\n\n`);
        res.end();
      } catch (streamError: any) {
        logger.error({ err: streamError instanceof Error ? streamError.message : String(streamError) }, '[Planner] Stream error');
        res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
        res.end();
      }
    } catch (error: any) {
      logger.error({ err: error instanceof Error ? error.message : String(error) }, '[Planner] Error');
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
      const userId = req.userId;
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
      const userId = req.userId;
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
      const userId = req.userId;
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
      const userId = req.userId;
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
      const userId = req.userId;
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
      const userId = req.userId;
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
      const userId = req.userId;
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
      const userId = req.userId;
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
