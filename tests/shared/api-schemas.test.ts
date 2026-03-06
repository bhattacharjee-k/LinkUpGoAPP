import { describe, it, expect } from 'vitest';
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  SuggestRequestSchema,
  CreateGroupRequestSchema,
  CreateSessionRequestSchema,
  VoteRequestSchema,
  CreateMessageRequestSchema,
  CreateSuggestionRequestSchema,
} from '@shared/api-schemas';

describe('LoginRequestSchema', () => {
  it('accepts valid login', () => {
    const result = LoginRequestSchema.safeParse({ username: 'alice', password: 'pass123' });
    expect(result.success).toBe(true);
  });

  it('rejects empty username', () => {
    const result = LoginRequestSchema.safeParse({ username: '', password: 'pass123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = LoginRequestSchema.safeParse({ username: 'alice', password: '' });
    expect(result.success).toBe(false);
  });
});

describe('RegisterRequestSchema', () => {
  const validData = {
    username: 'alice',
    password: 'pass123',
    name: 'Alice',
    city: 'NYC',
    budget: ['$$'],
    energy: 'Vibey',
    categories: ['Drinks'],
    hardNos: [],
  };

  it('accepts valid registration', () => {
    const result = RegisterRequestSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('rejects short username', () => {
    const result = RegisterRequestSchema.safeParse({ ...validData, username: 'ab' });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = RegisterRequestSchema.safeParse({ ...validData, password: '12345' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid city', () => {
    const result = RegisterRequestSchema.safeParse({ ...validData, city: 'LA' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid energy level', () => {
    const result = RegisterRequestSchema.safeParse({ ...validData, energy: 'EXTREME' });
    expect(result.success).toBe(false);
  });

  it('rejects empty categories', () => {
    const result = RegisterRequestSchema.safeParse({ ...validData, categories: [] });
    expect(result.success).toBe(false);
  });

  it('rejects empty budget array', () => {
    const result = RegisterRequestSchema.safeParse({ ...validData, budget: [] });
    expect(result.success).toBe(false);
  });

  it('accepts optional email', () => {
    const result = RegisterRequestSchema.safeParse({ ...validData, email: 'alice@test.com' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email format', () => {
    const result = RegisterRequestSchema.safeParse({ ...validData, email: 'not-email' });
    expect(result.success).toBe(false);
  });
});

describe('SuggestRequestSchema', () => {
  it('accepts minimal valid request', () => {
    const result = SuggestRequestSchema.safeParse({
      city: 'NYC',
      categories: ['Drinks'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts full request with all optional fields', () => {
    const result = SuggestRequestSchema.safeParse({
      city: 'NYC',
      categories: ['Drinks', 'Food'],
      budget: '$$',
      energy: 'Vibey',
      neighborhood: 'East Village',
      userLat: 40.7282,
      userLng: -73.9942,
      timeWindow: 'tonight',
      specificDate: '2025-03-15',
      specificTime: '19:00',
      locationMode: 'near_me',
      vibeDescription: 'cozy wine bar',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty city', () => {
    const result = SuggestRequestSchema.safeParse({ city: '', categories: ['Drinks'] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid location mode', () => {
    const result = SuggestRequestSchema.safeParse({
      city: 'NYC',
      categories: ['Drinks'],
      locationMode: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('limits vibeDescription to 500 chars', () => {
    const result = SuggestRequestSchema.safeParse({
      city: 'NYC',
      categories: ['Drinks'],
      vibeDescription: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('VoteRequestSchema', () => {
  it('accepts upvote without reasons', () => {
    const result = VoteRequestSchema.safeParse({ voteType: 'up' });
    expect(result.success).toBe(true);
  });

  it('accepts downvote with reasons', () => {
    const result = VoteRequestSchema.safeParse({
      voteType: 'down',
      reasons: ['TOO_FAR'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts downvote with note only', () => {
    const result = VoteRequestSchema.safeParse({
      voteType: 'down',
      note: 'Just not feeling it',
    });
    expect(result.success).toBe(true);
  });

  it('rejects downvote without reasons or note', () => {
    const result = VoteRequestSchema.safeParse({ voteType: 'down' });
    expect(result.success).toBe(false);
  });

  it('rejects downvote with too-short note and no reasons', () => {
    const result = VoteRequestSchema.safeParse({ voteType: 'down', note: 'ab' });
    expect(result.success).toBe(false);
  });

  it('rejects note over 500 chars', () => {
    const result = VoteRequestSchema.safeParse({
      voteType: 'down',
      note: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateGroupRequestSchema', () => {
  it('accepts valid group name', () => {
    const result = CreateGroupRequestSchema.safeParse({ name: 'Friday Night Crew' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = CreateGroupRequestSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 100 chars', () => {
    const result = CreateGroupRequestSchema.safeParse({ name: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe('CreateSessionRequestSchema', () => {
  const validSession = {
    groupId: '550e8400-e29b-41d4-a716-446655440000',
    filters: {
      budget: '$$',
      energy: 'Vibey',
      category: ['Drinks'],
    },
  };

  it('accepts valid session', () => {
    const result = CreateSessionRequestSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID groupId', () => {
    const result = CreateSessionRequestSchema.safeParse({ ...validSession, groupId: 'not-uuid' });
    expect(result.success).toBe(false);
  });

  it('accepts session with name', () => {
    const result = CreateSessionRequestSchema.safeParse({ ...validSession, name: 'Friday Plans' });
    expect(result.success).toBe(true);
  });

  it('provides default guardrails', () => {
    const result = CreateSessionRequestSchema.safeParse(validSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.guardrails).toEqual({ priority: 'turnout', minTurnout: 'balanced' });
    }
  });
});

describe('CreateMessageRequestSchema', () => {
  it('accepts valid message', () => {
    const result = CreateMessageRequestSchema.safeParse({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      text: 'Hello everyone!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty text', () => {
    const result = CreateMessageRequestSchema.safeParse({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      text: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects text over 2000 chars', () => {
    const result = CreateMessageRequestSchema.safeParse({
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      text: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateSuggestionRequestSchema', () => {
  const validSuggestion = {
    sessionId: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Joe\'s Pizza',
    source: 'google_places',
    rating: '4.5',
    turnout: 'medium',
    distance: '0.3 mi',
    budget: '$$',
    description: 'Classic NYC pizza joint',
    tags: ['pizza', 'casual'],
  };

  it('accepts valid suggestion', () => {
    const result = CreateSuggestionRequestSchema.safeParse(validSuggestion);
    expect(result.success).toBe(true);
  });

  it('defaults kind to venue', () => {
    const result = CreateSuggestionRequestSchema.safeParse(validSuggestion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('venue');
    }
  });

  it('defaults city to NYC', () => {
    const result = CreateSuggestionRequestSchema.safeParse(validSuggestion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.city).toBe('NYC');
    }
  });

  it('rejects empty name', () => {
    const result = CreateSuggestionRequestSchema.safeParse({ ...validSuggestion, name: '' });
    expect(result.success).toBe(false);
  });
});
