import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock the heavy dependencies pulled in by routes.ts so we can import the
// pure helpers (formatRetryWait, rateLimit) without booting the whole server.
vi.mock('../../server/storage', () => ({ storage: {} }));
vi.mock('../../server/suggestions', () => ({
  getSuggestions: vi.fn(),
  getOrchestratedSuggestions: vi.fn(),
  generateWhyExplanation: vi.fn(),
}));
vi.mock('../../server/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { formatRetryWait, rateLimit } from '../../server/routes';

describe('formatRetryWait', () => {
  it('uses minutes for large waits', () => {
    expect(formatRetryWait(752)).toBe('Too many attempts. Please try again in about 13 minutes.');
  });

  it('uses singular "minute" for ~60s', () => {
    expect(formatRetryWait(60)).toBe('Too many attempts. Please try again in about 1 minute.');
    expect(formatRetryWait(75)).toBe('Too many attempts. Please try again in about 1 minute.');
  });

  it('uses seconds for short waits', () => {
    expect(formatRetryWait(30)).toBe('Too many attempts. Please try again in 30 seconds.');
  });

  it('uses singular "second" for a 1s wait and never reports 0', () => {
    expect(formatRetryWait(1)).toBe('Too many attempts. Please try again in 1 second.');
    expect(formatRetryWait(0)).toBe('Too many attempts. Please try again in 1 second.');
  });
});

// Fake req/res mirroring tests/server/auth-middleware.test.ts. The limiter keys
// off req.ip and registers a `finish` listener; we capture that listener so we
// can simulate the response completing with a given status code.
function makeReq(ip: string): Request {
  return { ip, socket: { remoteAddress: ip } } as any;
}

function makeRes() {
  const finishListeners: Array<() => void> = [];
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    set: vi.fn((k: string, v: string) => { res.headers[k] = v; return res; }),
    status: vi.fn().mockImplementation(function (this: any, code: number) {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn().mockReturnThis(),
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'finish') finishListeners.push(cb);
      return res;
    }),
  };
  // Simulate the response completing with `statusCode`.
  res.finish = (statusCode: number) => {
    res.statusCode = statusCode;
    finishListeners.forEach((cb) => cb());
  };
  return res as Response & { headers: Record<string, string>; finish: (code: number) => void };
}

// Drive one request through the middleware and report whether it was blocked
// (429) and whether next() was called.
function attempt(
  mw: (req: Request, res: Response, next: NextFunction) => any,
  ip: string,
  finishStatus: number | null,
) {
  const req = makeReq(ip);
  const res = makeRes();
  const next = vi.fn();
  mw(req, res, next);
  const blocked = res.statusCode === 429 && !next.mock.calls.length;
  if (!blocked && finishStatus !== null) {
    res.finish(finishStatus);
  }
  return { res, next, blocked };
}

describe('rateLimit middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks the (N+1)th failed attempt with a 429 + Retry-After header', () => {
    const ip = `ip-${Math.random()}`;
    const mw = rateLimit(3, 15 * 60 * 1000);

    // 3 failed attempts (401) all pass through.
    for (let i = 0; i < 3; i++) {
      const { next, blocked } = attempt(mw, ip, 401);
      expect(blocked).toBe(false);
      expect(next).toHaveBeenCalled();
    }

    // 4th is blocked.
    const fourth = attempt(mw, ip, null);
    expect(fourth.blocked).toBe(true);
    expect(fourth.res.status).toHaveBeenCalledWith(429);
    expect(fourth.res.headers['Retry-After']).toBeDefined();
    expect(Number(fourth.res.headers['Retry-After'])).toBeGreaterThan(0);
    expect(fourth.res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Too many attempts') })
    );
  });

  it('does not count a SUCCESS against the quota', () => {
    const ip = `ip-${Math.random()}`;
    const mw = rateLimit(3, 15 * 60 * 1000);

    // 2 failures, then a success (200), then 1 more failure = 3 failures total.
    attempt(mw, ip, 401);
    attempt(mw, ip, 401);
    attempt(mw, ip, 200); // success — should roll back its increment
    const third = attempt(mw, ip, 401);
    expect(third.blocked).toBe(false);
    expect(third.next).toHaveBeenCalled();

    // Now at 3 failures → the next failure should be blocked.
    const blockedAttempt = attempt(mw, ip, null);
    expect(blockedAttempt.blocked).toBe(true);
    expect(blockedAttempt.res.status).toHaveBeenCalledWith(429);
  });

  it('allows the full quota of failures after interleaved successes', () => {
    const ip = `ip-${Math.random()}`;
    const mw = rateLimit(2, 15 * 60 * 1000);

    // Many successes never consume quota.
    for (let i = 0; i < 5; i++) attempt(mw, ip, 200);

    // Still get the full 2 failed attempts.
    expect(attempt(mw, ip, 401).blocked).toBe(false);
    expect(attempt(mw, ip, 401).blocked).toBe(false);
    // 3rd failure blocked.
    expect(attempt(mw, ip, null).blocked).toBe(true);
  });
});
