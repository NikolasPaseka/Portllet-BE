import { Response, NextFunction } from 'express';
import { validateAccessToken, JwtPayload } from '../services/jwtService.js';
import { AuthRequest, error } from '../utils/response.js';

export { AuthRequest };

export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'UNAUTHORIZED', 'Missing or invalid authorization header', 401);
  }

  const token = authHeader.split(' ')[1];
  const payload = validateAccessToken(token);

  if (!payload) {
    return error(res, 'UNAUTHORIZED', 'Invalid or expired token', 401);
  }

  req.userId = (payload as JwtPayload).sub;
  next();
}
