import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../storage';
import { refreshTokens } from '@shared/schema';
import { eq, and, gt } from 'drizzle-orm';
import { logger } from '../logger';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ userId, type: 'access' } as TokenPayload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' } as TokenPayload, JWT_SECRET, {
    expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d`,
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });
}

export async function validateAndRotateRefreshToken(
  oldToken: string
): Promise<{ accessToken: string; refreshToken: string; userId: string } | null> {
  const payload = verifyToken(oldToken);
  if (!payload || payload.type !== 'refresh') {
    return null;
  }

  const oldHash = hashToken(oldToken);

  // Find and delete the old refresh token
  const [existing] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, oldHash),
        eq(refreshTokens.userId, payload.userId),
        gt(refreshTokens.expiresAt, new Date())
      )
    );

  if (!existing) {
    logger.warn({ userId: payload.userId }, 'Invalid refresh token used');
    return null;
  }

  // Delete old token (rotation)
  await db.delete(refreshTokens).where(eq(refreshTokens.id, existing.id));

  // Issue new token pair
  const newAccessToken = signAccessToken(payload.userId);
  const newRefreshToken = signRefreshToken(payload.userId);
  await storeRefreshToken(payload.userId, newRefreshToken);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    userId: payload.userId,
  };
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
