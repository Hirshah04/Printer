import mongoose from 'mongoose';
import { SystemLog, LogLevel } from '../models/SystemLog.js';

export class LoggerService {
  async log(
    eventType: string,
    description: string,
    level: LogLevel = 'info',
    metadata?: Record<string, any>,
    relatedJobId?: string | mongoose.Types.ObjectId,
    relatedPrinterId?: string | mongoose.Types.ObjectId
  ): Promise<void> {
    const timestamp = new Date();
    const formatted = `[${timestamp.toISOString()}] [${level.toUpperCase()}] [${eventType}] ${description}`;

    if (level === 'error') {
      console.error(formatted, metadata || '');
    } else if (level === 'warn') {
      console.warn(formatted, metadata || '');
    } else {
      console.log(formatted, metadata || '');
    }

    try {
      if (mongoose.connection.readyState === 1) {
        await SystemLog.create({
          eventType,
          level,
          description,
          metadata,
          relatedJobId: relatedJobId ? new mongoose.Types.ObjectId(relatedJobId) : undefined,
          relatedPrinterId: relatedPrinterId ? new mongoose.Types.ObjectId(relatedPrinterId) : undefined,
          timestamp,
        });
      }
    } catch (err: any) {
      // Don't crash logging if DB fails
      console.error('[LoggerService] Failed to persist system log to DB:', err.message);
    }
  }

  async info(eventType: string, description: string, metadata?: Record<string, any>, relatedJobId?: string, relatedPrinterId?: string) {
    return this.log(eventType, description, 'info', metadata, relatedJobId, relatedPrinterId);
  }

  async warn(eventType: string, description: string, metadata?: Record<string, any>, relatedJobId?: string, relatedPrinterId?: string) {
    return this.log(eventType, description, 'warn', metadata, relatedJobId, relatedPrinterId);
  }

  async error(eventType: string, description: string, metadata?: Record<string, any>, relatedJobId?: string, relatedPrinterId?: string) {
    return this.log(eventType, description, 'error', metadata, relatedJobId, relatedPrinterId);
  }
}

export const loggerService = new LoggerService();
