import * as SecureStore from 'expo-secure-store';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5003';
const API_URL = `${API_BASE}/api`;

const TOKEN_KEY = 'linkupgo_access_token';
const REFRESH_TOKEN_KEY = 'linkupgo_refresh_token';

// In-memory cache so tokens are available immediately after setTokens
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

export async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;
  cachedAccessToken = await SecureStore.getItemAsync(TOKEN_KEY);
  return cachedAccessToken;
}

export async function getRefreshToken(): Promise<string | null> {
  if (cachedRefreshToken) return cachedRefreshToken;
  cachedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  return cachedRefreshToken;
}

export async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  cachedAccessToken = accessToken;
  cachedRefreshToken = refreshToken;
  await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
}

export async function clearTokens(): Promise<void> {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return false;

      const response = await fetch(`${API_URL}/auth/mobile/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      await setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchAPI(url: string, options?: RequestInit) {
  const token = await getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers,
  });

  // Auto-refresh on 401
  if (response.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const newToken = await getAccessToken();
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(`${API_URL}${url}`, {
        ...options,
        headers,
      });
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    const err = new Error(error.message || 'Request failed') as Error & { status?: number; code?: string };
    err.status = response.status;
    err.code = error.code;
    throw err;
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
}

export const api = {
  // Mobile Auth
  auth: {
    register: (data: any) =>
      fetchAPI('/auth/mobile/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (username: string, password: string) =>
      fetchAPI('/auth/mobile/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    me: () => fetchAPI('/auth/me'),
    checkUsername: (username: string) =>
      fetchAPI(`/auth/username-available?username=${encodeURIComponent(username)}`),
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
    addMember: (groupId: string, memberId: string) =>
      fetchAPI(`/groups/${groupId}/members`, { method: 'POST', body: JSON.stringify({ memberId }) }),
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
    addParticipant: (id: string, status?: string, memberId?: string) =>
      fetchAPI(`/sessions/${id}/participants`, { method: 'POST', body: JSON.stringify({ status, memberId }) }),
  },

  // Suggestions
  suggestions: {
    create: (data: any) => fetchAPI('/suggestions', { method: 'POST', body: JSON.stringify(data) }),
    deleteForSession: (sessionId: string) => fetchAPI(`/sessions/${sessionId}/suggestions`, { method: 'DELETE' }),
    replace: (sessionId: string, suggestionId: string) =>
      fetchAPI(`/sessions/${sessionId}/suggestions/${suggestionId}/replace`, { method: 'POST' }),
    fetch: (data: any) => fetchAPI('/suggest', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Votes
  votes: {
    upvote: (suggestionId: string) =>
      fetchAPI('/votes', { method: 'POST', body: JSON.stringify({ suggestionId, voteType: 'up' }) }),
    downvote: (suggestionId: string, reasons: string[], note?: string) =>
      fetchAPI('/votes', { method: 'POST', body: JSON.stringify({ suggestionId, voteType: 'down', reasons, note }) }),
    remove: (suggestionId: string) => fetchAPI(`/votes/${suggestionId}`, { method: 'DELETE' }),
  },

  // Messages
  messages: {
    create: (data: any) => fetchAPI('/messages', { method: 'POST', body: JSON.stringify(data) }),
  },

  // Planner AI (SSE streaming)
  planner: {
    getStreamUrl: (sessionId: string) => `${API_URL}/sessions/${sessionId}/planner`,
  },

  // Notifications
  notifications: {
    list: () => fetchAPI('/notifications'),
    unreadCount: () => fetchAPI('/notifications/unread-count'),
    markAsRead: (id: string) => fetchAPI('/notifications/read', { method: 'POST', body: JSON.stringify({ id }) }),
    markAllAsRead: () => fetchAPI('/notifications/read-all', { method: 'POST' }),
    getPrefs: () => fetchAPI('/notification-prefs'),
    updatePrefs: (emailEnabled: boolean) =>
      fetchAPI('/notification-prefs', { method: 'POST', body: JSON.stringify({ emailEnabled }) }),
  },

  // Feedback
  feedback: {
    get: (sessionId: string) => fetchAPI(`/sessions/${sessionId}/feedback`),
    submit: (sessionId: string, data: { rating: number; review?: string; tags?: string[]; wouldRecommend?: boolean | null; suggestionId?: string }) =>
      fetchAPI(`/sessions/${sessionId}/feedback`, { method: 'POST', body: JSON.stringify(data) }),
    venueRating: (name: string) => fetchAPI(`/feedback/venue/${encodeURIComponent(name)}`),
  },

  // Places
  places: {
    autocomplete: (query: string, city: string) =>
      fetchAPI('/places/autocomplete', { method: 'POST', body: JSON.stringify({ query, city }) }),
  },
};

export function getWebSocketUrl(): string {
  const wsBase = API_BASE.replace(/^http/, 'ws');
  return `${wsBase}/ws`;
}

export function fetchSSE(
  url: string,
  body: any,
  onData: (data: any) => void
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const token = await getAccessToken();
    const xhr = new XMLHttpRequest();
    let lastIndex = 0;

    xhr.open('POST', `${API_URL}${url}`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.onprogress = () => {
      const newText = xhr.responseText.substring(lastIndex);
      lastIndex = xhr.responseText.length;

      const lines = newText.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.error) {
              reject(new Error(data.error));
              xhr.abort();
              return;
            }
            onData(data);
          } catch {}
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.message || `Request failed (${xhr.status})`));
        } catch {
          reject(new Error(`Request failed (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('SSE connection failed'));
    xhr.ontimeout = () => reject(new Error('SSE request timed out'));
    xhr.timeout = 120000;

    xhr.send(JSON.stringify(body));
  });
}
