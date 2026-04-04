import { Router, Request } from 'express';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';
import { getUsdToCzkRate, convertToCzk } from '../services/fxService.js';
import { getStockPrices, getCryptoPrices } from '../services/priceService.js';

/**
 * @swagger
 * /fx/rate:
 *   get:
 *     summary: Get FX rate (public)
 *     tags: [Dashboard]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           default: USD
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           default: CZK
 *     responses:
 *       200:
 *         description: FX rate retrieved
 *       400:
 *         description: Unsupported currency pair
 */

/**
 * @swagger
 * /dashboard:
 *   get:
 *     summary: Get portfolio overview
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Portfolio overview with all assets in CZK
 *       401:
 *         description: Unauthorized
 */

const router = Router();

// Public - no auth required
router.get('/fx/rate', handleAsync(async (req: Request, res) => {
  const from = (req.query.from as string)?.toUpperCase();
  const to = (req.query.to as string)?.toUpperCase();

  if (from === 'USD' && to === 'CZK') {
    const rate = await getUsdToCzkRate();
    console.log(`FX rate USD/CZK: ${rate}`);
    return success(res, { from: 'USD', to: 'CZK', rate: Math.round(rate * 10000) / 10000 });
  }

  return error(res, 'UNSUPPORTED_PAIR', `Currency pair ${from}/${to} not supported. Supported: USD/CZK`, 400);
}));

// Protected
router.get('/dashboard', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const rate = await getUsdToCzkRate();

  const cash = await prisma.cashBalance.findUnique({
    where: { userId: req.userId! },
  });
  const cashCzk = cash ? convertToCzk(Number(cash.amount), cash.currency, rate) : 0;

  const accounts = await prisma.bankAccount.findMany({
    where: { userId: req.userId! },
  });
  const banksCzk = accounts.reduce(
    (sum: number, a: any) => sum + convertToCzk(Number(a.balance), a.currency, rate),
    0
  );

  const stocks = await prisma.stock.findMany({
    where: { userId: req.userId! },
  });
  const stockTickers = [...new Set(stocks.map((s: any) => s.ticker))] as string[];
  const stockPrices = await getStockPrices(stockTickers);
  const stocksCzk = stocks.reduce((sum: number, s: any) => {
    const livePrice = stockPrices[s.ticker];
    return sum + (livePrice != null ? convertToCzk(Number(s.shares) * livePrice, 'USD', rate) : 0);
  }, 0);

  const cryptos = await prisma.crypto.findMany({
    where: { userId: req.userId! },
  });
  const cryptoSymbols = [...new Set(cryptos.map((c: any) => c.symbol.toUpperCase()))] as string[];
  const cryptoPrices = await getCryptoPrices(cryptoSymbols);
  const cryptoCzk = cryptos.reduce((sum: number, c: any) => {
    const livePrice = cryptoPrices[c.symbol.toUpperCase()];
    return sum + (livePrice != null ? convertToCzk(Number(c.amount) * livePrice, 'USD', rate) : 0);
  }, 0);

  const assets = await prisma.otherAsset.findMany({
    where: { userId: req.userId! },
  });
  const otherCzk = assets.reduce(
    (sum: number, a: any) => sum + convertToCzk(Number(a.value), a.currency, rate),
    0
  );

  const totalCzk = cashCzk + banksCzk + stocksCzk + cryptoCzk + otherCzk;

  return success(res, {
    cash_czk: Math.round(cashCzk * 100) / 100,
    banks_czk: Math.round(banksCzk * 100) / 100,
    stocks_czk: Math.round(stocksCzk * 100) / 100,
    crypto_czk: Math.round(cryptoCzk * 100) / 100,
    other_czk: Math.round(otherCzk * 100) / 100,
    total_czk: Math.round(totalCzk * 100) / 100,
    fx_rate_usd_czk: Math.round(rate * 10000) / 10000,
  });
}));

export default router;