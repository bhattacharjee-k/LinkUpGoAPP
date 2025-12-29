import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  UserProfile, Group, PlanningSession, Suggestion, 
  loadState, saveState, MOCK_GROUPS, MOCK_SUGGESTIONS,
  Availability, City, Budget, Category, Energy 
} from './store';

interface AppContextType {
  user: UserProfile | null;
  groups: Group[];
  sessions: PlanningSession[];
  setUser: (user: UserProfile) => void;
  createGroup: (name: string) => void;
  startSession: (groupId: string, initialFilters: any, name?: string) => string;
  getSession: (id: string) => PlanningSession | undefined;
  addMessage: (sessionId: string, text: string) => void;
  voteForSuggestion: (sessionId: string, suggestionId: string, vote: 'yes' | 'no' | 'fire' | 'cant') => void;
  confirmPlan: (sessionId: string, suggestionId: string) => void;
  addMemberToGroup: (groupId: string, userId: string) => void;
  addParticipantToSession: (sessionId: string, userId: string) => void;
  updateGroup: (groupId: string, updates: Partial<Group>) => void;
  isGroupLocked: (groupId: string) => boolean;
  isAdmin: (groupId: string) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(() => loadState());
  const [user, setUserState] = useState<UserProfile | null>(state.currentUser);
  const [groups, setGroups] = useState<Group[]>(state.groups);
  const [sessions, setSessions] = useState<PlanningSession[]>(state.sessions);

  // Persistence effect
  useEffect(() => {
    const newState = { currentUser: user, groups, sessions };
    saveState(newState);
  }, [user, groups, sessions]);

  const setUser = (newUser: UserProfile) => {
    setUserState(newUser);
  };

