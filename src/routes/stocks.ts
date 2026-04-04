import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';
import { getStockPrice, getStockPrices } from '../services/priceService.js';

/**
 * @swagger
 * /stocks:
 *   get:
 *     summary: List all stocks
 *     tags: [Stocks]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of stocks with live prices from Yahoo Finance
 * 
 *   post:
 *     summary: Create a stock
 *     tags: [Stocks]
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
 *               - ticker
 *               - shares
 *             properties:
 *               name:
 *                 type: string
 *               ticker:
 *                 type: string
 *               shares:
 *                 type: number
 *     responses:
 *       201:
 *         description: Stock created with live price
 */

const router = Router();
router.use(authenticate);

const createStockSchema = z.object({
  name: z.string().min(1),
  ticker: z.string().min(1),
  shares: z.number(),
});

const updateStockSchema = z.object({
  name: z.string().min(1).optional(),
  ticker: z.string().min(1).optional(),
  shares: z.number().optional(),
});

function mapStock(s: any, livePrice: number | null) {
  return {
    id: s.id,
    name: s.name,
    ticker: s.ticker,
    shares: Number(s.shares),
    livePriceUsd: livePrice,
    totalValueUsd: livePrice != null ? Number((Number(s.shares) * livePrice).toFixed(4)) : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

router.get('/', handleAsync(async (req: AuthRequest, res) => {
  const stocks = await prisma.stock.findMany({
    where: { userId: req.userId! },
    orderBy: { name: 'asc' },
  });

  const tickers = [...new Set(stocks.map((s) => s.ticker))];
  const priceMap = await getStockPrices(tickers);

  const result = stocks.map((s) => mapStock(s, priceMap[s.ticker] ?? null));

  return success(res, result);
}));

router.post('/', handleAsync(async (req: AuthRequest, res) => {
  const parsed = createStockSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const stock = await prisma.stock.create({
    data: {
      userId: req.userId!,
      name: parsed.data.name,
      ticker: parsed.data.ticker.toUpperCase(),
      shares: parsed.data.shares,
    },
  });

  const livePrice = await getStockPrice(stock.ticker);

  return success(res, mapStock(stock, livePrice), 201);
}));

router.put('/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const parsed = updateStockSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const stock = await prisma.stock.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!stock) {
    return error(res, 'NOT_FOUND', 'Stock not found', 404);
  }

  const updateData: any = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.ticker !== undefined) updateData.ticker = parsed.data.ticker.toUpperCase();
  if (parsed.data.shares !== undefined) updateData.shares = parsed.data.shares;

  const updated = await prisma.stock.update({
    where: { id },
    data: updateData,
  });

  const livePrice = await getStockPrice(updated.ticker);

  return success(res, mapStock(updated, livePrice));
}));

router.delete('/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const stock = await prisma.stock.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!stock) {
    return error(res, 'NOT_FOUND', 'Stock not found', 404);
  }

  await prisma.stock.delete({ where: { id } });

  return success(res, { message: 'Stock deleted' });
}));

export default router;
