import { config } from '../config.js';
import prisma from '../db.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
  attendees?: { email: string; displayName?: string }[];
  calendarId?: string;
  calendarName?: string;
  calendarColor?: string;
}

export interface Calendar {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor: string;
}

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.googleRedirectUri,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  return response.json() as Promise<GoogleTokens>;
}

export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return response.json() as Promise<GoogleUserInfo>;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.googleClientId,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  return response.json() as Promise<GoogleTokens>;
}

export async function getCalendarEvents(
  accessToken: string,
  timeMin?: string,
  timeMax?: string
): Promise<CalendarEvent[]> {
  const calendars = await getCalendars(accessToken);
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  if (timeMin) params.set('timeMin', timeMin);
  if (timeMax) params.set('timeMax', timeMax);

  const allEvents: CalendarEvent[] = [];

  for (const calendar of calendars) {
    const calendarId = encodeURIComponent(calendar.id);
    const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      continue;
    }

    const data = await response.json() as { items?: CalendarEvent[] };
    const events = (data.items || []).map(event => ({
      ...event,
      calendarId: calendar.id,
      calendarName: calendar.summary,
      calendarColor: calendar.backgroundColor,
    }));
    allEvents.push(...events);
  }

  return allEvents.sort((a, b) => {
    const aStart = a.start.dateTime || a.start.date || '';
    const bStart = b.start.dateTime || b.start.date || '';
    return aStart.localeCompare(bStart);
  });
}

export async function getCalendars(accessToken: string): Promise<Calendar[]> {
  const response = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('Failed to get calendars');
  }

  const data = await response.json() as { items?: Calendar[] };
  return data.items || [];
}

export async function saveGoogleAccount(
  userId: string,
  googleId: string,
  email: string,
  tokens: GoogleTokens
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.googleAccount.upsert({
    where: {
      userId_googleId: {
        userId,
        googleId,
      },
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      email,
    },
    create: {
      userId,
      googleId,
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    },
  });
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const googleAccount = await prisma.googleAccount.findFirst({
    where: { userId },
  });

  if (!googleAccount) return null;

  if (googleAccount.expiresAt > new Date()) {
    return googleAccount.accessToken;
  }

  const tokens = await refreshAccessToken(googleAccount.refreshToken);
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.googleAccount.update({
    where: { id: googleAccount.id },
    data: {
      accessToken: tokens.access_token,
      expiresAt,
    },
  });

  return tokens.access_token;
}

export async function disconnectGoogleAccount(userId: string): Promise<void> {
  await prisma.googleAccount.deleteMany({
    where: { userId },
  });
}

export async function getGoogleAccountStatus(userId: string): Promise<{ connected: boolean; email?: string }> {
  const googleAccount = await prisma.googleAccount.findFirst({
    where: { userId },
    select: { email: true },
  });

  return {
    connected: !!googleAccount,
    email: googleAccount?.email,
  };
}

export interface CreateEventInput {
  summary: string
  description?: string
  start: string
  end: string
  calendarId: string
  isAllDay: boolean
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  eventId: string
  calendarId: string
}

export async function createCalendarEvent(
  accessToken: string,
  input: CreateEventInput
): Promise<CalendarEvent> {
  const eventData: Record<string, unknown> = {
    summary: input.summary,
  };

  if (input.description) {
    eventData.description = input.description;
  }

  if (input.isAllDay) {
    eventData.start = { date: input.start.split('T')[0] };
    eventData.end = { date: input.end.split('T')[0] };
  } else {
    eventData.start = { dateTime: input.start };
    eventData.end = { dateTime: input.end };
  }

  const calendarId = encodeURIComponent(input.calendarId);
  const response = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create event: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<CalendarEvent>;
}

export async function updateCalendarEvent(
  accessToken: string,
  input: UpdateEventInput
): Promise<CalendarEvent> {
  const eventData: Record<string, unknown> = {};

  if (input.summary !== undefined) eventData.summary = input.summary;
  if (input.description !== undefined) eventData.description = input.description;
  if (input.start !== undefined && input.end !== undefined) {
    if (input.isAllDay) {
      eventData.start = { date: input.start.split('T')[0] };
      eventData.end = { date: input.end.split('T')[0] };
    } else {
      eventData.start = { dateTime: input.start };
      eventData.end = { dateTime: input.end };
    }
  }

  const calendarId = encodeURIComponent(input.calendarId);
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${calendarId}/events/${input.eventId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventData),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update event: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<CalendarEvent>;
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const calId = encodeURIComponent(calendarId);
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${calId}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete event: ${response.status}`);
  }
}