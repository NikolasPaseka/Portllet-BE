import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';

const router = Router();

// Section Routes

router.get('/sections', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const sections = await prisma.todoSection.findMany({
    where: { userId: req.userId! },
    include: {
      tasks: {
        include: { subtasks: true },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: { position: 'asc' },
  });

  const formatted = sections.map(section => ({
    id: section.id,
    name: section.name,
    color: section.color,
    position: section.position,
    tasks: section.tasks.map(task => ({
      id: task.id,
      sectionId: section.id,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate?.toISOString(),
      duration: task.duration,
      repeat: task.repeat,
      completed: task.completed,
      position: task.position,
      subtasks: task.subtasks.map(st => ({
        id: st.id,
        title: st.title,
        completed: st.completed,
        position: st.position,
      })),
    })),
  }));

  return success(res, formatted);
}));

const createSectionSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

router.post('/sections', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const parsed = createSectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const maxPosition = await prisma.todoSection.findFirst({
    where: { userId: req.userId! },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const section = await prisma.todoSection.create({
    data: {
      userId: req.userId!,
      name: parsed.data.name,
      color: parsed.data.color || '#6366f1',
      position: (maxPosition?.position ?? -1) + 1,
    },
  });

  return success(res, {
    id: section.id,
    name: section.name,
    color: section.color,
    position: section.position,
    tasks: [],
  }, 201);
}));

const updateSectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  position: z.number().optional(),
});

router.put('/sections', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const parsed = updateSectionSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const section = await prisma.todoSection.findFirst({
    where: { id: parsed.data.id, userId: req.userId! },
  });

  if (!section) {
    return error(res, 'NOT_FOUND', 'Section not found', 404);
  }

  const updated = await prisma.todoSection.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      color: parsed.data.color,
      position: parsed.data.position,
    },
  });

  return success(res, {
    id: updated.id,
    name: updated.name,
    color: updated.color,
    position: updated.position,
  });
}));

router.delete('/sections/:id', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const sectionId = req.params.id as string
  const section = await prisma.todoSection.findFirst({
    where: { id: sectionId, userId: req.userId! },
  });

  if (!section) {
    return error(res, 'NOT_FOUND', 'Section not found', 404);
  }

  await prisma.todoSection.delete({ where: { id: sectionId } });

  return success(res, { message: 'Section deleted' });
}));

// Task Routes

const createTaskSchema = z.object({
  sectionId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  duration: z.number().optional(),
  repeat: z.enum(['none', 'daily', 'weekly', 'monthly']).optional(),
  subtasks: z.array(z.object({ title: z.string() })).optional(),
});

router.post('/tasks', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const parsed = createTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const section = await prisma.todoSection.findFirst({
    where: { id: parsed.data.sectionId, userId: req.userId! },
  });

  if (!section) {
    return error(res, 'NOT_FOUND', 'Section not found', 404);
  }

  const maxPosition = await prisma.todoTask.findFirst({
    where: { sectionId: parsed.data.sectionId },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const task = await prisma.todoTask.create({
    data: {
      sectionId: parsed.data.sectionId,
      title: parsed.data.title,
      description: parsed.data.description,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      duration: parsed.data.duration,
      repeat: parsed.data.repeat || 'none',
      position: (maxPosition?.position ?? -1) + 1,
      subtasks: parsed.data.subtasks ? {
        create: parsed.data.subtasks.map((st, idx) => ({
          title: st.title,
          position: idx,
        })),
      } : undefined,
    },
    include: { subtasks: true },
  });

  return success(res, {
    id: task.id,
    sectionId: task.sectionId,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate?.toISOString(),
    duration: task.duration,
    repeat: task.repeat,
    completed: task.completed,
    position: task.position,
    subtasks: task.subtasks.map(st => ({
      id: st.id,
      title: st.title,
      completed: st.completed,
      position: st.position,
    })),
  }, 201);
}));

const updateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional().nullable(),
  duration: z.number().optional().nullable(),
  repeat: z.enum(['none', 'daily', 'weekly', 'monthly']).optional(),
  completed: z.boolean().optional(),
  sectionId: z.string().uuid().optional(),
  position: z.number().optional(),
  subtasks: z.array(z.object({
    id: z.string().uuid().optional(),
    title: z.string(),
    completed: z.boolean().optional(),
  })).optional(),
});

router.put('/tasks', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const parsed = updateTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const task = await prisma.todoTask.findFirst({
    where: { id: parsed.data.id },
    include: { section: true },
  });

  if (!task || task.section.userId !== req.userId) {
    return error(res, 'NOT_FOUND', 'Task not found', 404);
  }

  if (parsed.data.subtasks) {
    const existingSubtasks = await prisma.todoSubtask.findMany({
      where: { taskId: parsed.data.id },
    });

    const subtaskIds = new Set(existingSubtasks.map(s => s.id));
    const newSubtasks = parsed.data.subtasks.filter(s => !s.id);
    const updateSubtasks = parsed.data.subtasks.filter(s => s.id && subtaskIds.has(s.id));

    for (const st of newSubtasks) {
      await prisma.todoSubtask.create({
        data: { taskId: parsed.data.id, title: st.title, completed: st.completed || false, position: existingSubtasks.length },
      });
    }

    for (const st of updateSubtasks) {
      await prisma.todoSubtask.update({
        where: { id: st.id },
        data: { title: st.title, completed: st.completed },
      });
    }

    const idsToDelete = [...subtaskIds].filter(id => !parsed.data.subtasks!.some(s => s.id === id));
    if (idsToDelete.length > 0) {
      await prisma.todoSubtask.deleteMany({ where: { id: { in: idsToDelete } } });
    }
  }

  const updated = await prisma.todoTask.update({
    where: { id: parsed.data.id },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      duration: parsed.data.duration,
      repeat: parsed.data.repeat,
      completed: parsed.data.completed,
      sectionId: parsed.data.sectionId,
      position: parsed.data.position,
    },
    include: { subtasks: true },
  });

  return success(res, {
    id: updated.id,
    sectionId: updated.sectionId,
    title: updated.title,
    description: updated.description,
    dueDate: updated.dueDate?.toISOString(),
    duration: updated.duration,
    repeat: updated.repeat,
    completed: updated.completed,
    position: updated.position,
    subtasks: updated.subtasks.map(st => ({
      id: st.id,
      title: st.title,
      completed: st.completed,
      position: st.position,
    })),
  });
}));

router.delete('/tasks/:id', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const taskId = req.params.id as string
  const task = await prisma.todoTask.findFirst({
    where: { id: taskId },
  });

  if (!task) {
    return error(res, 'NOT_FOUND', 'Task not found', 404);
  }

  const section = await prisma.todoSection.findFirst({
    where: { id: task.sectionId, userId: req.userId! },
  });

  if (!section) {
    return error(res, 'NOT_FOUND', 'Task not found', 404);
  }

  await prisma.todoTask.delete({ where: { id: taskId } });

  return success(res, { message: 'Task deleted' });
}));

// Reorder sections
router.put('/sections/reorder', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const { sectionIds } = req.body as { sectionIds: string[] };

  if (!Array.isArray(sectionIds)) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400);
  }

  for (let i = 0; i < sectionIds.length; i++) {
    await prisma.todoSection.updateMany({
      where: { id: sectionIds[i], userId: req.userId! },
      data: { position: i },
    });
  }

  return success(res, { message: 'Sections reordered' });
}));

// Reorder tasks within or across sections
router.put('/tasks/reorder', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const { taskUpdates } = req.body as {
    taskUpdates: { taskId: string; sectionId: string; position: number }[]
  };

  if (!Array.isArray(taskUpdates)) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400);
  }

  for (const update of taskUpdates) {
    const task = await prisma.todoTask.findFirst({
      where: { id: update.taskId },
      include: { section: true },
    });

    if (task && task.section.userId === req.userId) {
      await prisma.todoTask.update({
        where: { id: update.taskId },
        data: { sectionId: update.sectionId, position: update.position },
      });
    }
  }

  return success(res, { message: 'Tasks reordered' });
}));

export default router;