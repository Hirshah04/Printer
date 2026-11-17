import { Response } from 'express';
import { dbService, PrinterState, PrintJob } from './db.service.js';

class SseService {
  private clients: Set<Response> = new Set();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Send comment keepalive every 15 seconds to prevent browser/proxy timeouts
    this.heartbeatTimer = setInterval(() => {
      this.clients.forEach((res) => {
        try {
          res.write(': keepalive\n\n');
        } catch {
          this.clients.delete(res);
        }
      });
    }, 15000);
  }

  /**
   * Register a new SSE client connection and send initial snapshot
   */
  async registerClient(res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    this.clients.add(res);

    res.on('close', () => {
      this.clients.delete(res);
    });

    // Send initial snapshot immediately
    try {
      const printer = dbService.getPrinter();
      const activeJobs = await dbService.getActiveJobs();
      const payload = JSON.stringify({ printer, activeJobs, timestamp: new Date().toISOString() });
      res.write(`event: init\ndata: ${payload}\n\n`);
    } catch (err: any) {
      console.warn('[SSE] Error sending initial snapshot:', err.message);
    }
  }

  /**
   * Broadcast printer status update to all connected clients
   */
  broadcastPrinterUpdate(printer: PrinterState): void {
    const payload = JSON.stringify({ printer, timestamp: new Date().toISOString() });
    this.emitEvent('printer', payload);
  }

  /**
   * Broadcast job status update to all connected clients
   */
  broadcastJobUpdate(job: PrintJob): void {
    const payload = JSON.stringify({ job, timestamp: new Date().toISOString() });
    this.emitEvent('job', payload);
  }

  /**
   * Generic event emitter to all active clients
   */
  emitEvent(eventName: string, dataString: string): void {
    if (this.clients.size === 0) return;

    const message = `event: ${eventName}\ndata: ${dataString}\n\n`;
    this.clients.forEach((res) => {
      try {
        res.write(message);
      } catch {
        this.clients.delete(res);
      }
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const sseService = new SseService();
