import { Request, Response } from 'express';
import mongoose from 'express';
import { PrintJob } from '../models/PrintJob.js';
import { Printer } from '../models/Printer.js';
import { storageService } from '../services/storage.service.js';
import { pdfService } from '../services/pdf.service.js';
import { queueService } from '../services/queue.service.js';
import { loggerService } from '../services/logger.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';

export async function createJob(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: 'No PDF file uploaded.' });
      return;
    }

    const { printerId, copies = '1', paperSize = 'A4', orientation = 'PORTRAIT' } = req.body;

    // Validate printer
    let targetPrinter = null;
    if (printerId) {
      targetPrinter = await Printer.findById(printerId);
    } else {
      // Find default printer
      targetPrinter = await Printer.findOne({ isDefault: true, enabled: true });
      if (!targetPrinter) {
        targetPrinter = await Printer.findOne({ enabled: true });
      }
    }

    if (!targetPrinter) {
      res.status(400).json({ success: false, message: 'No active printer configured or available.' });
      return;
    }

    // Inspect PDF buffer
    const inspection = await pdfService.inspectPDF(req.file.buffer);
    if (!inspection.valid) {
      res.status(400).json({
        success: false,
        message: inspection.errorMessage || 'Invalid or corrupted PDF file.',
      });
      return;
    }

    // Store PDF
    const { storageKey, downloadUrl } = await storageService.saveFile(
      req.file.originalname,
      req.file.buffer,
      req.file.mimetype
    );

    const parsedCopies = Math.max(1, Math.min(100, parseInt(copies as string, 10) || 1));

    // Create PrintJob record
    const job = await PrintJob.create({
      userId: req.user._id,
      printerId: targetPrinter._id,
      documentName: req.file.originalname,
      storageKey,
      storageUrl: downloadUrl,
      fileSizeBytes: req.file.size,
      pageCount: inspection.pageCount,
      copies: parsedCopies,
      paperSize: paperSize === 'Letter' ? 'Letter' : 'A4',
      orientation: orientation === 'LANDSCAPE' ? 'LANDSCAPE' : orientation === 'AUTO' ? inspection.suggestedOrientation : 'PORTRAIT',
      status: 'QUEUED',
      statusHistory: [
        {
          status: 'QUEUED',
          timestamp: new Date(),
          message: `Job created with ${inspection.pageCount} page(s), ${parsedCopies} copy(ies)`,
        },
      ],
    });

    // Enqueue
    await queueService.enqueueJob(String(job._id));

    await loggerService.info(
      'JOB_CREATED',
      `Job created for ${req.file.originalname} (${inspection.pageCount} pages, target: ${targetPrinter.name})`,
      { jobId: job._id, printer: targetPrinter.name },
      String(job._id),
      String(targetPrinter._id)
    );

    res.status(201).json({
      success: true,
      message: 'Print job created and queued successfully.',
      job,
      preview: {
        documentName: req.file.originalname,
        pageCount: inspection.pageCount,
        fileSizeBytes: req.file.size,
        paperSize: job.paperSize,
        copies: job.copies,
        dimensions: inspection.dimensions,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getJobs(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const { page = '1', limit = '20', status, printerId, search } = req.query;
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 20;

    const filter: Record<string, any> = {};

    // If regular user, only see own jobs
    if (req.user.role !== 'admin') {
      filter.userId = req.user._id;
    }

    if (status) {
      filter.status = status;
    }

    if (printerId) {
      filter.printerId = printerId;
    }

    if (search) {
      filter.documentName = { $regex: search, $options: 'i' };
    }

    const total = await PrintJob.countDocuments(filter);
    const jobs = await PrintJob.find(filter)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .populate('printerId', 'name brand model lanIp connectionStatus')
      .populate('userId', 'name email');

    res.json({
      success: true,
      jobs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getJobById(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const job = await PrintJob.findById(req.params.id)
      .populate('printerId')
      .populate('userId', 'name email');

    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found.' });
      return;
    }

    // Security check: non-admin can only access own jobs
    if (req.user && req.user.role !== 'admin' && String(job.userId._id) !== String(req.user._id)) {
      res.status(403).json({ success: false, message: 'Forbidden: You do not own this print job.' });
      return;
    }

    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function retryJob(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const job = await PrintJob.findById(req.params.id);
    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found.' });
      return;
    }

    if (job.status !== 'FAILED' && job.status !== 'CANCELLED') {
      res.status(400).json({ success: false, message: `Cannot retry job in status: ${job.status}` });
      return;
    }

    job.status = 'QUEUED';
    job.retryCount += 1;
    job.errorMessage = undefined;
    job.statusHistory.push({
      status: 'QUEUED',
      timestamp: new Date(),
      message: `Manually retried (Attempt ${job.retryCount + 1})`,
    });

    await job.save();
    await queueService.enqueueJob(String(job._id));

    await loggerService.info('JOB_RETRIED', `Job ${job._id} retried`, { jobId: job._id }, String(job._id));

    res.json({ success: true, message: 'Job re-queued successfully.', job });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function cancelJob(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const job = await PrintJob.findById(req.params.id);
    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found.' });
      return;
    }

    if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) {
      res.status(400).json({ success: false, message: `Cannot cancel job already in status: ${job.status}` });
      return;
    }

    job.status = 'CANCELLED';
    job.statusHistory.push({
      status: 'CANCELLED',
      timestamp: new Date(),
      message: 'Job cancelled by user/admin',
    });

    await job.save();
    await loggerService.info('JOB_CANCELLED', `Job ${job._id} cancelled`, { jobId: job._id }, String(job._id));

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
