import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';

/**
 * @swagger
 * /cash:
 *   get:
 *     summary: Get cash balance
 *     tags: [Cash]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cash balance
 * 
 *   put:
 *     summary: Update cash balance
 *     tags: [Cash]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - currency
 *             properties:
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *                 enum: [CZK, USD]
 *     responses:
 *       200:
 *         description: Cash balance updated
 */

const router = Router();
router.use(authenticate);

const updateCashSchema = z.object({
  amount: z.number(),
  currency: z.enum(['CZK', 'USD']),
});

router.get('/', handleAsync(async (req: AuthRequest, res) => {
  let cash = await prisma.cashBalance.findUnique({
    where: { userId: req.userId! },
  });

  if (!cash) {
    cash = await prisma.cashBalance.create({
      data: { userId: req.userId! },
    });
  }

  return success(res, {
    id: cash.id,
    amount: Number(cash.amount),
    currency: cash.currency,
  });
}));

router.put('/', handleAsync(async (req: AuthRequest, res) => {
  const parsed = updateCashSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const cash = await prisma.cashBalance.upsert({
    where: { userId: req.userId! },
    create: {
      userId: req.userId!,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
    },
    update: {
      amount: parsed.data.amount,
      currency: parsed.data.currency,
    },
  });

  return success(res, {
    id: cash.id,
    amount: Number(cash.amount),
    currency: cash.currency,
  });
}));

export default router;
