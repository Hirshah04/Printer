import axios from 'axios';
import { config } from '../config/env.js';
import { vpnMonitor } from '../vpn/vpn.monitor.js';
import { pclmConverter } from '../converter/pclm.converter.js';
import { ippClient } from '../ipp/ipp.client.js';

export class JobConsumer {
  private isProcessing = false;
  private isRunning = false;

  private apiClient = axios.create({
    baseURL: config.backendUrl,
    timeout: 30000,
    headers: {
      'X-Worker-API-Key': config.workerApiKey,
      'X-Worker-ID': config.workerId,
    },
  });

  /**
   * Start worker processing loop & background tasks
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[Worker] Started Cloud Print Worker: ${config.workerId}`);
    console.log(`[Worker] Connected to Backend: ${config.backendUrl}`);

    // Initial heartbeat
    await this.sendHeartbeat();

    // Start intervals
    setInterval(() => this.sendHeartbeat(), config.heartbeatIntervalMs);
    setInterval(() => this.pollJobs(), config.pollIntervalMs);
  }

  /**
   * Send heartbeat to backend
   */
  async sendHeartbeat(): Promise<void> {
    try {
      const vpnHealth = await vpnMonitor.checkVpnStatus();

      await this.apiClient.post('/api/worker/heartbeat', {
        workerId: config.workerId,
        name: config.workerName,
        status: this.isProcessing ? 'BUSY' : 'ONLINE',
        vpnStatus: vpnHealth.vpnStatus,
        vpnIp: vpnHealth.vpnIp,
        gatewayIp: vpnHealth.gatewayIp,
        version: '1.0.0',
        systemInfo: {
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime(),
          freeMemoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          wireguardInterface: vpnHealth.interfaceName,
        },
      });
    } catch (err: any) {
      console.warn(`[Worker] Heartbeat failed: ${err.message}`);
    }
  }

