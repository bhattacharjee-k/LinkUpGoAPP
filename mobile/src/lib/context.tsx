import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { api, getAccessToken, setTokens, clearTokens, getWebSocketUrl, fetchSSE } from './api';
import Toast from 'react-native-toast-message';

// Types matching web client
export interface UserProfile {
  id: string;
  name: string;
  username: string;
  email?: string;
  city: string;
  budget: string[];
  energy: string;
  categories: string[];
  hardNos: string[];
  lastKnownLat?: string | null;
  lastKnownLng?: string | null;
  lastLocationTimestamp?: string | null;
  locationPermission?: 'granted' | 'denied' | 'pending';
  discoveryStyle?: 'hidden_gems' | 'popular' | 'mixed';
  crowdPreference?: 'quiet' | 'buzzing' | 'no_preference';
  favoriteNeighborhoods?: string[];
}

export interface GroupMemberDetail {
  id: string;
  name: string;
  username: string;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
  memberDetails?: GroupMemberDetail[];
  inviteCode: string;
  adminId: string;
  locked: boolean;
}

export interface Suggestion {
  id: string;
  name: string;
  source: string;
  kind?: string;
  rating: string;
  turnout: string;
  distance: string;
  budget: string;
  description: string;
  tags: string[];
  detailUrl?: string;
  reservationUrl?: string;
  ticketUrl?: string;
  eventUrl?: string;
  venueName?: string;
  startTime?: string;
  whyExplanation?: string;
  votes: Record<string, { voteType: string; reasons?: string[] | null; note?: string | null }>;
}

export interface ParticipantDetail {
  id: string;
  name: string;
  status: string;
}

export interface PlanningSession {
  id: string;
  name?: string;
  groupId: string;
  status: string;
  lockedByUserId?: string;
  lockedAt?: string;
  winningOptionId?: string;
  participantStatusByUserId: Record<string, string>;
  filters: any;
  guardrails: any;
  suggestions: Suggestion[];
  messages: any[];
  participants: string[];
  participantDetails?: ParticipantDetail[];
  inviteCode?: string;
}

interface AppContextType {
  user: UserProfile | null;
  groups: Group[];
  sessions: PlanningSession[];
  isLoading: boolean;
  dataLoading: boolean;
  setUser: (user: UserProfile) => void;
  register: (data: any) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (updates: any) => Promise<void>;
  updateUserLocation: (lat: string, lng: string, permission: string) => Promise<void>;
  createGroup: (name: string) => Promise<Group>;
  startSession: (groupId: string, initialFilters: any, name?: string) => Promise<string>;
  getSession: (id: string) => PlanningSession | undefined;
  refreshSession: (id: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  leaveSession: (sessionId: string) => Promise<void>;
  addMessage: (sessionId: string, text: string) => Promise<void>;
  sendPlannerMessage: (sessionId: string, text: string, onStream: (chunk: string) => void) => Promise<{ response: string; suggestionsUpdated: boolean }>;
  upvoteForSuggestion: (sessionId: string, suggestionId: string) => Promise<void>;
  downvoteForSuggestion: (sessionId: string, suggestionId: string, reasons: string[], note?: string) => Promise<void>;
  confirmPlan: (sessionId: string, suggestionId: string) => Promise<void>;
  updateSessionFilters: (sessionId: string, filters: any) => Promise<void>;
  regenerateSuggestions: (sessionId: string) => Promise<void>;
  joinGroupByCode: (inviteCode: string) => Promise<Group>;
  refreshGroups: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  isGroupLocked: (groupId: string) => boolean;
  isAdmin: (groupId: string) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// WebSocket management
let wsConnection: WebSocket | null = null;
const messageListeners: Map<string, Set<(message: any) => void>> = new Map();
const voteListeners: Map<string, Set<(data: any) => void>> = new Map();
const sessionUpdateListeners: Map<string, Set<(data: any) => void>> = new Map();

function connectWebSocket(token: string | null) {
  if (wsConnection && wsConnection.readyState !== WebSocket.CLOSED) {
    return wsConnection;
  }

  const url = token ? `${getWebSocketUrl()}?token=${token}` : getWebSocketUrl();
  wsConnection = new WebSocket(url);

  wsConnection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'new_message' && data.message?.sessionId) {
        const listeners = messageListeners.get(data.message.sessionId);
        if (listeners) listeners.forEach(cb => cb(data.message));
      } else if (data.type === 'vote_update' && data.sessionId) {
        const listeners = voteListeners.get(data.sessionId);
        if (listeners) listeners.forEach(cb => cb(data));
      } else if (data.type === 'session_update' && data.session) {
        const sid = data.session.id;
        if (sid) {
          const listeners = sessionUpdateListeners.get(sid);
          if (listeners) listeners.forEach(cb => cb(data));
        }
      }
    } catch (e) {
      console.error('WebSocket parse error:', e);
    }
  };

  wsConnection.onclose = () => {
    // Auto-reconnect after 3s
    setTimeout(async () => {
      const t = await getAccessToken();
      connectWebSocket(t);
    }, 3000);
  };

  return wsConnection;
}

