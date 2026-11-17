import { Printer, PrintJob } from '../types';

type PrinterListener = (printer: Printer) => void;
type JobListener = (job: PrintJob) => void;
type StatusListener = (connected: boolean) => void;

class RealtimeClient {
  private eventSource: EventSource | null = null;
  private printerListeners: Set<PrinterListener> = new Set();
  private jobListeners: Set<JobListener> = new Set();
  private connectionListeners: Set<StatusListener> = new Set();
  private reconnectTimer: any = null;
  private isConnected = false;

  constructor() {
    this.connect();
  }

  private connect(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    // Connect to SSE stream (handled via Vite proxy in dev, direct /api in prod)
    const baseUrl = import.meta.env.VITE_API_URL || '';
    const streamUrl = `${baseUrl}/api/printer/stream`;
    this.eventSource = new EventSource(streamUrl);

    this.eventSource.onopen = () => {
      this.isConnected = true;
      this.notifyConnection(true);
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    };

    this.eventSource.addEventListener('init', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.printer) this.notifyPrinter(data.printer);
        if (Array.isArray(data.activeJobs)) {
          data.activeJobs.forEach((j: PrintJob) => this.notifyJob(j));
        }
      } catch (err) {
        console.warn('[Realtime] Failed to parse init event:', err);
      }
    });

    this.eventSource.addEventListener('printer', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.printer) this.notifyPrinter(data.printer);
      } catch (err) {
        console.warn('[Realtime] Failed to parse printer event:', err);
      }
    });

    this.eventSource.addEventListener('job', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.job) this.notifyJob(data.job);
      } catch (err) {
        console.warn('[Realtime] Failed to parse job event:', err);
      }
    });

    this.eventSource.onerror = () => {
      this.isConnected = false;
      this.notifyConnection(false);
      this.eventSource?.close();
      this.eventSource = null;

      // Reconnect after 3 seconds
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 3000);
      }
    };
  }

  private notifyPrinter(printer: Printer): void {
    this.printerListeners.forEach((fn) => fn(printer));
  }

  private notifyJob(job: PrintJob): void {
    this.jobListeners.forEach((fn) => fn(job));
  }

  private notifyConnection(connected: boolean): void {
    this.connectionListeners.forEach((fn) => fn(connected));
  }

  onPrinter(listener: PrinterListener): () => void {
    this.printerListeners.add(listener);
    return () => this.printerListeners.delete(listener);
  }

  onJob(listener: JobListener): () => void {
    this.jobListeners.add(listener);
    return () => this.jobListeners.delete(listener);
  }

  onConnectionStatus(listener: StatusListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.isConnected);
    return () => this.connectionListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    return this.onConnectionStatus(listener);
  }
}

export const realtimeClient = new RealtimeClient();