  /**
   * Poll backend for pending print jobs
   */
  async pollJobs(): Promise<void> {
    if (this.isProcessing || !this.isRunning) return;

    try {
      const res = await this.apiClient.get('/api/worker/jobs/next');
      const data = res.data;

      if (data && data.success && data.job) {
        this.isProcessing = true;
        await this.processJob(data.job, data.printer);
      }
    } catch (err: any) {
      // Backend might be offline or sleeping
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single print job from download to IPP completion
   */
  private async processJob(job: any, printer: any): Promise<void> {
    const jobId = job._id;
    console.log(`[Worker] Processing Job ${jobId} for document "${job.documentName}"`);

    try {
      // 1. Check VPN status before attempting printer communication
      const vpnHealth = await vpnMonitor.checkVpnStatus();
      console.log(`[Worker] VPN Status: ${vpnHealth.vpnStatus} (IP: ${vpnHealth.vpnIp || 'none'})`);

      // 2. Fetch document bytes
      let downloadUrl = job.storageUrl;
      if (!downloadUrl.startsWith('http')) {
        downloadUrl = `${config.backendUrl}${downloadUrl.startsWith('/') ? downloadUrl : '/' + downloadUrl}`;
      }

      console.log(`[Worker] Downloading document from ${downloadUrl}`);
      const downloadResponse = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'X-Worker-API-Key': config.workerApiKey,
        },
      });

      const pdfBuffer = Buffer.from(downloadResponse.data);
      console.log(`[Worker] Downloaded ${pdfBuffer.length} bytes for ${job.documentName}`);

      // 3. Format Conversion (Targeting HP LaserJet Pro MFP M126nw)
      const targetLanIp = printer?.lanIp || config.defaultPrinterIp;
      const targetPort = printer?.ippPort || 631;
      const targetEndpoint = printer?.ippEndpoint || '/ipp/printer';
      const supportedFormats = printer?.supportedFormats || ['application/PCLm'];

      console.log(`[Worker] Target printer: ${printer?.name || 'HP Printer'} @ ${targetLanIp}:${targetPort}${targetEndpoint}`);

      // Check if LAN IP is the HP Wi-Fi Direct address
      if (targetLanIp.startsWith('192.168.223.')) {
        throw new Error(
          `Target printer IP (${targetLanIp}) is on the HP Wi-Fi Direct SoftAP subnet. ` +
          `A cloud worker over router VPN cannot reach Wi-Fi Direct. Update the printer LAN IP in Admin Settings to the real router subnet address.`
        );
      }

      // Format selection
      const formatStrategy = pclmConverter.selectOptimalFormat(supportedFormats);
      console.log(`[Worker] Converting document using strategy: format=${formatStrategy.format}, requiresConversion=${formatStrategy.requiresConversion}`);

      let payloadBuffer: Buffer = pdfBuffer;
      let usedFormat = formatStrategy.format;

      if (formatStrategy.requiresConversion) {
        const conversion = await pclmConverter.convertPdfToPclm(pdfBuffer, {
          paperSize: job.paperSize || 'A4',
          resolutionDpi: 300,
        });
        payloadBuffer = conversion.buffer;
        usedFormat = conversion.format;
        console.log(`[Worker] Converted to ${usedFormat} (${payloadBuffer.length} bytes) via ${conversion.methodUsed}`);
      }

      // 4. Update status: SENT_TO_PRINTER
      await this.updateStatus(jobId, 'SENT_TO_PRINTER', `Sending ${usedFormat} payload to printer @ ${targetLanIp}`);

      // 5. Submit to IPP
      const submitResult = await ippClient.submitJob(
        targetLanIp,
        targetPort,
        targetEndpoint,
        payloadBuffer,
        {
          documentName: job.documentName,
          copies: job.copies || 1,
          paperSize: job.paperSize || 'A4',
          orientation: job.orientation || 'PORTRAIT',
          format: usedFormat,
        }
      );

      if (!submitResult.success) {
        throw new Error(`IPP submission failed: ${submitResult.error}`);
      }

      console.log(`[Worker] IPP submission accepted! Job ID: ${submitResult.printerJobId}`);

      // 6. Update status: PRINTER_ACCEPTED
      await this.updateStatus(
        jobId,
        'PRINTER_ACCEPTED',
        `Printer accepted job (IPP Job ID: ${submitResult.printerJobId})`,
        submitResult.printerJobId
      );

      // 7. Track job execution until completion
      await this.updateStatus(jobId, 'PRINTING', 'Printer is currently printing document...');

      const verification = await ippClient.trackJobCompletion(
        targetLanIp,
        targetPort,
        targetEndpoint,
        submitResult.printerJobId,
        90
      );

      if (verification.completed && verification.finalState === 'COMPLETED') {
        console.log(`[Worker] Job ${jobId} physically completed: ${verification.evidence}`);
        await this.updateStatus(
          jobId,
          'COMPLETED',
          'Document physically printed and verified.',
          submitResult.printerJobId,
          undefined,
          {
            verifiedAt: new Date(),
            evidence: verification.evidence,
            finalPrinterState: 'IDLE',
            sheetsPrinted: verification.sheetsPrinted || job.pageCount * job.copies,
          }
        );
      } else if (verification.finalState === 'PRINTER_ACCEPTED') {
        // As requested in Section 10: "If completion cannot be verified, display a clear status such as 'Printer accepted job; completion not confirmed.'"
        await this.updateStatus(
          jobId,
          'PRINTER_ACCEPTED',
          'Printer accepted job; completion not confirmed by printer telemetry.',
          submitResult.printerJobId,
          undefined,
          {
            verifiedAt: new Date(),
            evidence: verification.evidence,
            finalPrinterState: 'UNKNOWN',
          }
        );
      } else {
        throw new Error(verification.error || 'Printing was stopped or aborted by hardware');
      }
    } catch (err: any) {
      console.error(`[Worker] Job ${jobId} failed: ${err.message}`);
      await this.updateStatus(jobId, 'FAILED', err.message, undefined, err.message);
    }
  }

  /**
   * Helper to update status in backend
   */
  private async updateStatus(
    jobId: string,
    status: string,
    message: string,
    printerJobId?: string,
    errorMessage?: string,
    verificationDetails?: any
  ): Promise<void> {
    try {
      await this.apiClient.patch(`/api/worker/jobs/${jobId}/status`, {
        status,
        message,
        printerJobId,
        errorMessage,
        verificationDetails,
      });
    } catch (err: any) {
      console.warn(`[Worker] Failed to report status ${status} to backend: ${err.message}`);
    }
  }
}
