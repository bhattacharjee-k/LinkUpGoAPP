import { db } from './storage';
import { users } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';
import { storage } from './storage';

// Expo Push Notification service
// Uses Expo's push notification API which handles both APNs (iOS) and FCM (Android)
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string; // Expo push token
  title: string;
  body: string;
  data?: Record<string, any>; // Deep link data
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

interface PushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Send push notification to a single Expo push token
 */
async function sendExpoPush(messages: PushMessage[]): Promise<PushTicket[]> {
  if (messages.length === 0) return [];

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error('[Push] Expo API error:', response.status, await response.text());
      return [];
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    console.error('[Push] Failed to send push notifications:', error);
    return [];
  }
}

/**
 * Send push notification to a single user by userId
 */
export async function sendPushToUser(params: {
  userId: string;
  title: string;
  body: string;
  url?: string; // Deep link path like /session/:id
}): Promise<void> {
  const { userId, title, body, url } = params;

  // Check push preferences
  const prefs = await storage.getNotificationPrefs(userId);
  if (prefs && !prefs.pushEnabled) {
    return;
  }

  const [user] = await db.select({ pushToken: users.pushToken }).from(users).where(eq(users.id, userId));
  if (!user?.pushToken) return;

  const tickets = await sendExpoPush([{
    to: user.pushToken,
    title,
    body,
    sound: 'default',
    data: url ? { url } : undefined,
  }]);

  // Handle invalid tokens
  for (const ticket of tickets) {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      console.log('[Push] Clearing invalid token for user:', userId);
      await db.update(users).set({ pushToken: null }).where(eq(users.id, userId));
    }
  }
}

/**
 * Send push notification to multiple users
 */
export async function sendPushToUsers(params: {
  userIds: string[];
  title: string;
  body: string;
  url?: string;
  excludeUserId?: string; // Don't send to the person who triggered the action
}): Promise<void> {
  const { userIds, title, body, url, excludeUserId } = params;

  const targetIds = excludeUserId ? userIds.filter(id => id !== excludeUserId) : userIds;
  if (targetIds.length === 0) return;

  // Batch fetch push tokens and preferences
  const usersWithTokens = await db
    .select({ id: users.id, pushToken: users.pushToken })
    .from(users)
    .where(inArray(users.id, targetIds));

  const messages: PushMessage[] = [];
  const tokenUserMap: Map<string, string> = new Map();

  for (const user of usersWithTokens) {
    if (!user.pushToken) continue;

    // Check preferences (batch this in future for perf)
    const prefs = await storage.getNotificationPrefs(user.id);
    if (prefs && !prefs.pushEnabled) continue;

    messages.push({
      to: user.pushToken,
      title,
      body,
      sound: 'default',
      data: url ? { url } : undefined,
    });
    tokenUserMap.set(user.pushToken, user.id);
  }

  if (messages.length === 0) return;

  // Expo supports batches of up to 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const tickets = await sendExpoPush(batch);

    // Clean up invalid tokens
    for (let j = 0; j < tickets.length; j++) {
      if (tickets[j].status === 'error' && tickets[j].details?.error === 'DeviceNotRegistered') {
        const token = batch[j].to;
        const userId = tokenUserMap.get(token);
        if (userId) {
          console.log('[Push] Clearing invalid token for user:', userId);
          await db.update(users).set({ pushToken: null }).where(eq(users.id, userId));
        }
      }
    }
  }
}
