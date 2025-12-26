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
  startSession: (groupId: string, initialFilters: any) => string;
  getSession: (id: string) => PlanningSession | undefined;
  addMessage: (sessionId: string, text: string) => void;
  voteForSuggestion: (sessionId: string, suggestionId: string, vote: 'yes' | 'no' | 'fire') => void;
  confirmPlan: (sessionId: string, suggestionId: string) => void;
  toggleAvailability: (dayTime: string) => void;
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
    };
    setGroups([...groups, newGroup]);
  };

  const startSession = (groupId: string, initialFilters: any) => {
    const newSession: PlanningSession = {
      id: Math.random().toString(36).substr(2, 9),
      groupId,
      status: 'planning',
      filters: initialFilters,
      guardrails: {
        minTurnout: 'balanced',
        priority: 'turnout',
      },
      suggestions: MOCK_SUGGESTIONS.map(s => ({...s, votes: {}})), // Reset votes
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

  const voteForSuggestion = (sessionId: string, suggestionId: string, vote: 'yes' | 'no' | 'fire') => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      return {
        ...s,
        suggestions: s.suggestions.map(suggestion => {
          if (suggestion.id !== suggestionId) return suggestion;
          const currentVote = suggestion.votes[user?.id || 'me'];
          const newVotes = { ...suggestion.votes };
          
          if (currentVote === vote) {
            delete newVotes[user?.id || 'me']; // Toggle off
          } else {
            newVotes[user?.id || 'me'] = vote;
          }
          
          return { ...suggestion, votes: newVotes };
        })
      };
    }));
  };

  const confirmPlan = (sessionId: string, suggestionId: string) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      return { ...s, status: 'confirmed', finalChoiceId: suggestionId };
    }));
  };
  
  const toggleAvailability = (dayTime: string) => {
    if (!user) return;
    const newAvail = { ...user.availability };
    if (newAvail[dayTime]) {
      delete newAvail[dayTime];
    } else {
      newAvail[dayTime] = true;
    }
    setUser({ ...user, availability: newAvail });
  };

  return (
    <AppContext.Provider value={{ 
      user, groups, sessions, setUser, createGroup, startSession, getSession, addMessage, voteForSuggestion, confirmPlan, toggleAvailability 
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