export function subscribeToSessionMessages(sessionId: string, callback: (message: any) => void): () => void {
  if (!messageListeners.has(sessionId)) messageListeners.set(sessionId, new Set());
  messageListeners.get(sessionId)!.add(callback);

  const ws = wsConnection;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'join', sessionId }));
  }

  return () => {
    const listeners = messageListeners.get(sessionId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        messageListeners.delete(sessionId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'leave' }));
        }
      }
    }
  };
}

export function subscribeToVoteUpdates(sessionId: string, callback: (data: any) => void): () => void {
  if (!voteListeners.has(sessionId)) voteListeners.set(sessionId, new Set());
  voteListeners.get(sessionId)!.add(callback);
  return () => {
    const listeners = voteListeners.get(sessionId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) voteListeners.delete(sessionId);
    }
  };
}

export function subscribeToSessionUpdates(sessionId: string, callback: (data: any) => void): () => void {
  if (!sessionUpdateListeners.has(sessionId)) sessionUpdateListeners.set(sessionId, new Set());
  sessionUpdateListeners.get(sessionId)!.add(callback);
  return () => {
    const listeners = sessionUpdateListeners.get(sessionId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) sessionUpdateListeners.delete(sessionId);
    }
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<PlanningSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  // Load initial data on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          setIsLoading(false);
          return;
        }
        const userData = await api.auth.me();
        setUserState(userData);
        connectWebSocket(token);
        try {
          await Promise.all([loadGroups(), loadSessions()]);
        } catch (e) {
          console.error('Failed to load data on mount:', e);
        }
      } catch {
        await clearTokens();
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  // Reconnect WS when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state: AppStateStatus) => {
      if (state === 'active' && user) {
        const token = await getAccessToken();
        connectWebSocket(token);
        // Refresh data on foreground
        try {
          await Promise.all([loadGroups(), loadSessions()]);
        } catch (e) {
          console.error('Failed to refresh data on foreground:', e);
        }
      }
    });
    return () => sub.remove();
  }, [user]);

  const loadGroups = async () => {
    const data = await api.groups.list();
    setGroups(data);
  };

  const loadSessions = async () => {
    const data = await api.sessions.list();
    setSessions(data);
  };

  const setUser = (newUser: UserProfile) => setUserState(newUser);

  const register = async (data: any) => {
    const result = await api.auth.register(data);
    await setTokens(result.accessToken, result.refreshToken);
    connectWebSocket(result.accessToken);
    setDataLoading(true);
    setUserState(result.user);
    loadDataAfterAuth();
  };

  const login = async (username: string, password: string) => {
    const result = await api.auth.login(username, password);
    await setTokens(result.accessToken, result.refreshToken);
    connectWebSocket(result.accessToken);
    setDataLoading(true);
    setUserState(result.user);
    // Load data in background — don't await so login returns immediately
    // and home screen shows the loading state
    loadDataAfterAuth();
  };

  const loadDataAfterAuth = async () => {
    try {
      await Promise.all([loadGroups(), loadSessions()]);
    } catch (e) {
      console.error('Failed to load data:', e);
      // Retry once
      try {
        await Promise.all([loadGroups(), loadSessions()]);
      } catch {
        console.error('Retry also failed');
      }
    } finally {
      setDataLoading(false);
    }
  };

  const logout = async () => {
    await clearTokens();
    if (wsConnection) {
      wsConnection.close();
      wsConnection = null;
    }
    setUserState(null);
    setGroups([]);
    setSessions([]);
  };

  const updateUserProfile = async (updates: any) => {
    const updated = await api.users.updateMe(updates);
    setUserState(updated);
  };

  const updateUserLocation = async (lat: string, lng: string, permission: string) => {
    const updated = await api.users.updateLocation(lat, lng, permission);
    setUserState(updated);
  };

  const createGroup = async (name: string): Promise<Group> => {
    const newGroup = await api.groups.create(name);
    setGroups(prev => [...prev, newGroup]);
    return newGroup;
  };

  const joinGroupByCode = async (inviteCode: string): Promise<Group> => {
    const group = await api.groups.join(inviteCode);
    setGroups(prev => [...prev, group]);
    await loadSessions();
    return group;
  };

  const isGroupLocked = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    return group?.locked || false;
  };

  const isAdmin = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    return group?.adminId === user?.id;
  };

  const startSession = async (groupId: string, initialFilters: any, name?: string) => {
    const session = await api.sessions.create({
      groupId,
      name,
      filters: initialFilters,
      guardrails: { minTurnout: 'balanced', priority: 'turnout' },
      referenceVenues: initialFilters.referenceVenues,
    });

    try {
      const result = await api.suggestions.fetch({
        city: initialFilters.locationScope || user?.city || 'NYC',
        neighborhood: initialFilters.neighborhood,
        userLat: user?.lastKnownLat ? parseFloat(user.lastKnownLat) : undefined,
        userLng: user?.lastKnownLng ? parseFloat(user.lastKnownLng) : undefined,
        categories: initialFilters.category || ['Drinks'],
        budget: initialFilters.budget,
        energy: initialFilters.energy,
        timeWindow: initialFilters.timeWindow,
        specificDate: initialFilters.specificDate,
        specificTime: initialFilters.specificTime,
        referenceVenues: initialFilters.referenceVenues,
        vibeDescription: initialFilters.vibeDescription,
        locationMode: initialFilters.locationMode,
      });

      for (const suggestion of result.suggestions) {
        await api.suggestions.create({ sessionId: session.id, ...suggestion });
      }
    } catch (error) {
      console.error('[Session] Suggestion fetch failed:', error);
    }

    await api.messages.create({
      sessionId: session.id,
      sender: 'system',
      text: 'Planning session started. @Planner is listening.',
    });

    await refreshSession(session.id);
    return session.id;
  };

  const getSession = (id: string) => sessions.find(s => s.id === id);

  const refreshSession = async (id: string) => {
    try {
      const sessionData = await api.sessions.get(id);
      setSessions(prev => {
        const exists = prev.some(s => s.id === id);
        if (exists) return prev.map(s => s.id === id ? sessionData : s);
        return [...prev, sessionData];
      });
    } catch (e) {
      console.error('Failed to refresh session:', e);
    }
  };

  const addMessage = async (sessionId: string, text: string) => {
    if (text.toLowerCase().includes('@planner') || text.toLowerCase().startsWith('planner ')) {
      return;
    }
    await api.messages.create({ sessionId, sender: user?.id || 'user', text });
    await refreshSession(sessionId);
  };

  const sendPlannerMessage = async (
    sessionId: string,
    text: string,
    onStream: (chunk: string) => void
  ): Promise<{ response: string; suggestionsUpdated: boolean }> => {
    let fullResponse = '';
    let suggestionsUpdated = false;

    try {
      await fetchSSE(
        `/sessions/${sessionId}/planner`,
        { message: text },
        (data) => {
          if (data.content) {
            fullResponse += data.content;
            onStream(data.content);
          } else if (data.done) {
            suggestionsUpdated = data.suggestionsUpdated || false;
          }
        }
      );
    } catch (error: any) {
      console.error('[Planner] Stream error:', error);
      fullResponse = "Sorry, I'm having trouble connecting right now. Try again in a moment!";
    }

    await refreshSession(sessionId);
    return { response: fullResponse, suggestionsUpdated };
  };

  const upvoteForSuggestion = async (sessionId: string, suggestionId: string) => {
    await api.votes.upvote(suggestionId);
    await refreshSession(sessionId);
  };

  const downvoteForSuggestion = async (sessionId: string, suggestionId: string, reasons: string[], note?: string) => {
    await api.votes.downvote(suggestionId, reasons, note);
    await refreshSession(sessionId);
  };

  const confirmPlan = async (sessionId: string, suggestionId: string) => {
    await api.sessions.update(sessionId, { status: 'locked', winningOptionId: suggestionId });
    await refreshSession(sessionId);
  };

  const updateSessionFilters = async (sessionId: string, filters: any) => {
    await api.sessions.update(sessionId, { filters });
    await refreshSession(sessionId);
  };

  const regenerateSuggestions = async (sessionId: string) => {
    // Fetch fresh session data from server to get latest filters
    // (local state may be stale after updateSessionFilters)
    const freshSession = await api.sessions.get(sessionId);
    if (!freshSession) return;

    await api.suggestions.deleteForSession(sessionId);

    try {
      const filters = freshSession.filters || {};
      const result = await api.suggestions.fetch({
        city: filters.locationScope || user?.city || 'NYC',
        neighborhood: filters.neighborhood,
        userLat: user?.lastKnownLat ? parseFloat(user.lastKnownLat) : undefined,
        userLng: user?.lastKnownLng ? parseFloat(user.lastKnownLng) : undefined,
        categories: filters.category || ['Drinks'],
        budget: filters.budget,
        energy: filters.energy,
        timeWindow: filters.timeWindow,
        specificDate: filters.specificDate,
        specificTime: filters.specificTime,
        vibeDescription: filters.vibeDescription,
        locationMode: filters.locationMode,
      });

      for (const suggestion of result.suggestions) {
        await api.suggestions.create({ sessionId, ...suggestion });
      }
    } catch (error) {
      console.error('[Suggestions] Fetch failed:', error);
    }

    await api.messages.create({
      sessionId,
      sender: 'system',
      text: 'Options regenerated based on updated filters.',
    });

    await refreshSession(sessionId);
  };

  const deleteSession = async (sessionId: string) => {
    await api.sessions.delete(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  const leaveSession = async (sessionId: string) => {
    await api.sessions.leave(sessionId);
    await refreshSession(sessionId);
  };

  const refreshGroups = loadGroups;
  const refreshSessions = loadSessions;

  const value: AppContextType = {
    user, groups, sessions, isLoading, dataLoading,
    setUser, register, login, logout,
    updateUserProfile, updateUserLocation,
    createGroup, startSession,
    getSession, refreshSession,
    deleteSession, leaveSession,
    addMessage, sendPlannerMessage,
    upvoteForSuggestion, downvoteForSuggestion,
    confirmPlan, updateSessionFilters,
    regenerateSuggestions, joinGroupByCode,
    refreshGroups, refreshSessions,
    isGroupLocked, isAdmin,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
