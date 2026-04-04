import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';

/**
 * @swagger
 * /accounts/{accountId}/envelopes:
 *   get:
 *     summary: List envelopes for an account
 *     tags: [Envelopes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of envelopes
 * 
 *   post:
 *     summary: Create an envelope
 *     tags: [Envelopes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: accountId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - targetAmount
 *             properties:
 *               name:
 *                 type: string
 *               targetAmount:
 *                 type: number
 *     responses:
 *       201:
 *         description: Envelope created
 */

const router = Router();
router.use(authenticate);

const createEnvelopeSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.number(),
});

const updateEnvelopeSchema = z.object({
  name: z.string().min(1).optional(),
  targetAmount: z.number().optional(),
  currentAmount: z.number().optional(),
});

function mapEnvelope(e: any) {
  return {
    id: e.id,
    accountId: e.accountId,
    name: e.name,
    targetAmount: Number(e.targetAmount),
    currentAmount: Number(e.currentAmount),
    createdAt: e.createdAt,
  };
}

router.get('/accounts/:accountId/envelopes', handleAsync(async (req: AuthRequest, res) => {
  const accountId = req.params.accountId as string;
  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId: req.userId! },
  });
  if (!account) {
    return error(res, 'NOT_FOUND', 'Account not found', 404);
  }

  const envelopes = await prisma.envelope.findMany({
    where: { accountId },
    orderBy: { name: 'asc' },
  });

  return success(res, envelopes.map(mapEnvelope));
}));

router.post('/accounts/:accountId/envelopes', handleAsync(async (req: AuthRequest, res) => {
  const accountId = req.params.accountId as string;
  const parsed = createEnvelopeSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, userId: req.userId! },
  });
  if (!account) {
    return error(res, 'NOT_FOUND', 'Account not found', 404);
  }

  if (account.type !== 'saving') {
    return error(res, 'VALIDATION_ERROR', 'Envelopes are only for saving accounts', 400);
  }

  const envelope = await prisma.envelope.create({
    data: {
      accountId,
      name: parsed.data.name,
      targetAmount: parsed.data.targetAmount,
    },
  });

  return success(res, mapEnvelope(envelope), 201);
}));

router.put('/envelopes/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const parsed = updateEnvelopeSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const envelope = await prisma.envelope.findFirst({
    where: { id, bankAccount: { userId: req.userId! } },
    include: { bankAccount: true },
  });
  if (!envelope) {
    return error(res, 'NOT_FOUND', 'Envelope not found', 404);
  }

  const updateData: any = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.targetAmount !== undefined) updateData.targetAmount = parsed.data.targetAmount;
  if (parsed.data.currentAmount !== undefined) updateData.currentAmount = parsed.data.currentAmount;

  const updated = await prisma.envelope.update({
    where: { id },
    data: updateData,
  });

  return success(res, mapEnvelope(updated));
}));

router.delete('/envelopes/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const envelope = await prisma.envelope.findFirst({
    where: { id, bankAccount: { userId: req.userId! } },
    include: { bankAccount: true },
  });
  if (!envelope) {
    return error(res, 'NOT_FOUND', 'Envelope not found', 404);
  }

  await prisma.envelope.delete({ where: { id } });

  return success(res, { message: 'Envelope deleted' });
}));

export default router;
