import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api';
import { MOCK_SUGGESTIONS, MOCK_SUGGESTIONS_BY_CITY, CITY_COORDS, type City } from './store';

// WebSocket connection for real-time updates
let wsConnection: WebSocket | null = null;
const messageListeners: Map<string, Set<(message: any) => void>> = new Map();
const voteListeners: Map<string, Set<(data: any) => void>> = new Map();
const sessionUpdateListeners: Map<string, Set<(data: any) => void>> = new Map();

function getWebSocket(): WebSocket {
  if (!wsConnection || wsConnection.readyState === WebSocket.CLOSED) {
    const apiUrl = import.meta.env.VITE_API_URL;
    let wsUrl: string;
    if (apiUrl) {
      // Cross-domain: derive WebSocket URL from API URL
      wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws';
    } else {
      // Same-origin: use current host
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws`;
    }
    wsConnection = new WebSocket(wsUrl);
    
    wsConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message' && data.message?.sessionId) {
          const listeners = messageListeners.get(data.message.sessionId);
          if (listeners) {
            listeners.forEach(cb => cb(data.message));
          }
        } else if (data.type === 'vote_update' && data.sessionId) {
          const listeners = voteListeners.get(data.sessionId);
          if (listeners) {
            listeners.forEach(cb => cb(data));
          }
        } else if (data.type === 'session_update' && data.session) {
          const sid = data.session.id;
          if (sid) {
            const listeners = sessionUpdateListeners.get(sid);
            if (listeners) {
              listeners.forEach(cb => cb(data));
            }
          }
        }
      } catch (e) {
        console.error('WebSocket message parse error:', e);
      }
    };
  }
  return wsConnection;
}

export function subscribeToSessionMessages(sessionId: string, callback: (message: any) => void): () => void {
  if (!messageListeners.has(sessionId)) {
    messageListeners.set(sessionId, new Set());
  }
  messageListeners.get(sessionId)!.add(callback);
  
  // Join the session room
  const ws = getWebSocket();
  const sendJoin = () => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'join', sessionId }));
    }
  };
  
  if (ws.readyState === WebSocket.OPEN) {
    sendJoin();
  } else {
    ws.addEventListener('open', sendJoin, { once: true });
  }
  
  // Return unsubscribe function
  return () => {
    const listeners = messageListeners.get(sessionId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        messageListeners.delete(sessionId);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'leave' }));
        }
      }
    }
  };
}

export function subscribeToVoteUpdates(sessionId: string, callback: (data: any) => void): () => void {
  if (!voteListeners.has(sessionId)) {
    voteListeners.set(sessionId, new Set());
  }
  voteListeners.get(sessionId)!.add(callback);
  getWebSocket();
  return () => {
    const listeners = voteListeners.get(sessionId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) voteListeners.delete(sessionId);
    }
  };
}

export function subscribeToSessionUpdates(sessionId: string, callback: (data: any) => void): () => void {
  if (!sessionUpdateListeners.has(sessionId)) {
    sessionUpdateListeners.set(sessionId, new Set());
  }
  sessionUpdateListeners.get(sessionId)!.add(callback);
  getWebSocket();
  return () => {
    const listeners = sessionUpdateListeners.get(sessionId);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) sessionUpdateListeners.delete(sessionId);
    }
  };
}

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
  rating: string;
  turnout: string;
  distance: string;
  budget: string;
  description: string;
  tags: string[];
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
  lockedAt?: Date;
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
  addMemberToGroup: (groupId: string, userId: string) => void;
  addParticipantToSession: (sessionId: string, userId: string) => void;
  updateGroup: (groupId: string, updates: Partial<Group>) => Promise<void>;
  joinGroupByCode: (inviteCode: string) => Promise<Group>;
  refreshGroups: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  isGroupLocked: (groupId: string) => boolean;
  isAdmin: (groupId: string) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [sessions, setSessions] = useState<PlanningSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await api.auth.me();
        setUserState(userData);
        await loadGroups();
        await loadSessions();
      } catch (error) {
        // Not authenticated
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  const loadGroups = async () => {
    try {
      const groupsData = await api.groups.list();
      setGroups(groupsData);
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  };

  const loadSessions = async () => {
    try {
      const sessionsData = await api.sessions.list();
      setSessions(sessionsData);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const setUser = (newUser: UserProfile) => {
    setUserState(newUser);
  };

  const register = async (data: any) => {
    const userData = await api.auth.register(data);
    setUserState(userData);
    await loadGroups();
    await loadSessions();
  };

  const login = async (username: string, password: string) => {
    const userData = await api.auth.login(username, password);
    await Promise.all([loadGroups(), loadSessions()]);
    setUserState(userData);
  };

  const logout = async () => {
    await api.auth.logout();
    setUserState(null);
    setGroups([]);
    setSessions([]);
  };

  const updateUserProfile = async (updates: any) => {
    const updated = await api.users.updateMe(updates);
    setUserState(updated);
  };

  const createGroup = async (name: string): Promise<Group> => {
    const newGroup = await api.groups.create(name);
    setGroups([...groups, newGroup]);
    return newGroup;
  };

  const updateGroup = async (groupId: string, updates: Partial<Group>) => {
    const updated = await api.groups.update(groupId, updates);
    setGroups(prev => prev.map(g => g.id === groupId ? updated : g));
  };

  const joinGroupByCode = async (inviteCode: string): Promise<Group> => {
    const group = await api.groups.join(inviteCode);
    setGroups([...groups, group]);
    // Also refresh sessions since joining a group adds user to active sessions
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

  const addMemberToGroup = async (groupId: string, memberId: string): Promise<void> => {
    const updatedGroup = await api.groups.addMember(groupId, memberId);
    setGroups(prev => prev.map(g => g.id === groupId ? updatedGroup : g));
  };

  const addParticipantToSession = (sessionId: string, userId: string) => {
    // This is handled by the backend now
    // Keep for compatibility
  };

  const generateSuggestionsForSession = (filters: any) => {
    // LOCATION GROUNDING: Get selected city from filters
    const selectedCity = (filters.locationScope || 'NYC') as City;
    const cityCoords = CITY_COORDS[selectedCity];
    
    // Log for debugging (developer console only)
    console.log('[Suggestion Pipeline] Selected city:', selectedCity);
    console.log('[Suggestion Pipeline] City center:', cityCoords);
    console.log('[Suggestion Pipeline] Filters:', filters);
    
    // CITY FILTERING: Get city-specific suggestion pool
    const citySuggestions = MOCK_SUGGESTIONS_BY_CITY[selectedCity] || [];
    console.log('[Suggestion Pipeline] Candidates before filter:', citySuggestions.length);
    
    // STRICT CITY GUARDRAIL: Only suggestions matching selected city
    const filteredByCity = citySuggestions.filter(s => s.city === selectedCity);
    console.log('[Suggestion Pipeline] Candidates after city filter:', filteredByCity.length);
    
    // RANKING: Score based on filters (budget, energy, category match)
    const scoredSuggestions = filteredByCity.map(suggestion => {
      let score = 0;
      
      // Budget match (exact match = +3, close match = +1)
      if (suggestion.budget === filters.budget) score += 3;
      else if (Math.abs(suggestion.budget.length - filters.budget.length) <= 1) score += 1;
      
      // Category match (if suggestion tags include any filter categories)
      const filterCategories = Array.isArray(filters.category) ? filters.category : [filters.category];
      const categoryMatch = suggestion.tags.some((tag: string) => 
        filterCategories.some((cat: string) => tag.toLowerCase().includes(cat.toLowerCase()))
      );
      if (categoryMatch) score += 2;
      
      // Rating boost
      score += parseFloat(suggestion.rating.toString()) || 0;
      
      return { ...suggestion, score };
    });
    
    // Sort by score descending and return top 4
    const topSuggestions = scoredSuggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    
    console.log('[Suggestion Pipeline] Top suggestions:', topSuggestions.length);
    
    return topSuggestions;
  };

  const startSession = async (groupId: string, initialFilters: any, name?: string) => {
    const session = await api.sessions.create({
      groupId,
      name,
      filters: initialFilters,
      guardrails: {
        minTurnout: 'balanced',
        priority: 'turnout',
      },
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
        await api.suggestions.create({
          sessionId: session.id,
          ...suggestion
        });
      }
      
      console.log('[Session] Fetched suggestions from APIs:', result.meta);
    } catch (error) {
      console.error('[Session] API fetch failed, using fallback:', error);
      const suggestions = generateSuggestionsForSession(initialFilters);
      for (const mockSugg of suggestions) {
        const { id, votes, score, ...suggestionData } = mockSugg as any;
        await api.suggestions.create({
          sessionId: session.id,
          ...suggestionData
        });
      }
    }

    await api.messages.create({
      sessionId: session.id,
      sender: 'system',
      text: 'Planning session started. @Planner is listening.'
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
        if (exists) {
          return prev.map(s => s.id === id ? sessionData : s);
        }
        return [...prev, sessionData];
      });
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  };

  const addMessage = async (sessionId: string, text: string) => {
    // Check if this is a planner message (case-insensitive)
    if (text.toLowerCase().includes('@planner') || text.toLowerCase().startsWith('planner ')) {
      // Don't save user message here - the planner endpoint will save it
      // Just trigger the streaming planner response
      return;
    }
    
    // Regular message - save to database
    await api.messages.create({
      sessionId,
      sender: user?.id || 'user',
      text
    });

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
      const generator = api.planner.stream(sessionId, text);
      while (true) {
        const { value, done } = await generator.next();
        if (done) {
          if (value && typeof value === 'object' && 'suggestionsUpdated' in value) {
            suggestionsUpdated = value.suggestionsUpdated;
          }
          break;
        }
        if (typeof value === 'string') {
          fullResponse += value;
          onStream(value);
        }
      }
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
    await api.sessions.update(sessionId, {
      status: 'locked',
      winningOptionId: suggestionId
    });
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
        midpointLat: filters.midpointLat,
        midpointLng: filters.midpointLng,
      });
      
      for (const suggestion of result.suggestions) {
        await api.suggestions.create({
          sessionId,
          ...suggestion
        });
      }
      
      console.log('[Suggestions] Fetched from APIs:', result.meta);
    } catch (error) {
      console.error('[Suggestions] API fetch failed, using fallback:', error);
      const suggestions = generateSuggestionsForSession(freshSession.filters);
      for (const mockSugg of suggestions) {
        const { id, votes, score, ...suggestionData } = mockSugg as any;
        await api.suggestions.create({
          sessionId,
          ...suggestionData
        });
      }
    }
    
    await api.messages.create({
      sessionId,
      sender: 'system',
      text: 'Options regenerated based on updated filters.'
    });
    
    await refreshSession(sessionId);
  };

  const deleteSession = async (sessionId: string) => {
    // Backend enforces admin-only access via isGroupAdmin middleware
    await api.sessions.delete(sessionId);
    // Remove session from local state
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  const leaveSession = async (sessionId: string) => {
    // Backend enforces participant-only access
    await api.sessions.leave(sessionId);
    await refreshSession(sessionId);
  };

  const updateUserLocation = async (lat: string, lng: string, permission: string) => {
    const updatedUser = await api.users.updateLocation(lat, lng, permission);
    setUserState(updatedUser);
  };

  const refreshGroups = loadGroups;
  const refreshSessions = loadSessions;

  const value: AppContextType = {
    user,
    groups,
    sessions,
    isLoading,
    setUser,
    register,
    login,
    logout,
    updateUserProfile,
    updateUserLocation,
    createGroup,
    startSession,
    getSession,
    refreshSession,
    deleteSession,
    leaveSession,
    addMessage,
    sendPlannerMessage,
    upvoteForSuggestion,
    downvoteForSuggestion,
    confirmPlan,
    updateSessionFilters,
    regenerateSuggestions,
    addMemberToGroup,
    addParticipantToSession,
    updateGroup,
    joinGroupByCode,
    refreshGroups,
    refreshSessions,
    isGroupLocked,
    isAdmin,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
