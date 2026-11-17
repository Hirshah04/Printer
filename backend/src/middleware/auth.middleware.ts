import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';

export interface AuthenticatedRequest extends Request {
  workerId?: string;
}

export function authenticateWorker(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-worker-api-key'];
  if (!apiKey || apiKey !== config.workerApiKey) {
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid or missing worker API key.' });
    return;
  }
  req.workerId = (req.headers['x-worker-id'] as string) || 'unknown-worker';
  next();
}
