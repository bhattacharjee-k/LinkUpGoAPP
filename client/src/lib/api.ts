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
  
  return response.json();
}

export const api = {
  // Auth
  auth: {
    register: (data: any) => fetchAPI('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (username: string, password: string) => fetchAPI('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => fetchAPI('/auth/logout', { method: 'POST' }),
    me: () => fetchAPI('/auth/me'),
  },
  
  // Users
  users: {
    updateMe: (data: any) => fetchAPI('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  },
  
  // Groups
  groups: {
    list: () => fetchAPI('/groups'),
    get: (id: string) => fetchAPI(`/groups/${id}`),
    create: (name: string) => fetchAPI('/groups', { method: 'POST', body: JSON.stringify({ name }) }),
    update: (id: string, updates: any) => fetchAPI(`/groups/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    join: (inviteCode: string) => fetchAPI(`/groups/join/${inviteCode}`, { method: 'POST' }),
  },
  
  // Sessions
  sessions: {
    list: () => fetchAPI('/sessions'),
    get: (id: string) => fetchAPI(`/sessions/${id}`),
    create: (data: any) => fetchAPI('/sessions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, updates: any) => fetchAPI(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
    addParticipant: (id: string, status?: string) => fetchAPI(`/sessions/${id}/participants`, { method: 'POST', body: JSON.stringify({ status }) }),
    updateParticipantStatus: (sessionId: string, participantId: string, status: string) => 
      fetchAPI(`/sessions/${sessionId}/participants/${participantId}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
  
  // Suggestions
  suggestions: {
    create: (data: any) => fetchAPI('/suggestions', { method: 'POST', body: JSON.stringify(data) }),
  },
  
  // Votes
  votes: {
    vote: (suggestionId: string, vote: string) => fetchAPI('/votes', { method: 'POST', body: JSON.stringify({ suggestionId, vote }) }),
  },
  
  // Messages
  messages: {
    create: (data: any) => fetchAPI('/messages', { method: 'POST', body: JSON.stringify(data) }),
  },
};
