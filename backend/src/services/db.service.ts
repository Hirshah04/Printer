import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';

export type PrintJobStatus =
  | 'UPLOADING'
  | 'UPLOADED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SENT_TO_PRINTER'
  | 'PRINTER_ACCEPTED'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface PrintJob {
  _id: string;
  documentName: string;
  storageKey: string;
  storageUrl?: string;
  fileSizeBytes: number;
  pageCount: number;
  copies: number;
  paperSize: 'A4' | 'Letter';
  orientation: 'PORTRAIT' | 'LANDSCAPE' | 'AUTO';
  status: PrintJobStatus;
  statusHistory: Array<{ status: PrintJobStatus; timestamp: string; message?: string }>;
  printerJobId?: string;
  printerStatusMessage?: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  verificationDetails?: {
    verifiedAt?: string;
    evidence?: string;
    finalPrinterState?: string;
    sheetsPrinted?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PrinterState {
  name: string;
  brand: string;
  model: string;
  lanIp: string;
  ippPort: number;
  ippEndpoint: string;
  supportedFormats: string[];
  connectionStatus: 'ONLINE' | 'OFFLINE' | 'UNREACHABLE' | 'BUSY' | 'ERROR';
  paperStatus: 'OK' | 'LOW' | 'EMPTY' | 'OUT' | 'UNKNOWN';
  tonerStatus: 'OK' | 'LOW' | 'EMPTY' | 'OUT' | 'UNKNOWN';
  stateReasons: string[];
  lastSeenAt?: string;
}

class JsonDbService {
  private jobs: PrintJob[] = [];
  private printerState: PrinterState = {
    name: config.printer.name,
    brand: config.printer.brand,
    model: config.printer.model,
    lanIp: config.printer.ip,
    ippPort: config.printer.port,
    ippEndpoint: config.printer.endpoint,
    supportedFormats: config.printer.supportedFormats,
    connectionStatus: 'OFFLINE',
    paperStatus: 'UNKNOWN',
    tonerStatus: 'UNKNOWN',
    stateReasons: [],
  };

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      const dir = path.dirname(config.dataFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(config.dataFile)) {
        const raw = fs.readFileSync(config.dataFile, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.jobs)) {
          this.jobs = data.jobs;
        }
        if (data.printerState) {
          this.printerState = { ...this.printerState, ...data.printerState };
        }
        console.log(`[JSON Store] Loaded ${this.jobs.length} jobs from ${config.dataFile}`);
      }
    } catch (err: any) {
      console.warn('[JSON Store] Could not load data file, starting with empty store:', err.message);
    }
  }

  private saveToDisk(): void {
    try {
      const data = {
        printerState: this.printerState,
        jobs: this.jobs,
        lastSaved: new Date().toISOString(),
      };
      fs.writeFileSync(config.dataFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[JSON Store] Failed to save to disk:', err.message);
    }
  }

  // --- Print Jobs API ---

  async createJob(data: Omit<PrintJob, '_id' | 'createdAt' | 'updatedAt' | 'retryCount' | 'maxRetries'>): Promise<PrintJob> {
    const now = new Date().toISOString();
    const newJob: PrintJob = {
      ...data,
      _id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      retryCount: 0,
      maxRetries: 3,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.unshift(newJob);
    this.saveToDisk();
    return newJob;
  }

  async getAllJobs(filter?: { status?: string; search?: string }): Promise<PrintJob[]> {
    let result = [...this.jobs];

    if (filter?.status) {
      result = result.filter((j) => j.status === filter.status);
    }
    if (filter?.search) {
      const term = filter.search.toLowerCase();
      result = result.filter((j) => j.documentName.toLowerCase().includes(term));
    }

    return result;
  }

  async getJobById(id: string): Promise<PrintJob | null> {
    return this.jobs.find((j) => j._id === id) || null;
  }

  /**
   * Atomically claims the oldest QUEUED job for the worker
   */
  async claimNextQueuedJob(workerId: string): Promise<PrintJob | null> {
    // Find oldest job with status QUEUED
    const index = [...this.jobs].reverse().findIndex((j) => j.status === 'QUEUED');
    if (index === -1) return null;

    const actualIndex = this.jobs.length - 1 - index;
    const job = this.jobs[actualIndex];

    const now = new Date().toISOString();
    job.status = 'PROCESSING';
    job.updatedAt = now;
    job.statusHistory.push({
      status: 'PROCESSING',
      timestamp: now,
      message: `Claimed by Cloud Print Worker [${workerId}]`,
    });

    this.saveToDisk();
    return job;
  }

  async updateJob(
    id: string,
    updates: {
      status?: PrintJobStatus;
      message?: string;
      printerJobId?: string;
      printerStatusMessage?: string;
      errorMessage?: string;
      verificationDetails?: any;
    }
  ): Promise<PrintJob | null> {
    const job = this.jobs.find((j) => j._id === id);
    if (!job) return null;

    const now = new Date().toISOString();
    job.updatedAt = now;

    if (updates.status) {
      job.status = updates.status;
      job.statusHistory.push({
        status: updates.status,
        timestamp: now,
        message: updates.message || `Status updated to ${updates.status}`,
      });
    }

    if (updates.printerJobId) job.printerJobId = updates.printerJobId;
    if (updates.printerStatusMessage) job.printerStatusMessage = updates.printerStatusMessage;
    if (updates.errorMessage) job.errorMessage = updates.errorMessage;
    if (updates.verificationDetails) job.verificationDetails = updates.verificationDetails;

    this.saveToDisk();
    return job;
  }

  async retryJob(id: string): Promise<PrintJob | null> {
    const job = this.jobs.find((j) => j._id === id);
    if (!job) return null;

    const now = new Date().toISOString();
    job.status = 'QUEUED';
    job.retryCount += 1;
    job.errorMessage = undefined;
    job.updatedAt = now;
    job.statusHistory.push({
      status: 'QUEUED',
      timestamp: now,
      message: `Retried manually (Attempt ${job.retryCount + 1})`,
    });

    this.saveToDisk();
    return job;
  }

  async cancelJob(id: string): Promise<PrintJob | null> {
    const job = this.jobs.find((j) => j._id === id);
    if (!job) return null;

    const now = new Date().toISOString();
    job.status = 'CANCELLED';
    job.updatedAt = now;
    job.statusHistory.push({
      status: 'CANCELLED',
      timestamp: now,
      message: 'Job cancelled by user',
    });

    this.saveToDisk();
    return job;
  }

  // --- Printer State API ---

  getPrinter(): PrinterState {
    return this.printerState;
  }

  updatePrinterState(updates: Partial<PrinterState>): PrinterState {
    this.printerState = {
      ...this.printerState,
      ...updates,
      lastSeenAt: new Date().toISOString(),
    };
    this.saveToDisk();
    return this.printerState;
  }
}

export const dbService = new JsonDbService();
