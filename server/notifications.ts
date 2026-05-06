import { storage } from './storage';
import type { InsertNotification, Notification, NotificationType } from '@shared/schema';
import { sendPushToUser, sendPushToUsers } from './push';
import { logger } from './logger';

interface CalendarEventParams {
  title: string;
  description: string;
  location: string;
  startDate: Date;
  durationMinutes?: number;
  url?: string;
}

export function generateICSFile(params: CalendarEventParams): string {
  const { title, description, location, startDate, durationMinutes = 120, url } = params;
  
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };
  
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  const uid = `linkupgo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@linkupgo.app`;
  
  const escapeText = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  };
  
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LinkUpGo//Event Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatDate(new Date())}`,
    `DTSTART:${formatDate(startDate)}`,
    `DTEND:${formatDate(endDate)}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description)}${url ? `\\n\\nMore details: ${url}` : ''}`,
    `LOCATION:${escapeText(location)}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  
  return lines.join('\r\n');
}

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  url: string;
  sendEmail?: boolean;
}

export async function createNotification(params: CreateNotificationParams): Promise<Notification> {
  const { userId, type, title, body, url, sendEmail = true } = params;

  const notification = await storage.createNotification({
    userId,
    type,
    title,
    body,
    url,
  });

  // Send push notification
  sendPushToUser({ userId, title, body, url }).catch(err => {
    console.error('[Push] Failed to send push for notification:', err);
  });

  if (sendEmail) {
    const prefs = await storage.getNotificationPrefs(userId);
    const emailEnabled = prefs?.emailEnabled ?? true;

    const emailTypes = ['INVITE', 'AVAILABILITY_NUDGE', 'PLAN_LOCKED'];
    if (emailEnabled && emailTypes.includes(type)) {
      await sendEmailNotification({ userId, type, title, body, url });
    }
  }

  return notification;
}

async function sendEmailNotification(params: {
  userId: string;
  type: string;
  title: string;
  body: string;
  url: string;
}): Promise<void> {
  const { userId, title, body, url } = params;
  
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;
  const appBaseUrl = process.env.APP_BASE_URL || process.env.REPL_SLUG 
    ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    : '';
  const loginPath = process.env.LOGIN_PATH || '/login';

  if (!resendApiKey || !fromEmail || !appBaseUrl) {
    console.log('[Email] Skipping email - missing env vars (RESEND_API_KEY, FROM_EMAIL, or APP_BASE_URL)');
    return;
  }

  try {
    const user = await storage.getUser(userId);
    if (!user) {
      console.log('[Email] User not found:', userId);
      return;
    }

    if (!user.email) {
      console.log('[Email] User has no email address:', userId);
      return;
    }

    const deepLinkWithRedirect = `${appBaseUrl}${loginPath}?redirect=${encodeURIComponent(url)}`;
    const directLink = `${appBaseUrl}${url}`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #84cc16 0%, #22c55e 100%); padding: 2px; border-radius: 16px;">
          <div style="background: #0a0a0a; border-radius: 14px; padding: 32px;">
            <h1 style="color: #ffffff; margin: 0 0 16px 0; font-size: 24px;">${title}</h1>
            <p style="color: #a3a3a3; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">${body}</p>
            <a href="${deepLinkWithRedirect}" 
               style="display: inline-block; background: #84cc16; color: #000000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
              Open Plan
            </a>
            <p style="color: #525252; margin: 24px 0 0 0; font-size: 12px;">
              Or copy this link: ${directLink}
            </p>
          </div>
        </div>
        <p style="color: #525252; text-align: center; margin: 16px 0 0 0; font-size: 12px;">
          Sent by LinkUpGo • <a href="${appBaseUrl}/settings" style="color: #84cc16;">Manage notifications</a>
        </p>
      </div>
    `;

    const textContent = `${title}\n\n${body}\n\nOpen your plan: ${deepLinkWithRedirect}`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: user.email,
        subject: title,
        html: htmlContent,
        text: textContent,
      }),
    });

    if (!response.ok) {
      logger.warn({ service: 'resend', endpoint: 'email', statusCode: response.status, statusText: response.statusText, userId }, '[Email] Failed to send');
    } else {
      logger.info({ userId }, '[Email] Sent successfully');
    }
  } catch (error) {
    console.error('[Email] Error sending notification email:', error);
  }
}

export async function notifyPlanJoined(params: {
  sessionId: string;
  sessionName: string;
  joinerId: string;
  joinerName: string;
  adminId: string;
}): Promise<void> {
  const { sessionId, sessionName, joinerId, joinerName, adminId } = params;
  const url = `/session/${sessionId}`;
  const planName = sessionName || 'the plan';

  await createNotification({
    userId: joinerId,
    type: 'INVITE',
    title: `You joined ${planName}`,
    body: `You're now part of the planning session. Check out the suggestions and vote!`,
    url,
  });

  if (adminId !== joinerId) {
    await createNotification({
      userId: adminId,
      type: 'INVITE',
      title: `${joinerName} joined ${planName}`,
      body: `${joinerName} is now part of the planning session.`,
      url,
    });
  }
}

