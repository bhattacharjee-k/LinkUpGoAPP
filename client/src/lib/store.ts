
// --- Types ---
export type City = 'NYC' | 'Chicago';
export type Day = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
export type TimeBlock = 'Day' | 'Evening' | 'Night';
export type Budget = '$' | '$$' | '$$$' | '$$$$';
export type Energy = 'Chill' | 'Vibey' | 'Going out' | 'Full send';

export interface Availability {
  [key: string]: boolean; // key format: "Day-TimeBlock" e.g., "Fri-Night"
}

export type Category = 
  // Food & Drink
  | 'Dinner' | 'Drinks' | 'Brunch' | 'Cafe' | 'Coffee' | 'Dive Bar' | 'Cocktails' | 'Wine Bar' | 'Brewery'
  // Going Out
  | 'Club' | 'Lounge' | 'Rooftop' | 'Speakeasy' | 'Live Music' | 'Dancing'
  // Activities
  | 'Activity' | 'Bowling' | 'Karaoke' | 'Comedy' | 'Arcade' | 'Museum' | 'Walk'
  // Social Modes (Abstract/Vibe)
  | 'Conversation' | 'Meeting New People' | 'Big Group' | 'Date Night';

export type HardNo = 'Clubs' | 'Loud places' | 'Ticketed events' | 'Late nights' | 'Expensive spots';

export interface UserProfile {
  id: string;
  name: string;
  city: City;
  budget: Budget[];
  energy: Energy;
  categories: Category[]; // Interests
  hardNos: string[]; // Using string array to be flexible, but could be HardNo[]
}

export interface Group {
  id: string;
  name: string;
  members: string[]; // User IDs
  inviteCode?: string; // For external sharing
  adminId?: string; // ID of the group admin (creator)
  locked?: boolean; // If true, new members cannot join via invite link
}

export interface Suggestion {
  id: string;
  name: string;
  source: 'Web' | 'Beli' | 'Partiful' | 'Posh.vip';
  rating: number;
  turnout: string; // e.g. "5/6"
  distance: string;
  budget: Budget;
  description: string;
  tags: string[];
  votes: Record<string, 'yes' | 'no' | 'fire' | 'cant'>; // userId -> vote
}

export interface ChatMessage {
  id: string;
  sender: string; // 'user' | 'system' | 'planner-ai'
  text: string;
  timestamp: number;
}

export interface PlanningSession {
  id: string;
  name?: string; // Optional name for the plan (e.g. "Friday Drinks")
  groupId: string;
  status: 'draft' | 'voting' | 'locked';
  lockedByUserId?: string;
  lockedAt?: number;
  winningOptionId?: string;
  participantStatusByUserId: Record<string, 'active' | 'cant_make_it'>; // Default 'active'
  
  filters: {
    timeWindow: string;
    locationScope: string;
    category: Category[];
    energy: Energy;
    budget: Budget;
  };
  guardrails: {
    minTurnout: 'strict' | 'balanced' | 'flexible';
    priority: 'turnout' | 'budget' | 'distance' | 'vibe';
  };
  suggestions: Suggestion[];
  messages: ChatMessage[];
  participants: string[]; // User IDs specific to this session
  inviteCode?: string; // Session specific invite
}

// --- Store ---
interface AppState {
  currentUser: UserProfile | null;
  groups: Group[];
  sessions: PlanningSession[];
  
  // Actions
  updateUser: (user: Partial<UserProfile>) => void;
  setAvailability: (availability: Availability) => void;
  createGroup: (name: string) => void;
  startSession: (groupId: string, initialFilters: any) => string;
  addMessage: (sessionId: string, text: string, sender: string) => void;
  updateSessionFilters: (sessionId: string, filters: any) => void;
  voteForSuggestion: (sessionId: string, suggestionId: string, vote: 'yes' | 'no' | 'fire' | 'cant') => void;
  confirmPlan: (sessionId: string, suggestionId: string) => void;
}

// Mock User Data for Initial State
const MOCK_USER: UserProfile = {
  id: 'me',
  name: 'Alex',
  city: 'NYC',
  budget: ['$$', '$$$'],
  energy: 'Vibey',
  categories: ['Dinner', 'Drinks'],
  hardNos: ['Dive Bar'],
  /* Availability removed from mock
  availability: {
    'Fri-Evening': true,
    'Fri-Night': true,
    'Sat-Evening': true,
    'Sat-Night': true,
  },
  */
};

export const MOCK_GROUPS: Group[] = [
  { id: 'g1', name: 'Tech Founders NYC', members: ['me', 'u2', 'u3', 'u4'], adminId: 'me', locked: false },
  { id: 'g2', name: 'West Loop Crew', members: ['me', 'u5', 'u6'], adminId: 'me', locked: false },
];

export const MOCK_SUGGESTIONS: Suggestion[] = [
  {
    id: 's1',
    name: 'Laser Wolf',
    source: 'Beli',
    rating: 4.8,
    turnout: '5/6',
    distance: '1.2 mi',
    budget: '$$$',
    description: 'Perfect for groups. High energy rooftop with incredible skewers. Matches your "Social" vibe and fits the budget.',
    tags: ['Rooftop', 'Middle Eastern', 'Views'],
    votes: {},
  },
  {
    id: 's2',
    name: 'Double Chicken Please',
    source: 'Web',
    rating: 4.9,
    turnout: '4/6',
    distance: '2.5 mi',
    budget: '$$',
    description: 'World-class cocktails in a buzzy setting. Might be a wait, but hits the "Drinks" preference perfectly.',
    tags: ['Cocktails', 'Award Winning', 'Busy'],
    votes: {},
  },
  {
    id: 's3',
    name: 'Public Records',
    source: 'Posh.vip',
    rating: 4.6,
    turnout: '6/6',
    distance: '3.0 mi',
    budget: '$$',
    description: 'Vegan cafe by day, audiophile bar by night. Great fit for the "Chill" into "Party" transition.',
    tags: ['Music', 'Vegan', 'Patio'],
    votes: {},
  },
  {
    id: 's4',
    name: 'House of X',
    source: 'Partiful',
    rating: 4.5,
    turnout: '3/6',
    distance: '1.8 mi',
    budget: '$$$$',
    description: 'Immersive theatrical club experience. A bit pricey, but guarantees a memorable night.',
    tags: ['Club', 'Performance', 'Late Night'],
    votes: {},
  },
];

// Helper to generate a simple ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// Just a simple in-memory store since I can't use zustand easily without installing it, 
// wait, I can simulate zustand behavior with a custom hook or Context if needed.
// Actually, let's just use a simple mock implementation that resets on reload for MVP speed 
// unless I want to implement full local storage sync manually.
// For the prompt "Implement data storage (auth optional for demo; can use local storage...)" 
// I will just use a simple object for now to get the UI built, 
// but actually, let's try to do a robust LocalStorage implementation.

export const saveState = (state: any) => {
  localStorage.setItem('vibecheck_state', JSON.stringify(state));
};

export const loadState = () => {
  const stored = localStorage.getItem('vibecheck_state');
  if (stored) return JSON.parse(stored);
  return {
    currentUser: null, // Start null to show onboarding
    groups: MOCK_GROUPS,
    sessions: [],
  };
};
