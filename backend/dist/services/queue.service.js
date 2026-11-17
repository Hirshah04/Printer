"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueService = exports.QueueService = void 0;
const bullmq_1 = require("bullmq");
const env_js_1 = require("../config/env.js");
const PrintJob_js_1 = require("../models/PrintJob.js");
const logger_service_js_1 = require("./logger.service.js");
let bullQueue = null;
if (env_js_1.config.redisUrl) {
    try {
        bullQueue = new bullmq_1.Queue('print-jobs', {
            connection: {
                url: env_js_1.config.redisUrl,
            },
        });
        console.log('[QueueService] BullMQ initialized with Redis.');
    }
    catch (err) {
        console.warn('[QueueService] Failed to initialize BullMQ with Redis, falling back to DB Queue:', err.message);
    }
}
else {
    console.log('[QueueService] Redis not configured. Using high-concurrency MongoDB atomic queue.');
}
class QueueService {
    async enqueueJob(jobId) {
        if (bullQueue) {
            try {
                await bullQueue.add('print', { jobId }, {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 5000 },
                    removeOnComplete: true,
                });
            }
            catch (err) {
                console.warn(`[QueueService] BullMQ add error: ${err.message}. Relying on DB atomic queue.`);
            }
        }
        // In DB, status is already 'QUEUED'
        await logger_service_js_1.loggerService.info('JOB_QUEUED', `Job ${jobId} placed in print queue`, { jobId }, jobId);
    }
    /**
     * Atomically fetch the next queued job for a worker
     */
    async getNextPendingJob(workerId) {
        // Atomically find the oldest QUEUED job and lock it to PROCESSING
        const job = await PrintJob_js_1.PrintJob.findOneAndUpdate({ status: 'QUEUED' }, {
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
        }, { sort: { createdAt: 1 }, new: true }).populate('printerId');
        return job;
    }
    /**
     * Reset stale processing jobs (e.g. if a worker crashed)
     */
    async recoverStaleJobs(staleThresholdMinutes = 10) {
        const threshold = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);
        const result = await PrintJob_js_1.PrintJob.updateMany({
            status: 'PROCESSING',
            updatedAt: { $lt: threshold },
        }, {
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
        });
        return result.modifiedCount;
    }
}
exports.QueueService = QueueService;
exports.queueService = new QueueService();
