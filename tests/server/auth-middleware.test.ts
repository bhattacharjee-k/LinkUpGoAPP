import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock dependencies before importing the module
vi.mock('../../server/storage', () => ({
  storage: {
    getGroup: vi.fn(),
    getGroupMembers: vi.fn(),
    getSessionParticipants: vi.fn(),
    getSession: vi.fn(),
  },
}));

vi.mock('../../server/middleware/jwt-auth', () => ({
  extractBearerToken: vi.fn(),
  verifyToken: vi.fn(),
}));

vi.mock('../../server/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { requireAuth, requireGroupAdmin, requireGroupMember, requireSessionParticipant, requireSessionNotLocked } from '../../server/middleware/auth';
import { storage } from '../../server/storage';
import { extractBearerToken, verifyToken } from '../../server/middleware/jwt-auth';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    session: {},
    params: {},
    body: {},
    path: '/test',
    ...overrides,
  } as any;
}

function mockRes(): Response {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('authenticates via JWT Bearer token', () => {
    vi.mocked(extractBearerToken).mockReturnValue('valid-token');
    vi.mocked(verifyToken).mockReturnValue({ userId: 'user-123', type: 'access' });

    const req = mockReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.userId).toBe('user-123');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 for invalid JWT', () => {
    vi.mocked(extractBearerToken).mockReturnValue('bad-token');
    vi.mocked(verifyToken).mockReturnValue(null);

    const req = mockReq({ headers: { authorization: 'Bearer bad-token' } });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_EXPIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('authenticates via session cookie', () => {
    vi.mocked(extractBearerToken).mockReturnValue(null);

    const req = mockReq({ session: { userId: 'user-456' } as any });
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.userId).toBe('user-456');
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when no auth provided', () => {
    vi.mocked(extractBearerToken).mockReturnValue(null);

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'UNAUTHORIZED' }));
  });
});

describe('requireGroupAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows group admin to proceed', async () => {
    vi.mocked(storage.getGroup).mockResolvedValue({ adminId: 'user-1' } as any);

    const req = mockReq({ userId: 'user-1', params: { id: 'group-1' } });
    const res = mockRes();
    const next = vi.fn();

    await requireGroupAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 for non-admin', async () => {
    vi.mocked(storage.getGroup).mockResolvedValue({ adminId: 'user-1' } as any);

    const req = mockReq({ userId: 'user-2', params: { id: 'group-1' } });
    const res = mockRes();
    const next = vi.fn();

    await requireGroupAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN_NOT_ADMIN' }));
  });

  it('returns 404 for nonexistent group', async () => {
    vi.mocked(storage.getGroup).mockResolvedValue(null as any);

    const req = mockReq({ userId: 'user-1', params: { id: 'missing-group' } });
    const res = mockRes();
    const next = vi.fn();

    await requireGroupAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when no group ID provided', async () => {
    const req = mockReq({ userId: 'user-1' });
    const res = mockRes();
    const next = vi.fn();

    await requireGroupAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('requireGroupMember', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows group member to proceed', async () => {
    vi.mocked(storage.getGroupMembers).mockResolvedValue(['user-1', 'user-2']);

    const req = mockReq({ userId: 'user-1', params: { id: 'group-1' } });
    const res = mockRes();
    const next = vi.fn();

    await requireGroupMember(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 for non-member', async () => {
    vi.mocked(storage.getGroupMembers).mockResolvedValue(['user-1', 'user-2']);

    const req = mockReq({ userId: 'user-3', params: { id: 'group-1' } });
    const res = mockRes();
    const next = vi.fn();

    await requireGroupMember(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('requireSessionParticipant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows active participant', async () => {
    vi.mocked(storage.getSessionParticipants).mockResolvedValue([
      { userId: 'user-1', status: 'joined' },
    ] as any);

    const req = mockReq({ userId: 'user-1', params: { id: 'session-1' } });
    const res = mockRes();
    const next = vi.fn();

    await requireSessionParticipant(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('rejects participant who left', async () => {
    vi.mocked(storage.getSessionParticipants).mockResolvedValue([
      { userId: 'user-1', status: 'left' },
    ] as any);

    const req = mockReq({ userId: 'user-1', params: { id: 'session-1' } });
    const res = mockRes();
    const next = vi.fn();

    await requireSessionParticipant(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('requireSessionNotLocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows unlocked session', async () => {
    vi.mocked(storage.getSession).mockResolvedValue({ status: 'voting' } as any);

    const req = mockReq({ params: { id: 'session-1' } });
    const res = mockRes();
    const next = vi.fn();

    await requireSessionNotLocked(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 for locked session', async () => {
    vi.mocked(storage.getSession).mockResolvedValue({ status: 'locked' } as any);

    const req = mockReq({ params: { id: 'session-1' } });
    const res = mockRes();
    const next = vi.fn();

    await requireSessionNotLocked(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_LOCKED' }));
  });

  it('passes through when no session ID', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await requireSessionNotLocked(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