  const createGroup = (name: string) => {
    const newGroup: Group = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      members: [user?.id || 'me'],
      inviteCode: Math.random().toString(36).substr(2, 6).toUpperCase(),
      adminId: user?.id || 'me',
      locked: false,
    };
    setGroups([...groups, newGroup]);
  };

  const updateGroup = (groupId: string, updates: Partial<Group>) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, ...updates } : g));
  };
  
  const isGroupLocked = (groupId: string) => {
      const group = groups.find(g => g.id === groupId);
      return group?.locked || false;
  };

  const isAdmin = (groupId: string) => {
      const group = groups.find(g => g.id === groupId);
      return group?.adminId === (user?.id || 'me');
  };

  const addMemberToGroup = (groupId: string, userId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (group?.locked) return; // Prevent join if locked
    
    setGroups(prev => prev.map(g => {
        if (g.id !== groupId) return g;
        if (g.members.includes(userId)) return g;
        return { ...g, members: [...g.members, userId] };
    }));
  };

  const addParticipantToSession = (sessionId: string, userId: string) => {
    setSessions(prev => prev.map(s => {
        if (s.id !== sessionId) return s;
        if (s.participants?.includes(userId)) return s;
        return { 
          ...s, 
          participants: [...(s.participants || []), userId],
          participantStatusByUserId: { ...(s.participantStatusByUserId || {}), [userId]: 'active' }
        };
    }));
  };

  const startSession = (groupId: string, initialFilters: any, name?: string) => {
    const creatorId = user?.id || 'me';
    const newSession: PlanningSession = {
      id: Math.random().toString(36).substr(2, 9),
      groupId,
      name,
      status: 'voting',
      filters: initialFilters,
      guardrails: {
        minTurnout: 'balanced',
        priority: 'turnout',
      },
      suggestions: MOCK_SUGGESTIONS.map(s => ({...s, votes: {}})), // Reset votes
      participants: [creatorId], // Creator is participant
      participantStatusByUserId: { [creatorId]: 'active' },
      inviteCode: initialFilters.inviteCode || Math.random().toString(36).substr(2, 6).toUpperCase(),
      messages: [
        { id: 'msg1', sender: 'system', text: 'Planning session started. @Planner is listening.', timestamp: Date.now() }
      ],
    };
    setSessions([...sessions, newSession]);
    return newSession.id;
  };

  const getSession = (id: string) => sessions.find(s => s.id === id);

  const addMessage = (sessionId: string, text: string) => {
    setSessions(prev => prev.map(session => {
      if (session.id !== sessionId) return session;

      const newMessages = [
        ...session.messages,
        { id: Math.random().toString(), sender: 'user', text, timestamp: Date.now() }
      ];

      // Simple AI Trigger Logic
      if (text.includes('@Planner')) {
        setTimeout(() => {
          setSessions(currentSessions => currentSessions.map(s => {
            if (s.id !== sessionId) return s;
            
            // "AI" Logic: Shuffle or re-rank suggestions
            const newSuggestions = [...s.suggestions].sort(() => Math.random() - 0.5);
            
            return {
              ...s,
              suggestions: newSuggestions,
              messages: [
                ...s.messages,
                { id: Math.random().toString(), sender: 'planner-ai', text: 'I heard you! I\'ve adjusted the ranking based on your feedback.', timestamp: Date.now() }
              ]
            };
          }));
        }, 1500);
      }

      return { ...session, messages: newMessages };
    }));
  };

  const voteForSuggestion = (sessionId: string, suggestionId: string, vote: 'yes' | 'no' | 'fire' | 'cant') => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      
      const userId = user?.id || 'me';
      const isCantVote = vote === 'cant';
      
      // Update participant status if "cant"
      const updatedParticipantStatus = { ...s.participantStatusByUserId };
      if (isCantVote) {
        updatedParticipantStatus[userId] = 'cant_make_it';
      } else if (updatedParticipantStatus[userId] === 'cant_make_it' && !isCantVote) {
         // Reverting back to active if they vote something else? 
         // Logic says "When user votes cant on ANY option", but maybe we just mark them cant make it globally for now?
         // The requirement says: "When user votes 🚫 on any option: set participantStatusByUserId[userId] = 'cant_make_it'"
         // But what if they vote yes on another? Let's assume 'cant' on an option means they can't make IT (the event) or just that option?
         // Reading carefully: "Users marked cant_make_it ... their votes must not affect scoring/winner"
         // This implies 'cant_make_it' is a global session status for that user.
         // Let's assume clicking the "Can't" button on an option effectively means "I can't make this option".
         // BUT the prompt says "Users marked cant_make_it: remain visible... can still view".
         // And "When user votes 🚫 on any option: set participantStatusByUserId[userId] = 'cant_make_it'".
         // This sounds like a global "I'm out" trigger. Let's implement it as such for safety, or maybe just per option?
         // "When user votes 🚫 on any option" -> implies it's an option-level vote that triggers global status.
         // Let's stick to: If you vote 'cant' on a suggestion, we assume you are saying "I can't make it to this event at all" or just this option?
         // "Users marked cant_make_it ... their votes must not affect scoring/winner". 
         // If I vote 'cant' on Option A, do my 'yes' votes on Option B count?
         // If `participantStatus` is global 'cant_make_it', then NO votes count.
         // So clicking 'Can't' seems to be a "I'm out of this plan" button disguised as a vote.
         // Let's verify: "vote buttons: Yes / No / Fire / Can't".
         // If I can't go to Laser Wolf (Option A), but I can go to McDonald's (Option B), I should vote 'No' on A and 'Yes' on B.
         // 'Can't' likely means "I cannot attend this plan at all".
         // Let's treat 'cant' as "I can't make it to the plan".
         updatedParticipantStatus[userId] = 'cant_make_it';
      } else {
         updatedParticipantStatus[userId] = 'active';
      }

      return {
        ...s,
        participantStatusByUserId: updatedParticipantStatus,
        suggestions: s.suggestions.map(suggestion => {
          if (suggestion.id !== suggestionId) return suggestion;
          const currentVote = suggestion.votes[userId];
          const newVotes = { ...suggestion.votes };
          
          if (currentVote === vote) {
            delete newVotes[userId]; // Toggle off
          } else {
            newVotes[userId] = vote;
          }
          
          return { ...suggestion, votes: newVotes };
        })
      };
    }));
  };

  const confirmPlan = (sessionId: string, suggestionId: string) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      return { 
          ...s, 
          status: 'locked', 
          winningOptionId: suggestionId,
          lockedByUserId: user?.id || 'me',
          lockedAt: Date.now()
      };
    }));
  };
  
  return (
    <AppContext.Provider value={{ 
      user, groups, sessions, setUser, createGroup, startSession, getSession, addMessage, voteForSuggestion, confirmPlan, addMemberToGroup, addParticipantToSession,
      updateGroup, isGroupLocked, isAdmin
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
