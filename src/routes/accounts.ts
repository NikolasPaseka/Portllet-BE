import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';
import { mapAccount } from './banks.js';

/**
 * @swagger
 * /accounts:
 *   get:
 *     summary: List all accounts
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: bankId
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of accounts
 * 
 *   post:
 *     summary: Create an account
 *     tags: [Accounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankId
 *               - name
 *               - type
 *               - currency
 *             properties:
 *               bankId:
 *                 type: string
 *                 format: uuid
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [common, saving]
 *               balance:
 *                 type: number
 *               currency:
 *                 type: string
 *                 enum: [CZK, USD]
 *               interestRate:
 *                 type: number
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Account created
 */

const router = Router();
router.use(authenticate);

const createAccountSchema = z.object({
  bankId: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['common', 'saving']),
  balance: z.number().optional().default(0),
  currency: z.enum(['CZK', 'USD']),
  interestRate: z.number().nullable().optional(),
});

const updateAccountSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(['common', 'saving']).optional(),
  balance: z.number().optional(),
  currency: z.enum(['CZK', 'USD']).optional(),
  interestRate: z.number().nullable().optional(),
});

router.get('/', handleAsync(async (req: AuthRequest, res) => {
  const bankId = req.query.bankId as string | undefined;

  const where: any = { userId: req.userId! };
  if (bankId) where.bankId = bankId;

  const accounts = await prisma.bankAccount.findMany({
    where,
    include: { bank: true, envelopes: true },
    orderBy: { name: 'asc' },
  });

  const result = accounts.map((a: any) => mapAccount(a, a.bank.name));

  return success(res, result);
}));

router.post('/', handleAsync(async (req: AuthRequest, res) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const bank = await prisma.bank.findFirst({
    where: { id: parsed.data.bankId, userId: req.userId! },
  });
  if (!bank) {
    return error(res, 'NOT_FOUND', 'Bank not found', 404);
  }

  if (parsed.data.type === 'common' && parsed.data.interestRate) {
    return error(res, 'VALIDATION_ERROR', 'Interest rate is only valid for saving accounts', 400);
  }

  const account = await prisma.bankAccount.create({
    data: {
      userId: req.userId!,
      bankId: parsed.data.bankId,
      name: parsed.data.name,
      type: parsed.data.type,
      balance: parsed.data.balance,
      currency: parsed.data.currency,
      interestRate: parsed.data.type === 'saving' ? parsed.data.interestRate : null,
    },
    include: { bank: true, envelopes: true },
  });

  return success(res, mapAccount(account, bank.name), 201);
}));

router.put('/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const account = await prisma.bankAccount.findFirst({
    where: { id, userId: req.userId! },
    include: { bank: true, envelopes: true },
  });
  if (!account) {
    return error(res, 'NOT_FOUND', 'Account not found', 404);
  }

  const updateData: any = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.balance !== undefined) updateData.balance = parsed.data.balance;
  if (parsed.data.currency !== undefined) updateData.currency = parsed.data.currency;
  if (parsed.data.type !== undefined) {
    updateData.type = parsed.data.type;
    if (parsed.data.type === 'common') updateData.interestRate = null;
  }
  if (parsed.data.interestRate !== undefined) {
    if (account.type !== 'saving' && !parsed.data.type) {
      return error(res, 'VALIDATION_ERROR', 'Interest rate only valid for saving accounts', 400);
    }
    if (parsed.data.type !== 'saving') {
      return error(res, 'VALIDATION_ERROR', 'Interest rate only valid for saving accounts', 400);
    }
    updateData.interestRate = parsed.data.interestRate;
  }

  const updated = await prisma.bankAccount.update({
    where: { id },
    data: updateData,
    include: { bank: true, envelopes: true },
  });

  return success(res, mapAccount(updated, updated.bank.name));
}));

router.delete('/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const account = await prisma.bankAccount.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!account) {
    return error(res, 'NOT_FOUND', 'Account not found', 404);
  }

  await prisma.bankAccount.delete({ where: { id } });

  return success(res, { message: 'Account deleted' });
}));

export default router;
