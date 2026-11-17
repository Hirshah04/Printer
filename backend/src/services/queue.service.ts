import { Queue } from 'bullmq';
import { config } from '../config/env.js';
import { PrintJob, IPrintJob } from '../models/PrintJob.js';
import { loggerService } from './logger.service.js';

let bullQueue: Queue | null = null;

if (config.redisUrl) {
  try {
    bullQueue = new Queue('print-jobs', {
      connection: {
        url: config.redisUrl,
      },
    });
    console.log('[QueueService] BullMQ initialized with Redis.');
  } catch (err: any) {
    console.warn('[QueueService] Failed to initialize BullMQ with Redis, falling back to DB Queue:', err.message);
  }
} else {
  console.log('[QueueService] Redis not configured. Using high-concurrency MongoDB atomic queue.');
}

export class QueueService {
  async enqueueJob(jobId: string): Promise<void> {
    if (bullQueue) {
      try {
        await bullQueue.add('print', { jobId }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: true,
        });
      } catch (err: any) {
        console.warn(`[QueueService] BullMQ add error: ${err.message}. Relying on DB atomic queue.`);
      }
    }
    // In DB, status is already 'QUEUED'
    await loggerService.info('JOB_QUEUED', `Job ${jobId} placed in print queue`, { jobId }, jobId);
  }

  /**
   * Atomically fetch the next queued job for a worker
   */
  async getNextPendingJob(workerId: string): Promise<IPrintJob | null> {
    // Atomically find the oldest QUEUED job and lock it to PROCESSING
    const job = await PrintJob.findOneAndUpdate(
      { status: 'QUEUED' },
      {
        $set: {
          status: 'PROCESSING',
          updatedAt: new Date(),
        },
        $push: {
          statusHistory: {
            status: 'PROCESSING',
            timestamp: new Date(),
            message: `Claimed by Cloud Worker [${workerId}]`,
          },
        },
      },
      { sort: { createdAt: 1 }, new: true }
    ).populate('printerId');

    return job;
  }

  /**
   * Reset stale processing jobs (e.g. if a worker crashed)
   */
  async recoverStaleJobs(staleThresholdMinutes = 10): Promise<number> {
    const threshold = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);
    const result = await PrintJob.updateMany(
      {
        status: 'PROCESSING',
        updatedAt: { $lt: threshold },
      },
      {
        $set: {
          status: 'QUEUED',
          updatedAt: new Date(),
        },
        $push: {
          statusHistory: {
            status: 'QUEUED',
            timestamp: new Date(),
            message: 'Recovered stale processing job back to queue',
          },
        },
      }
    );
    return result.modifiedCount;
  }
}

export const queueService = new QueueService();
