import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { MOCK_SUGGESTIONS } from './store';

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  city: string;
  budget: string[];
  energy: string;
  categories: string[];
  hardNos: string[];
}

export interface Group {
  id: string;
  name: string;
  members: string[];
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
  votes: Record<string, string>;
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
  createGroup: (name: string) => Promise<void>;
  startSession: (groupId: string, initialFilters: any, name?: string) => Promise<string>;
  getSession: (id: string) => PlanningSession | undefined;
  refreshSession: (id: string) => Promise<void>;
  addMessage: (sessionId: string, text: string) => Promise<void>;
  voteForSuggestion: (sessionId: string, suggestionId: string, vote: string) => Promise<void>;
  confirmPlan: (sessionId: string, suggestionId: string) => Promise<void>;
  updateSessionFilters: (sessionId: string, filters: any) => Promise<void>;
  regenerateSuggestions: (sessionId: string) => Promise<void>;
  addMemberToGroup: (groupId: string, userId: string) => void;
  addParticipantToSession: (sessionId: string, userId: string) => void;
  updateGroup: (groupId: string, updates: Partial<Group>) => Promise<void>;
  joinGroupByCode: (inviteCode: string) => Promise<void>;
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
    setUserState(userData);
    await loadGroups();
    await loadSessions();
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

  const joinGroupByCode = async (inviteCode: string) => {
    const group = await api.groups.join(inviteCode);
    setGroups([...groups, group]);
  };
  
  const isGroupLocked = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    return group?.locked || false;
  };

  const isAdmin = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    return group?.adminId === user?.id;
  };

  const addMemberToGroup = (groupId: string, userId: string) => {
    // This is handled by the backend now via joinGroupByCode
    // Keep for compatibility
  };

  const addParticipantToSession = (sessionId: string, userId: string) => {
    // This is handled by the backend now
    // Keep for compatibility
  };

  const startSession = async (groupId: string, initialFilters: any, name?: string) => {
    // Generate mock suggestions for now (will be replaced with AI later)
    const session = await api.sessions.create({
      groupId,
      name,
      filters: initialFilters,
      guardrails: {
        minTurnout: 'balanced',
        priority: 'turnout',
      }
    });

    // Create mock suggestions (exclude hardcoded id, let server generate)
    for (const mockSugg of MOCK_SUGGESTIONS) {
      const { id, votes, ...suggestionData } = mockSugg;
      await api.suggestions.create({
        sessionId: session.id,
        ...suggestionData
      });
    }

    // Add initial system message
    await api.messages.create({
      sessionId: session.id,
      sender: 'system',
      text: 'Planning session started. @Planner is listening.'
    });

    await loadSessions();
    return session.id;
  };

  const getSession = (id: string) => sessions.find(s => s.id === id);

  const refreshSession = async (id: string) => {
    try {
      const sessionData = await api.sessions.get(id);
      setSessions(prev => prev.map(s => s.id === id ? sessionData : s));
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  };

  const addMessage = async (sessionId: string, text: string) => {
    await api.messages.create({
      sessionId,
      sender: user?.id || 'user',
      text
    });

    // Simple AI trigger logic
    if (text.includes('@Planner')) {
      setTimeout(async () => {
        await api.messages.create({
          sessionId,
          sender: 'planner-ai',
          text: 'I heard you! I\'ve adjusted the ranking based on your feedback.'
        });
        await refreshSession(sessionId);
      }, 1500);
    }

    await refreshSession(sessionId);
  };

  const voteForSuggestion = async (sessionId: string, suggestionId: string, vote: string) => {
    await api.votes.vote(suggestionId, vote);

    // Update participant status if voting "cant"
    if (vote === 'cant' && user?.id) {
      await api.sessions.updateParticipantStatus(sessionId, user.id, 'cant_make_it');
    }

    await refreshSession(sessionId);
  };

  const confirmPlan = async (sessionId: string, suggestionId: string) => {
    await api.sessions.update(sessionId, {
      status: 'locked',
      lockedByUserId: user?.id,
      lockedAt: new Date(),
      winningOptionId: suggestionId
    });
    await refreshSession(sessionId);
  };

  const updateSessionFilters = async (sessionId: string, filters: any) => {
    await api.sessions.update(sessionId, { filters });
    await refreshSession(sessionId);
  };

  const regenerateSuggestions = async (sessionId: string) => {
    // Delete existing suggestions first
    await api.suggestions.deleteForSession(sessionId);
    
    // Create new ones based on updated filters
    // For MVP, we just regenerate mock suggestions
    for (const mockSugg of MOCK_SUGGESTIONS) {
      const { id, votes, ...suggestionData } = mockSugg;
      await api.suggestions.create({
        sessionId,
        ...suggestionData
      });
    }
    
    await api.messages.create({
      sessionId,
      sender: 'system',
      text: 'Options regenerated based on updated filters.'
    });
    
    await refreshSession(sessionId);
  };

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
    createGroup,
    startSession,
    getSession,
    refreshSession,
    addMessage,
    voteForSuggestion,
    confirmPlan,
    updateSessionFilters,
    regenerateSuggestions,
    addMemberToGroup,
    addParticipantToSession,
    updateGroup,
    joinGroupByCode,
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
