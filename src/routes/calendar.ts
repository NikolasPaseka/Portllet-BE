import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';
import { getValidAccessToken, getCalendarEvents, getCalendars, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from '../services/googleService.js';

const router = Router();

router.get('/calendars', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const accessToken = await getValidAccessToken(req.userId!);
  
  if (!accessToken) {
    return error(res, 'NOT_CONNECTED', 'Google Calendar not connected', 404);
  }

  const calendars = await getCalendars(accessToken);

  const formattedCalendars = calendars.map((cal) => ({
    id: cal.id,
    name: cal.summary,
    color: cal.backgroundColor,
  }));

  return success(res, formattedCalendars);
}));

router.get('/events', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const accessToken = await getValidAccessToken(req.userId!);
  
  if (!accessToken) {
    return error(res, 'NOT_CONNECTED', 'Google Calendar not connected', 404);
  }

  const { timeMin, timeMax } = req.query;
  const events = await getCalendarEvents(
    accessToken,
    timeMin as string | undefined,
    timeMax as string | undefined
  );

  const formattedEvents = events.map((event) => ({
    id: event.id,
    title: event.summary || 'Untitled',
    description: event.description,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    colorId: event.colorId,
    attendees: event.attendees?.slice(0, 5),
    isAllDay: !event.start.dateTime,
    calendarId: event.calendarId,
    calendarName: event.calendarName,
    calendarColor: event.calendarColor,
  }));

  return success(res, formattedEvents);
}));

const createEventSchema = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  start: z.string(),
  end: z.string(),
  calendarId: z.string(),
  isAllDay: z.boolean(),
});

const updateEventSchema = z.object({
  eventId: z.string(),
  summary: z.string().min(1).optional(),
  description: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  calendarId: z.string(),
  isAllDay: z.boolean(),
});

const deleteEventSchema = z.object({
  eventId: z.string(),
  calendarId: z.string(),
});

router.post('/events', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const accessToken = await getValidAccessToken(req.userId!);
  
  if (!accessToken) {
    return error(res, 'NOT_CONNECTED', 'Google Calendar not connected', 404);
  }

  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const event = await createCalendarEvent(accessToken, parsed.data);

  return success(res, {
    id: event.id,
    title: event.summary,
    description: event.description,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    isAllDay: !!event.start.date,
  }, 201);
}));

router.put('/events', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const accessToken = await getValidAccessToken(req.userId!);
  
  if (!accessToken) {
    return error(res, 'NOT_CONNECTED', 'Google Calendar not connected', 404);
  }

  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const { eventId, ...updateData } = parsed.data;
  const event = await updateCalendarEvent(accessToken, {
    eventId,
    ...updateData,
    calendarId: parsed.data.calendarId,
  } as { eventId: string; summary?: string; description?: string; start?: string; end?: string; calendarId: string; isAllDay: boolean });

  return success(res, {
    id: event.id,
    title: event.summary,
    description: event.description,
    start: event.start.dateTime || event.start.date,
    end: event.end.dateTime || event.end.date,
    isAllDay: !!event.start.date,
  });
}));

router.delete('/events', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const accessToken = await getValidAccessToken(req.userId!);
  
  if (!accessToken) {
    return error(res, 'NOT_CONNECTED', 'Google Calendar not connected', 404);
  }

  const parsed = deleteEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  await deleteCalendarEvent(accessToken, parsed.data.calendarId, parsed.data.eventId);

  return success(res, { message: 'Event deleted' });
}));

export default router;