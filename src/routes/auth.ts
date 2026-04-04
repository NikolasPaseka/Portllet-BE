import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import prisma from '../db.js';
import { generateAccessToken, generateRefreshToken, validateAccessToken } from '../services/jwtService.js';
import { authenticate } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { success, error, handleAsync } from '../utils/response.js';

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already registered
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid or expired refresh token
 */

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logout successful
 */

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user info
 *       401:
 *         description: Unauthorized
 */

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});

router.post('/register', handleAsync(async (req: AuthRequest, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const { email, password, name } = parsed.data;
  const emailLower = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: emailLower } });
  if (existing) {
    return error(res, 'CONFLICT', 'Email already registered', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email: emailLower,
      passwordHash,
      name,
      cashBalance: { create: {} },
    },
  });

  const accessToken = generateAccessToken(user.id, user.email, user.name);
  const refreshTokenStr = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshTokenStr,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return success(res, {
    accessToken,
    refreshToken: refreshTokenStr,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
  }, 201);
}));

router.post('/login', handleAsync(async (req: AuthRequest, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return error(res, 'UNAUTHORIZED', 'Invalid email or password', 401);
  }

  const accessToken = generateAccessToken(user.id, user.email, user.name);
  const refreshTokenStr = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      token: refreshTokenStr,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return success(res, {
    accessToken,
    refreshToken: refreshTokenStr,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    },
  });
}));

router.post('/refresh', handleAsync(async (req: AuthRequest, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  const stored = await prisma.refreshToken.findFirst({
    where: {
      token: parsed.data.refreshToken,
      isRevoked: false,
    },
    include: { user: true },
  });

  if (!stored || stored.expiresAt < new Date()) {
    return error(res, 'UNAUTHORIZED', 'Invalid or expired refresh token', 401);
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { isRevoked: true },
  });

  const newRefreshTokenStr = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId: stored.userId,
      token: newRefreshTokenStr,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const accessToken = generateAccessToken(stored.user.id, stored.user.email, stored.user.name);

  return success(res, {
    accessToken,
    refreshToken: newRefreshTokenStr,
    user: {
      id: stored.user.id,
      email: stored.user.email,
      name: stored.user.name,
      createdAt: stored.user.createdAt,
    },
  });
}));

router.post('/logout', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const parsed = logoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return error(res, 'VALIDATION_ERROR', 'Invalid input', 400, parsed.error.flatten());
  }

  await prisma.refreshToken.updateMany({
    where: {
      token: parsed.data.refreshToken,
      userId: req.userId,
    },
    data: { isRevoked: true },
  });

  return success(res, { message: 'Logged out successfully' });
}));

router.get('/me', authenticate, handleAsync(async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    return error(res, 'NOT_FOUND', 'User not found', 404);
  }

  return success(res, {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  });
}));

export default router;
