import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';

/**
 * @swagger
 * /banks:
 *   get:
 *     summary: List all banks
 *     tags: [Banks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of banks
 * 
 *   post:
 *     summary: Create a bank
 *     tags: [Banks]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Bank created
 */

const router = Router();
router.use(authenticate);

const createBankSchema = z.object({ name: z.string().min(1) });
const updateBankSchema = z.object({ name: z.string().min(1) });

function mapAccount(account: any, bankName: string) {
  return {
    id: account.id,
    bankId: account.bankId,
    bankName,
    name: account.name,
    type: account.type,
    balance: Number(account.balance),
    currency: account.currency,
    interestRate: account.interestRate ? Number(account.interestRate) : null,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    envelopes: (account.envelopes || []).map((e: any) => ({
      id: e.id,
      accountId: e.accountId,
      name: e.name,
      targetAmount: Number(e.targetAmount),
      currentAmount: Number(e.currentAmount),
      createdAt: e.createdAt,
    })),
  };
}

router.get('/', handleAsync(async (req: AuthRequest, res) => {
  const banks = await prisma.bank.findMany({
    where: { userId: req.userId! },
    include: {
      bankAccounts: {
        include: { envelopes: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const result = banks.map((b: any) => ({
    id: b.id,
    name: b.name,
    createdAt: b.createdAt,
    accounts: b.bankAccounts.map((a: any) => mapAccount(a, b.name)),
  }));

  return success(res, result);
}));

router.post('/', handleAsync(async (req: AuthRequest, res) => {
  const parsed = createBankSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const existing = await prisma.bank.findFirst({
    where: { userId: req.userId!, name: parsed.data.name },
  });
  if (existing) {
    return error(res, 'CONFLICT', 'A bank with this name already exists', 409);
  }

  const bank = await prisma.bank.create({
    data: { userId: req.userId!, name: parsed.data.name },
  });

  return success(res, {
    id: bank.id,
    name: bank.name,
    createdAt: bank.createdAt,
    accounts: [],
  }, 201);
}));

router.put('/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const parsed = updateBankSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const bank = await prisma.bank.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!bank) {
    return error(res, 'NOT_FOUND', 'Bank not found', 404);
  }

  const duplicate = await prisma.bank.findFirst({
    where: { userId: req.userId!, name: parsed.data.name, NOT: { id } },
  });
  if (duplicate) {
    return error(res, 'CONFLICT', 'A bank with this name already exists', 409);
  }

  const updated = await prisma.bank.update({
    where: { id },
    data: { name: parsed.data.name },
  });

  return success(res, {
    id: updated.id,
    name: updated.name,
    createdAt: updated.createdAt,
    accounts: [],
  });
}));

router.delete('/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const bank = await prisma.bank.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!bank) {
    return error(res, 'NOT_FOUND', 'Bank not found', 404);
  }

  await prisma.bank.delete({ where: { id } });

  return success(res, { message: 'Bank deleted' });
}));

export { mapAccount };
export default router;
