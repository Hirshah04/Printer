import { Request, Response } from 'express';
import { Worker } from '../models/Worker.js';
import { PrintJob, PrintJobStatus } from '../models/PrintJob.js';
import { Printer } from '../models/Printer.js';
import { queueService } from '../services/queue.service.js';
import { loggerService } from '../services/logger.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

export async function heartbeat(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { workerId, name, status, vpnStatus, vpnIp, gatewayIp, version, systemInfo } = req.body;
    const finalWorkerId = workerId || req.workerId || 'cloud-worker-1';

    const worker = await Worker.findOneAndUpdate(
      { workerId: finalWorkerId },
      {
        $set: {
          name: name || 'Cloud Print Worker',
          status: status || 'ONLINE',
          vpnStatus: vpnStatus || 'UNKNOWN',
          vpnIp,
          gatewayIp,
          version: version || '1.0.0',
          lastHeartbeat: new Date(),
          systemInfo,
        },
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Heartbeat acknowledged', worker });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getNextJob(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const workerId = (req.workerId || req.query.workerId || 'cloud-worker') as string;
    const job = await queueService.getNextPendingJob(workerId);

    if (!job) {
      res.json({ success: true, job: null, message: 'No pending print jobs.' });
      return;
    }

    res.json({
      success: true,
      job,
      printer: job.printerId,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateJobStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const {
      status,
      message,
      printerJobId,
      printerStatusMessage,
      errorMessage,
      verificationDetails,
    } = req.body;

    const job = await PrintJob.findById(id);
    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found.' });
      return;
    }

    if (status) {
      job.status = status as PrintJobStatus;
      job.statusHistory.push({
        status: status as PrintJobStatus,
        timestamp: new Date(),
        message: message || `Status updated to ${status}`,
      });
    }

    if (printerJobId) job.printerJobId = printerJobId;
    if (printerStatusMessage) job.printerStatusMessage = printerStatusMessage;
    if (errorMessage) job.errorMessage = errorMessage;
    if (verificationDetails) job.verificationDetails = verificationDetails;

    // Handle failure retry logic
    if (status === 'FAILED' && job.retryCount < job.maxRetries) {
      // Auto-retry if transient error (e.g. printer busy)
      if (errorMessage && (errorMessage.includes('busy') || errorMessage.includes('timeout'))) {
        job.retryCount += 1;
        job.status = 'QUEUED';
        job.statusHistory.push({
          status: 'QUEUED',
          timestamp: new Date(),
          message: `Auto-retrying recoverable failure (Attempt ${job.retryCount + 1}/${job.maxRetries}): ${errorMessage}`,
        });
        await queueService.enqueueJob(String(job._id));
      }
    }

    await job.save();

    await loggerService.info(
      `JOB_${status}`,
      `Job ${job._id} transitioned to ${status}: ${message || errorMessage || ''}`,
      { jobId: job._id, status, verificationDetails },
      String(job._id)
    );

    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updatePrinterStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { connectionStatus, paperStatus, tonerStatus, stateReasons, supportedFormats } = req.body;

    const printer = await Printer.findById(id);
    if (!printer) {
      res.status(404).json({ success: false, message: 'Printer not found.' });
      return;
    }

    if (connectionStatus) printer.connectionStatus = connectionStatus;
    if (paperStatus) printer.paperStatus = paperStatus;
    if (tonerStatus) printer.tonerStatus = tonerStatus;
    if (stateReasons) printer.stateReasons = stateReasons;
    if (supportedFormats && supportedFormats.length > 0) printer.supportedFormats = supportedFormats;
    printer.lastSeenAt = new Date();

    await printer.save();

    res.json({ success: true, printer });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
