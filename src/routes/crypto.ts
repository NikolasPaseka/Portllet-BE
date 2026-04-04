import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';
import { getCryptoPrice, getCryptoPrices } from '../services/priceService.js';

/**
 * @swagger
 * /crypto:
 *   get:
 *     summary: List all crypto holdings
 *     tags: [Crypto]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of crypto with live prices from Yahoo Finance
 * 
 *   post:
 *     summary: Create a crypto holding
 *     tags: [Crypto]
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
 *               - symbol
 *               - amount
 *             properties:
 *               name:
 *                 type: string
 *               symbol:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       201:
 *         description: Crypto created with live price
 */

const router = Router();
router.use(authenticate);

const createCryptoSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  amount: z.number(),
});

const updateCryptoSchema = z.object({
  name: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  amount: z.number().optional(),
});

function mapCrypto(c: any, livePrice: number | null) {
  return {
    id: c.id,
    name: c.name,
    symbol: c.symbol,
    amount: Number(c.amount),
    livePriceUsd: livePrice,
    totalValueUsd: livePrice != null ? Number((Number(c.amount) * livePrice).toFixed(4)) : null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

router.get('/', handleAsync(async (req: AuthRequest, res) => {
  const cryptos = await prisma.crypto.findMany({
    where: { userId: req.userId! },
    orderBy: { name: 'asc' },
  });

  const symbols = [...new Set(cryptos.map((c) => c.symbol))] as string[];
  const priceMap = await getCryptoPrices(symbols);

  const result = cryptos.map((c) => mapCrypto(c, priceMap[c.symbol.toUpperCase()] ?? null));

  return success(res, result);
}));

router.post('/', handleAsync(async (req: AuthRequest, res) => {
  const parsed = createCryptoSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const crypto = await prisma.crypto.create({
    data: {
      userId: req.userId!,
      name: parsed.data.name,
      symbol: parsed.data.symbol.toUpperCase(),
      amount: parsed.data.amount,
    },
  });

  const livePrice = await getCryptoPrice(crypto.symbol);

  return success(res, mapCrypto(crypto, livePrice), 201);
}));

router.put('/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const parsed = updateCryptoSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const crypto = await prisma.crypto.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!crypto) {
    return error(res, 'NOT_FOUND', 'Crypto not found', 404);
  }

  const updateData: any = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.symbol !== undefined) updateData.symbol = parsed.data.symbol.toUpperCase();
  if (parsed.data.amount !== undefined) updateData.amount = parsed.data.amount;

  const updated = await prisma.crypto.update({
    where: { id },
    data: updateData,
  });

  const livePrice = await getCryptoPrice(updated.symbol);

  return success(res, mapCrypto(updated, livePrice));
}));

router.delete('/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const crypto = await prisma.crypto.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!crypto) {
    return error(res, 'NOT_FOUND', 'Crypto not found', 404);
  }

  await prisma.crypto.delete({ where: { id } });

  return success(res, { message: 'Crypto deleted' });
}));

export default router;
