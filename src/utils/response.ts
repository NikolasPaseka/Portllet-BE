import { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  userId?: string;
}

export function success<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data });
}

export function error(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: unknown
): Response {
  return res.status(status).json({
    success: false,
    error: { code, message, details },
  });
}

export function handleAsync(
  fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
