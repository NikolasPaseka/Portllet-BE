import { Router } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';

/**
 * @swagger
 * /assets:
 *   get:
 *     summary: List all other assets
 *     tags: [Assets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of assets
 * 
 *   post:
 *     summary: Create an asset
 *     tags: [Assets]
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
 *               - value
 *               - currency
 *             properties:
 *               name:
 *                 type: string
 *               value:
 *                 type: number
 *               currency:
 *                 type: string
 *                 enum: [CZK, USD]
 *               note:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Asset created
 */

const router = Router();
router.use(authenticate);

const createAssetSchema = z.object({
  name: z.string().min(1),
  value: z.number(),
  currency: z.enum(['CZK', 'USD']),
  note: z.string().nullable().optional(),
});

const updateAssetSchema = z.object({
  name: z.string().min(1).optional(),
  value: z.number().optional(),
  currency: z.enum(['CZK', 'USD']).optional(),
  note: z.string().nullable().optional(),
});

function mapAsset(a: any) {
  return {
    id: a.id,
    name: a.name,
    value: Number(a.value),
    currency: a.currency,
    note: a.note,
    createdAt: a.createdAt,
  };
}

router.get('/', handleAsync(async (req: AuthRequest, res) => {
  const assets = await prisma.otherAsset.findMany({
    where: { userId: req.userId! },
    orderBy: { name: 'asc' },
  });

  return success(res, assets.map(mapAsset));
}));

router.post('/', handleAsync(async (req: AuthRequest, res) => {
  const parsed = createAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const asset = await prisma.otherAsset.create({
    data: {
      userId: req.userId!,
      name: parsed.data.name,
      value: parsed.data.value,
      currency: parsed.data.currency,
      note: parsed.data.note ?? null,
    },
  });

  return success(res, mapAsset(asset), 201);
}));

router.put('/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const parsed = updateAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const asset = await prisma.otherAsset.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!asset) {
    return error(res, 'NOT_FOUND', 'Asset not found', 404);
  }

  const updateData: any = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.value !== undefined) updateData.value = parsed.data.value;
  if (parsed.data.currency !== undefined) updateData.currency = parsed.data.currency;
  if (parsed.data.note !== undefined) updateData.note = parsed.data.note;

  const updated = await prisma.otherAsset.update({
    where: { id },
    data: updateData,
  });

  return success(res, mapAsset(updated));
}));

router.delete('/:id', handleAsync(async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const asset = await prisma.otherAsset.findFirst({
    where: { id, userId: req.userId! },
  });
  if (!asset) {
    return error(res, 'NOT_FOUND', 'Asset not found', 404);
  }

  await prisma.otherAsset.delete({ where: { id } });

  return success(res, { message: 'Asset deleted' });
}));

export default router;
