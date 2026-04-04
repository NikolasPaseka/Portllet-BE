import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

export function generateAccessToken(userId: string, email: string, name: string): string {
  return jwt.sign(
    {
      sub: userId,
      email,
      name,
    },
    config.jwt.secret,
    {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      expiresIn: `${config.jwt.expiresInMinutes}m`,
    }
  );
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('base64');
}

export function validateAccessToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
    }) as JwtPayload;
    return payload;
  } catch {
    return null;
  }
}
