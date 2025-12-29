import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertGroupSchema, insertSessionSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Auth routes
  app.post("/api/auth/register", async (req, res) => {
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

  app.post("/api/auth/login", async (req, res) => {
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

  app.post("/api/groups", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { name } = req.body;
      const inviteCode = generateInviteCode();
      
      const group = await storage.createGroup({
        name,
        adminId: userId,
        locked: false
      }, inviteCode);
      
      const members = await storage.getGroupMembers(group.id);
      res.json({ ...group, members });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

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

  app.patch("/api/groups/:id", async (req, res) => {
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
      
      if (group.adminId !== userId) {
        return res.status(403).json({ message: "Only admin can modify group" });
      }
      
      const updated = await storage.updateGroup(req.params.id, req.body);
      const members = await storage.getGroupMembers(req.params.id);
      res.json({ ...updated, members });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

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
      const members = await storage.getGroupMembers(group.id);
      res.json({ ...group, members });
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
          
          const suggestionsWithVotes = await Promise.all(
            suggestions.map(async (s) => {
              const votes = await storage.getSuggestionVotes(s.id);
              const votesRecord: Record<string, string> = {};
              votes.forEach(v => {
                votesRecord[v.userId] = v.vote;
              });
              return { ...s, votes: votesRecord };
            })
          );
          
          return {
            ...session,
            participants: participants.map(p => p.userId),
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
      
      const { groupId, name, filters, guardrails } = req.body;
      
      const session = await storage.createSession({
        groupId,
        name,
        status: 'draft',
        filters,
        guardrails
      });
      
      // Add creator as participant
      await storage.addSessionParticipant(session.id, userId, 'active');
      
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
      
      // Get votes for each suggestion
      const suggestionsWithVotes = await Promise.all(
        suggestions.map(async (s) => {
          const votes = await storage.getSuggestionVotes(s.id);
          const votesRecord: Record<string, string> = {};
          votes.forEach(v => {
            votesRecord[v.userId] = v.vote;
          });
          return { ...s, votes: votesRecord };
        })
      );
      
      res.json({
        ...session,
        participants: participants.map(p => p.userId),
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
      
      const updated = await storage.updateSession(req.params.id, req.body);
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
      
      await storage.addSessionParticipant(req.params.id, userId, req.body.status || 'active');
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

  // Vote routes
  app.post("/api/votes", async (req, res) => {
    try {
      // @ts-ignore
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const { suggestionId, vote } = req.body;
      await storage.vote(suggestionId, userId, vote);
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
      
      const message = await storage.createMessage(req.body);
      res.json(message);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  return httpServer;
}
