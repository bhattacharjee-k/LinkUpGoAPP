// API client for backend communication

const API_BASE = '/api';

async function fetchAPI(url: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }
  
  // Handle 204 No Content responses
  if (response.status === 204) {
    return {};
  }
  
  return response.json();
}

export const api = {
  // Auth
  auth: {
    register: (data: any) => fetchAPI('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (username: string, password: string) => fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => fetchAPI('/auth/logout', { method: 'POST' }),
    me: () => fetchAPI('/auth/me'),
    checkUsername: (username: string) => fetchAPI(`/auth/username-available?username=${encodeURIComponent(username)}`),
  },
  
  // Users
  users: {
    updateMe: (data: any) => fetchAPI('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
    updateLocation: (lat: string, lng: string, permission: string) => 
      fetchAPI('/users/me/location', { method: 'PATCH', body: JSON.stringify({ lat, lng, permission }) }),
  },
  
  // Groups
  groups: {
    list: () => fetchAPI('/groups'),
    get: (id: string) => fetchAPI(`/groups/${id}`),
    create: (name: string) => fetchAPI('/groups', { method: 'POST', body: JSON.stringify({ name }) }),
    update: (id: string, updates: any) => fetchAPI(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    join: (inviteCode: string) => fetchAPI(`/groups/join/${inviteCode}`, { method: 'POST' }),
    addMember: (groupId: string, memberId: string) => fetchAPI(`/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ memberId }) }),
  },
  
  // Sessions
  sessions: {
    list: () => fetchAPI('/sessions'),
    get: (id: string) => fetchAPI(`/sessions/${id}`),
    create: (data: any) => fetchAPI('/sessions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, updates: any) => fetchAPI(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    delete: (id: string) => fetchAPI(`/sessions/${id}`, { method: 'DELETE' }),
    leave: (id: string) => fetchAPI(`/sessions/${id}/leave`, { method: 'POST' }),
    join: (inviteCode: string) => fetchAPI(`/sessions/join/${inviteCode}`, { method: 'POST' }),
    addParticipant: (id: string, status?: string, memberId?: string) => fetchAPI(`/sessions/${id}/participants`, { method: 'POST', body: JSON.stringify({ status, memberId }) }),
    updateParticipantStatus: (sessionId: string, participantId: string, status: string) => 
      fetchAPI(`/sessions/${sessionId}/participants/${participantId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    updateParticipantNeighborhood: (sessionId: string, participantId: string, neighborhood: string) =>
      fetchAPI(`/sessions/${sessionId}/participants/${participantId}/neighborhood`, { method: 'PATCH', body: JSON.stringify({ neighborhood }) }),
  },
  
  // Suggestions
  suggestions: {
    create: (data: any) => fetchAPI('/suggestions', { method: 'POST', body: JSON.stringify(data) }),
    deleteForSession: (sessionId: string) => fetchAPI(`/sessions/${sessionId}/suggestions`, { method: 'DELETE' }),
    replace: (sessionId: string, suggestionId: string) => fetchAPI(`/sessions/${sessionId}/suggestions/${suggestionId}/replace`, { method: 'POST' }),
    fetch: (data: {
      city: string;
      neighborhood?: string;
      userLat?: number;
      userLng?: number;
      categories: string[];
      budget?: string;
      energy?: string;
      timeWindow?: string;
      specificDate?: string;
      specificTime?: string;
    }) => fetchAPI('/suggest', { method: 'POST', body: JSON.stringify(data) }),
  },
  
  // Votes
  votes: {
    upvote: (suggestionId: string) => fetchAPI('/votes', { method: 'POST', body: JSON.stringify({ suggestionId, voteType: 'up' }) }),
    downvote: (suggestionId: string, reasons: string[], note?: string) => fetchAPI('/votes', { method: 'POST', body: JSON.stringify({ suggestionId, voteType: 'down', reasons, note }) }),
    remove: (suggestionId: string) => fetchAPI(`/votes/${suggestionId}`, { method: 'DELETE' }),
  },
  
  // Messages
  messages: {
    create: (data: any) => fetchAPI('/messages', { method: 'POST', body: JSON.stringify(data) }),
  },
  
  // Planner AI
  planner: {
    stream: async function*(sessionId: string, message: string): AsyncGenerator<string, { suggestionsUpdated: boolean } | void, unknown> {
      const response = await fetch(`${API_BASE}/sessions/${sessionId}/planner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message }),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Request failed' }));
        throw new Error(error.message || 'Planner request failed');
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Stream not available');
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (value) {
          buffer += decoder.decode(value, { stream: true });
        }
        
        if (done) {
          buffer += decoder.decode();
        }
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        let returnValue: { suggestionsUpdated: boolean } | undefined;
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                yield data.content;
              } else if (data.error) {
                throw new Error(data.error);
              } else if (data.done) {
                returnValue = { suggestionsUpdated: data.suggestionsUpdated || false };
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
        
        if (returnValue) {
          return returnValue;
        }
        
        if (done) break;
      }
    },
  },

  // Notifications
  notifications: {
    list: () => fetchAPI('/notifications'),
    unreadCount: () => fetchAPI('/notifications/unread-count'),
    markAsRead: (id: string) => fetchAPI('/notifications/read', { method: 'POST', body: JSON.stringify({ id }) }),
    markAllAsRead: () => fetchAPI('/notifications/read-all', { method: 'POST' }),
    getPrefs: () => fetchAPI('/notification-prefs'),
    updatePrefs: (emailEnabled: boolean) => fetchAPI('/notification-prefs', { method: 'POST', body: JSON.stringify({ emailEnabled }) }),
  },

  feedback: {
    get: (sessionId: string) => fetchAPI(`/sessions/${sessionId}/feedback`),
    submit: (sessionId: string, data: { rating: number; review?: string; tags?: string[]; wouldRecommend?: boolean | null; suggestionId?: string }) =>
      fetchAPI(`/sessions/${sessionId}/feedback`, { method: 'POST', body: JSON.stringify(data) }),
    venueRating: (name: string) => fetchAPI(`/feedback/venue/${encodeURIComponent(name)}`),
  },
};