export async function notifyVotingOpen(params: {
  sessionId: string;
  sessionName: string;
  participantIds: string[];
}): Promise<void> {
  const { sessionId, sessionName, participantIds } = params;
  const url = `/session/${sessionId}`;
  const planName = sessionName || 'the plan';

  for (const userId of participantIds) {
    await createNotification({
      userId,
      type: 'VOTE_OPEN',
      title: `Voting is open for ${planName}`,
      body: `Options are ready! Cast your votes now.`,
      url,
    });
  }
}

export async function notifyPlanLocked(params: {
  sessionId: string;
  sessionName: string;
  winningOption: string;
  participantIds: string[];
  detailUrl?: string;
  eventDetails?: {
    location: string;
    startDate: Date;
    description?: string;
  };
}): Promise<void> {
  const { sessionId, sessionName, winningOption, participantIds, detailUrl, eventDetails } = params;
  const url = `/session/${sessionId}`;
  const planName = sessionName || 'Your plan';

  for (const userId of participantIds) {
    await createNotification({
      userId,
      type: 'PLAN_LOCKED',
      title: `${planName} is locked in!`,
      body: `It's happening: ${winningOption}${detailUrl ? ' • Tap to see details' : ''}`,
      url,
    });
  }

  if (eventDetails) {
    await sendCalendarInviteEmails({
      sessionId,
      sessionName: planName,
      winningOption,
      participantIds,
      eventDetails,
      url,
    });
  }
}

async function sendCalendarInviteEmails(params: {
  sessionId: string;
  sessionName: string;
  winningOption: string;
  participantIds: string[];
  eventDetails: {
    location: string;
    startDate: Date;
    description?: string;
  };
  url: string;
}): Promise<void> {
  const { sessionId, sessionName, winningOption, participantIds, eventDetails, url } = params;
  
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL;
  const appBaseUrl = process.env.APP_BASE_URL || (process.env.REPL_SLUG 
    ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
    : '');

  if (!resendApiKey || !fromEmail || !appBaseUrl) {
    console.log('[Calendar Email] Skipping - missing env vars');
    return;
  }

  const icsContent = generateICSFile({
    title: `${sessionName}: ${winningOption}`,
    description: eventDetails.description || `Event planned with LinkUpGo!\n\nVenue: ${winningOption}`,
    location: eventDetails.location,
    startDate: eventDetails.startDate,
    url: `${appBaseUrl}${url}`,
  });

  const icsBase64 = Buffer.from(icsContent).toString('base64');

  for (const userId of participantIds) {
    try {
      const user = await storage.getUser(userId);
      if (!user?.email) continue;

      const prefs = await storage.getNotificationPrefs(userId);
      if (prefs && !prefs.emailEnabled) continue;

      const deepLink = `${appBaseUrl}${url}`;
      const eventDate = eventDetails.startDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #84cc16 0%, #22c55e 100%); padding: 2px; border-radius: 16px;">
            <div style="background: #0a0a0a; border-radius: 14px; padding: 32px;">
              <h1 style="color: #ffffff; margin: 0 0 8px 0; font-size: 24px;">It's locked in! 🎉</h1>
              <h2 style="color: #84cc16; margin: 0 0 24px 0; font-size: 20px;">${winningOption}</h2>
              <div style="background: #171717; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
                <p style="color: #a3a3a3; margin: 0 0 8px 0; font-size: 14px;">📅 ${eventDate}</p>
                <p style="color: #a3a3a3; margin: 0; font-size: 14px;">📍 ${eventDetails.location}</p>
              </div>
              <p style="color: #a3a3a3; margin: 0 0 24px 0; font-size: 14px;">
                A calendar invite is attached to this email. Add it to your calendar so you don't miss out!
              </p>
              <a href="${deepLink}" 
                 style="display: inline-block; background: #84cc16; color: #000000; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                View Plan Details
              </a>
            </div>
          </div>
          <p style="color: #525252; text-align: center; margin: 16px 0 0 0; font-size: 12px;">
            Sent by LinkUpGo • <a href="${appBaseUrl}/profile" style="color: #84cc16;">Manage notifications</a>
          </p>
        </div>
      `;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: user.email,
          subject: `${sessionName} is happening: ${winningOption}`,
          html: htmlContent,
          attachments: [
            {
              filename: 'event.ics',
              content: icsBase64,
            },
          ],
        }),
      });

      if (!response.ok) {
        logger.warn({ service: 'resend', endpoint: 'calendar-email', statusCode: response.status, statusText: response.statusText, userId: user.id }, '[Calendar Email] Failed');
      } else {
        logger.info({ userId: user.id }, '[Calendar Email] Sent');
      }
    } catch (error) {
      console.error('[Calendar Email] Error:', error);
    }
  }
}

export async function notifyAvailabilityNudge(params: {
  sessionId: string;
  sessionName: string;
  missingUserIds: string[];
}): Promise<void> {
  const { sessionId, sessionName, missingUserIds } = params;
  const url = `/session/${sessionId}`;
  const planName = sessionName || 'the plan';

  for (const userId of missingUserIds) {
    const recentNudge = await storage.getRecentNudge(userId, sessionId);
    if (recentNudge) {
      console.log(`[Nudge] Skipping nudge for user ${userId} - already nudged within 12h`);
      continue;
    }

    await createNotification({
      userId,
      type: 'AVAILABILITY_NUDGE',
      title: `Your friends are waiting!`,
      body: `You haven't voted on ${planName} yet. Share your preferences!`,
      url,
    });
  }
}
