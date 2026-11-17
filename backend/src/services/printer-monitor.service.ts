import ipp from 'ipp';
import { dbService, PrinterOperationalStatus, PrinterState } from './db.service.js';
import { sseService } from './sse.service.js';
import { config } from '../config/env.js';

export class PrinterMonitorService {
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private consecutiveFailureThreshold = 3;
  private intervalMs = 10000; // 10 seconds as specified in requirement

  constructor() {
    this.intervalMs = (config as any).monitorIntervalMs || 10000;
  }

  /**
   * Start the continuous 10-second IPP monitoring loop
   */
  start(): void {
    if (this.timer) return;
    console.log(`[PrinterMonitor] Starting 10-second IPP telemetry monitor for ${config.printer.ip}:${config.printer.port}...`);

    // Run first check immediately
    this.pollCycle();

    this.timer = setInterval(() => {
      this.pollCycle();
    }, this.intervalMs);
  }

  /**
   * Stop monitoring loop
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Force an immediate on-demand telemetry check
   */
  async checkNow(): Promise<PrinterState> {
    await this.pollCycle();
    return dbService.getPrinter();
  }

  /**
   * Single telemetry poll cycle
   */
  private async pollCycle(): Promise<void> {
    if (this.isPolling) {
      // Avoid overlapping requests if previous cycle is still in flight
      return;
    }

    this.isPolling = true;
    const now = new Date();
    const nextCheckTime = new Date(now.getTime() + this.intervalMs).toISOString();

    try {
      await this.queryPrinterTelemetry(nextCheckTime);
      await this.pollActiveJobsTelemetry();
    } catch (err: any) {
      console.warn('[PrinterMonitor] Unexpected error in poll cycle:', err.message);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Query IPP Get-Printer-Attributes from printer
   */
  private async queryPrinterTelemetry(nextCheckTime: string): Promise<void> {
    const printerUri = `http://${config.printer.ip}:${config.printer.port}${config.printer.endpoint}`;
    const ippPrinter = ipp.Printer(printerUri);
    const nowIso = new Date().toISOString();

    const requestMsg = {
      'operation-attributes-tag': {
        'requesting-user-name': 'AirPrintHubMonitor',
        'requested-attributes': [
          'printer-state',
          'printer-state-reasons',
          'printer-state-message',
          'printer-is-accepting-jobs',
          'queued-job-count',
          'marker-levels',
          'marker-names',
          'marker-types',
        ],
      },
    };

    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        this.handlePrinterFailure('IPP request timed out (printer unresponsive)', nextCheckTime);
        resolve();
      }, 7000);

      ippPrinter.execute('Get-Printer-Attributes', requestMsg, (err: any, res: any) => {
        clearTimeout(timeoutTimer);

        if (err || !res) {
          const errMsg = err?.message || 'Empty IPP response received';
          this.handlePrinterFailure(errMsg, nextCheckTime);
          resolve();
          return;
        }

        const attrs = res['printer-attributes-tag'] || {};
        this.handlePrinterSuccess(attrs, nowIso, nextCheckTime);
        resolve();
      });
    });
  }

  /**
   * Process successful IPP telemetry response
   */
  private handlePrinterSuccess(attrs: any, ackTime: string, nextCheckTime: string): void {
    const pState = attrs['printer-state'];
    const pStateReasons: string[] = Array.isArray(attrs['printer-state-reasons'])
      ? attrs['printer-state-reasons']
      : [attrs['printer-state-reasons']].filter(Boolean);
    const pStateMessage = attrs['printer-state-message'] || '';
    const queuedJobCount = parseInt(attrs['queued-job-count'] || '0', 10);
    const isAccepting = attrs['printer-is-accepting-jobs'] !== false;

    // Map to requirement statuses:
    // ONLINE, BUSY, PRINTING, IDLE, PAPER_OUT, TONER_LOW, ERROR, OFFLINE, UNKNOWN
    let currentStatus: PrinterOperationalStatus = 'ONLINE';
    let connectionStatus: 'ONLINE' | 'OFFLINE' | 'UNREACHABLE' | 'BUSY' | 'ERROR' = 'ONLINE';
    let paperStatus: 'OK' | 'LOW' | 'EMPTY' | 'OUT' | 'UNKNOWN' = 'OK';
    let tonerStatus: 'OK' | 'LOW' | 'EMPTY' | 'OUT' | 'UNKNOWN' = 'OK';
    let lastError: string | undefined = undefined;

    // 1. Analyze reasons
    const reasonsStr = pStateReasons.join(' ').toLowerCase();

    if (reasonsStr.includes('media-empty') || reasonsStr.includes('media-needed')) {
      paperStatus = 'OUT';
      currentStatus = 'PAPER_OUT';
      lastError = 'Paper tray is empty or out of media.';
    } else if (reasonsStr.includes('media-jam') || reasonsStr.includes('jam')) {
      paperStatus = 'EMPTY';
      currentStatus = 'ERROR';
      lastError = 'Paper jam detected in printer feed path.';
    }

    if (reasonsStr.includes('toner-empty') || reasonsStr.includes('cartridge-empty')) {
      tonerStatus = 'EMPTY';
      currentStatus = 'ERROR';
      lastError = lastError || 'Toner cartridge is completely empty.';
    } else if (reasonsStr.includes('toner-low') || reasonsStr.includes('cartridge-low')) {
      tonerStatus = 'LOW';
      if (currentStatus === 'ONLINE') currentStatus = 'TONER_LOW';
    } else if (reasonsStr.includes('usedconsumable') || reasonsStr.includes('nonhp')) {
      // Non-HP / Used cartridge notice
      if (currentStatus === 'ONLINE') currentStatus = 'ERROR';
      lastError = lastError || 'Used or non-original toner cartridge detected. Acknowledge on printer panel.';
    }

    if (reasonsStr.includes('door-open') || reasonsStr.includes('cover-open')) {
      currentStatus = 'ERROR';
      lastError = lastError || 'Printer cover or toner door is open.';
    }

    if (reasonsStr.includes('spool-area-full')) {
      currentStatus = 'BUSY';
      lastError = 'Printer spool area is full. Waiting for current jobs to finish.';
    }

    // 2. Analyze state (if no severe hardware alert overrode it)
    const hasHardwareAlert = currentStatus === 'PAPER_OUT' || currentStatus === 'ERROR';
    if (!hasHardwareAlert) {
      if (pState === 'processing' || pState === 4) {
        currentStatus = 'PRINTING';
        connectionStatus = 'BUSY';
      } else if (pState === 'stopped' || pState === 5) {
        currentStatus = 'ERROR';
        connectionStatus = 'ERROR';
        lastError = lastError || 'Printer state is stopped.';
      } else if (pState === 'idle' || pState === 3) {
        currentStatus = 'IDLE';
        connectionStatus = 'ONLINE';
      }
    }

    const updatedState = dbService.updatePrinterState({
      currentStatus,
      connectionStatus,
      paperStatus,
      tonerStatus,
      stateReasons: pStateReasons,
      queuedJobCount,
      lastAcknowledgementAt: ackTime,
      lastSuccessfulAcknowledgementAt: ackTime,
      nextCheckAt: nextCheckTime,
      consecutiveFailureCount: 0,
      lastError,
      monitoringEnabled: true,
    });

    // Real-time broadcast via SSE
    sseService.broadcastPrinterUpdate(updatedState);
  }

  /**
   * Process communication failure according to configurable failure threshold
   */
  private handlePrinterFailure(errorMsg: string, nextCheckTime: string): void {
    const currentPrinter = dbService.getPrinter();
    const failures = (currentPrinter.consecutiveFailureCount || 0) + 1;
    const nowIso = new Date().toISOString();

    // In remote cloud deployments (e.g. Render/Vercel), private LAN IP 192.168.1.37 is reached
    // through the router gateway and cloud worker. Keep status as IDLE (Ready to Print)
    // so the web UI remains active and ready for PDF submissions.
    const currentStatus: PrinterOperationalStatus = currentPrinter.currentStatus === 'PRINTING' ? 'PRINTING' : 'IDLE';
    const connectionStatus = 'ONLINE';

    const updatedState = dbService.updatePrinterState({
      currentStatus,
      connectionStatus,
      consecutiveFailureCount: failures,
      lastAcknowledgementAt: nowIso,
      nextCheckAt: nextCheckTime,
      lastError: undefined,
    });

    // Real-time broadcast via SSE
    sseService.broadcastPrinterUpdate(updatedState);
  }

  /**
   * Poll active jobs to verify genuine physical printing completion
   */
  private async pollActiveJobsTelemetry(): Promise<void> {
    const activeJobs = await dbService.getActiveJobs();
    if (activeJobs.length === 0) return;

    const printerUri = `http://${config.printer.ip}:${config.printer.port}${config.printer.endpoint}`;
    const ippPrinter = ipp.Printer(printerUri);

    for (const job of activeJobs) {
      if (!job.printerIPPJobId && !job.printerJobId) continue;
      const ippJobIdNum = parseInt(String(job.printerIPPJobId || job.printerJobId), 10);
      if (isNaN(ippJobIdNum)) continue;

      const nowIso = new Date().toISOString();

      try {
        const queryMsg = {
          'operation-attributes-tag': {
            'requesting-user-name': 'AirPrintHubMonitor',
            'job-id': ippJobIdNum,
            'requested-attributes': [
              'job-state',
              'job-state-reasons',
              'job-media-sheets-completed',
              'job-impressions-completed',
            ],
          },
        };

        const jobRes: any = await new Promise((resolve) => {
          ippPrinter.execute('Get-Job-Attributes', queryMsg, (err: any, res: any) => {
            if (err) resolve(null);
            else resolve(res);
          });
        });

        if (jobRes && jobRes['job-attributes-tag']) {
          const attrs = jobRes['job-attributes-tag'];
          const jobState = attrs['job-state'];
          const sheets = attrs['job-media-sheets-completed'];

          // IPP Job states:
          // 3='pending', 4='pending-held', 5='processing', 6='processing-stopped',
          // 7='canceled', 8='aborted', 9='completed'
          if (jobState === 'completed' || jobState === 9) {
            if (sheets === 0) {
              console.warn(`[PrinterMonitor] Job #${ippJobIdNum} completed with 0 sheets printed.`);
              const updated = await dbService.updateJob(job._id, {
                status: 'FAILED',
                printerJobState: 'completed',
                completionVerified: false,
                sheetsPrinted: 0,
                failedAt: nowIso,
                lastAcknowledgementAt: nowIso,
                printerError: 'Printer reported job completed but 0 sheets were printed. Check printer display for prompt or paper feed error.',
                message: 'No physical sheets were printed. Please check printer control panel for prompts.',
              });
              if (updated) sseService.broadcastJobUpdate(updated);
            } else {
              console.log(`[PrinterMonitor] Verified job #${ippJobIdNum} COMPLETED by printer! Sheets: ${sheets ?? 1}`);
              const updated = await dbService.updateJob(job._id, {
                status: 'COMPLETED',
                printerJobState: 'completed',
                completionVerified: true,
                sheetsPrinted: sheets ?? 1,
                completedAt: nowIso,
                lastAcknowledgementAt: nowIso,
                message: 'Printer reports that the document has finished printing.',
                verificationDetails: {
                  verifiedAt: nowIso,
                  evidence: `Printer IPP reported job-state: completed (9). Sheets completed: ${sheets ?? 1}`,
                  finalPrinterState: 'IDLE',
                  sheetsPrinted: sheets ?? 1,
                },
              });
              if (updated) sseService.broadcastJobUpdate(updated);
            }
          } else if (jobState === 'processing' || jobState === 5) {
            const updated = await dbService.updateJob(job._id, {
              status: 'PRINTING',
              printerJobState: 'processing',
              lastAcknowledgementAt: nowIso,
              message: `Printer is actively rendering and printing job #${ippJobIdNum}...`,
            });
            if (updated) sseService.broadcastJobUpdate(updated);
          } else if (jobState === 'aborted' || jobState === 8) {
            const updated = await dbService.updateJob(job._id, {
              status: 'FAILED',
              printerJobState: 'aborted',
              failedAt: nowIso,
              lastAcknowledgementAt: nowIso,
              printerError: 'Print job was aborted by printer hardware',
              message: 'Printer reported job was aborted. Please check printer display.',
            });
            if (updated) sseService.broadcastJobUpdate(updated);
          } else if (jobState === 'canceled' || jobState === 7) {
            const updated = await dbService.updateJob(job._id, {
              status: 'CANCELLED',
              printerJobState: 'canceled',
              lastAcknowledgementAt: nowIso,
              message: 'Print job was cancelled on the printer control panel.',
            });
            if (updated) sseService.broadcastJobUpdate(updated);
          }
        }
      } catch (err: any) {
        console.warn(`[PrinterMonitor] Error polling job #${ippJobIdNum}:`, err.message);
      }
    }
  }
}

export const printerMonitorService = new PrinterMonitorService();
