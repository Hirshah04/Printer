import { Request, Response } from 'express';
import net from 'net';
import { dbService } from '../services/db.service.js';
import { storageService } from '../services/storage.service.js';
import { pdfService } from '../services/pdf.service.js';
import { dispatcherService } from '../services/dispatcher.service.js';
import { sseService } from '../services/sse.service.js';
import { config } from '../config/env.js';
import { hasActiveWorker, getActiveWorkerInfo } from './worker.controller.js';

export async function createJob(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No PDF file uploaded.' });
      return;
    }

    const { copies = '1', paperSize = 'A4', orientation = 'PORTRAIT' } = req.body;

    // Validate and inspect PDF buffer
    const inspection = await pdfService.inspectPDF(req.file.buffer);
    if (!inspection.valid) {
      res.status(400).json({
        success: false,
        message: inspection.errorMessage || 'Invalid or corrupted PDF file.',
      });
      return;
    }

    // Save PDF
    const { storageKey, downloadUrl } = await storageService.saveFile(
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );

    const parsedCopies = Math.max(1, Math.min(100, parseInt(copies as string, 10) || 1));
    const now = new Date().toISOString();

    // Create job record
    const job = await dbService.createJob({
      documentName: req.file.originalname,
      storageKey,
      storageUrl: downloadUrl,
      fileSizeBytes: req.file.size,
      pageCount: inspection.pageCount,
      copies: parsedCopies,
      paperSize: 'A4',
      orientation:
        orientation === 'LANDSCAPE'
          ? 'LANDSCAPE'
          : orientation === 'AUTO'
          ? inspection.suggestedOrientation
          : 'PORTRAIT',
      status: 'QUEUED',
      statusHistory: [
        {
          status: 'QUEUED',
          timestamp: now,
          message: `Document queued for printing on HP LaserJet M126nw (${config.printer.ip})`,
        },
      ],
    });

    console.log(`[JobController] Job created: ${job._id} - ${job.documentName} (${job.pageCount} p, ${job.copies}x)`);

    // In Local Worker Architecture:
    // When the worker runs locally (via start-worker.bat), it claims QUEUED jobs over HTTPS.
    // Cloud direct dispatch (to WAN port 9100) is only used as a fallback if no worker is active and worker is not required.
    if (hasActiveWorker() || process.env.REQUIRE_WORKER === 'true') {
      const worker = getActiveWorkerInfo();
      console.log(`[JobController] Print worker active [${worker?.workerId || 'local-worker'}]. Job ${job._id} queued for local worker processing.`);
    } else {
      console.log(`[JobController] No active worker detected. Direct Dispatch: Initiating hardware streaming to ${config.printer.ip}...`);
      dispatcherService.dispatch(job._id);
    }

    res.status(201).json({
      success: true,
      message: 'Print job created and sent to printer.',
      job,
      preview: {
        documentName: req.file.originalname,
        pageCount: inspection.pageCount,
        fileSizeBytes: req.file.size,
        paperSize: job.paperSize,
        copies: job.copies,
        printerIp: config.printer.ip,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getJobs(req: Request, res: Response): Promise<void> {
  try {
    const { status, search } = req.query;
    const jobs = await dbService.getAllJobs({
      status: status as string | undefined,
      search: search as string | undefined,
    });

    res.json({
      success: true,
      jobs,
      total: jobs.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getJobById(req: Request, res: Response): Promise<void> {
  try {
    const job = await dbService.getJobById(req.params.id);
    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found.' });
      return;
    }

    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function retryJob(req: Request, res: Response): Promise<void> {
  try {
    const job = await dbService.retryJob(req.params.id);
    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found.' });
      return;
    }

    console.log(`[JobController] Job ${job._id} retried - re-queued for processing`);
    if (!hasActiveWorker() && process.env.REQUIRE_WORKER !== 'true') {
      dispatcherService.dispatch(job._id);
    } else {
      console.log(`[JobController] Print worker active, retried job ${job._id} will be claimed by worker.`);
    }

    res.json({ success: true, message: 'Job re-queued and printing.', job });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function cancelJob(req: Request, res: Response): Promise<void> {
  try {
    const job = await dbService.cancelJob(req.params.id);
    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found.' });
      return;
    }

    console.log(`[JobController] Job ${job._id} cancelled by user`);
    sseService.broadcastJobUpdate(job);

    // Send hardware PJL RESET to Port 9100 to abort any active printer feed / spooling buffer
    try {
      const resetSocket = new net.Socket();
      resetSocket.setTimeout(4000);
      resetSocket.connect(config.printer.rawPort || 9100, config.printer.ip, () => {
        resetSocket.write(Buffer.from('\x1b%-12345X@PJL\r\n@PJL RESET\r\n\x1b%-12345X', 'ascii'), () => {
          resetSocket.end();
          setTimeout(() => resetSocket.destroy(), 500);
        });
      });
      resetSocket.on('error', () => resetSocket.destroy());
      resetSocket.on('timeout', () => resetSocket.destroy());
    } catch {
      // Best-effort hardware cancel
    }

    res.json({ success: true, message: 'Job cancelled successfully.', job });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function downloadDocument(req: Request, res: Response): Promise<void> {
  try {
    const { storageKey } = req.params;
    const { stream, contentType } = await storageService.getFileStream(storageKey);

    res.setHeader('Content-Type', contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${storageKey}"`);
    stream.pipe(res);
  } catch (err: any) {
    res.status(404).json({ success: false, message: err.message || 'File not found.' });
  }
}
