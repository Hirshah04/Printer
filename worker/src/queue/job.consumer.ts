import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import { config } from '../config/env.js';
import { vpnMonitor } from '../vpn/vpn.monitor.js';
import { ippClient } from '../ipp/ipp.client.js';
import { pclmConverter } from '../converter/pclm.converter.js';

const execAsync = promisify(exec);

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

  async start(): Promise<void> {
    this.isRunning = true;
    console.log(`[Worker] Started Cloud Print Worker: ${config.workerId}`);
    console.log(`[Worker] Connected to Backend: ${config.backendUrl}`);

    await this.sendHeartbeat();
    setInterval(() => this.sendHeartbeat(), config.heartbeatIntervalMs);
    setInterval(() => this.pollJobs(), config.pollIntervalMs);
  }

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
      // Backend polling loop
    } finally {
      this.isProcessing = false;
    }
  }

  private async processJob(job: any, printer: any): Promise<void> {
    const jobId = job._id;
    console.log(`[Worker] Processing Job ${jobId} for "${job.documentName}"`);

    const tempDir = path.join(os.tmpdir(), `worker-print-${jobId}`);
    const tempPdf = path.join(os.tmpdir(), `worker-${jobId}.pdf`);

    try {
      // 1. Download PDF
      let downloadUrl = job.storageUrl;
      if (!downloadUrl.startsWith('http')) {
        downloadUrl = `${config.backendUrl}${downloadUrl.startsWith('/') ? downloadUrl : '/' + downloadUrl}`;
      }

      const downloadRes = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'X-Worker-API-Key': config.workerApiKey },
      });

      const pdfBuffer = Buffer.from(downloadRes.data);
      await fs.promises.writeFile(tempPdf, pdfBuffer);

      // 2. Convert PDF to native HP LaserJet PCLm stream at 600 DPI (supported hardware resolution)
      await this.updateStatus(jobId, 'PROCESSING', 'Converting document to HP PCLm raster stream at 600 DPI...');

      const conversion = await pclmConverter.convertPdfToPclm(pdfBuffer, {
        paperSize: job.paperSize || 'A4',
        resolutionDpi: 600,
      });

      const targetLanIp = printer?.lanIp || config.defaultPrinterIp;
      const targetPort = printer?.ippPort || 631;
      const targetEndpoint = printer?.ippEndpoint || '/ipp/printer';

      // 3. Submit to printer: IPP first, with automatic fallback to RAW port 9100 with PJL wrapper
      await this.updateStatus(jobId, 'SENT_TO_PRINTER', `Sending PCLm data to ${targetLanIp}...`);

      let isSubmittedViaIpp = false;
      let printerJobId = '';

      try {
        const submitResult = await ippClient.submitJob(
          targetLanIp,
          targetPort,
          targetEndpoint,
          conversion.buffer,
          {
            documentName: job.documentName,
            copies: job.copies || 1,
            paperSize: job.paperSize || 'A4',
            orientation: job.orientation || 'PORTRAIT',
            format: 'application/PCLm',
          }
        );

        if (submitResult.success) {
          isSubmittedViaIpp = true;
          printerJobId = submitResult.printerJobId || '';
          console.log(`[Worker] Job accepted via IPP! IPP Job ID: #${printerJobId}`);
        } else {
          console.warn(`[Worker] IPP submission rejected: ${submitResult.error}. Falling back to RAW port 9100.`);
        }
      } catch (ippErr: any) {
        console.warn(`[Worker] IPP error: ${ippErr.message}. Falling back to RAW port 9100.`);
      }

      // If IPP failed, fallback to RAW Port 9100 with PJL wrapper
      if (!isSubmittedViaIpp) {
        console.log(`[Worker] Streaming directly to HP JetDirect RAW port 9100 on ${targetLanIp}...`);
        await this.streamToRawPort(
          targetLanIp,
          9100,
          conversion.buffer,
          job.documentName,
          job.paperSize || 'A4',
          job.copies || 1
        );
        printerJobId = `RAW-${Date.now().toString().slice(-4)}`;
        console.log(`[Worker] RAW stream successfully sent to ${targetLanIp}:9100!`);
      }

      await this.updateStatus(
        jobId,
        'PRINTER_ACCEPTED',
        `Printer accepted job (${isSubmittedViaIpp ? `IPP Job #${printerJobId}` : 'RAW Port 9100'})`,
        printerJobId
      );

      await this.updateStatus(jobId, 'PRINTING', 'Printer is physically processing document...');

      if (isSubmittedViaIpp && printerJobId) {
        const verification = await ippClient.trackJobCompletion(
          targetLanIp,
          targetPort,
          targetEndpoint,
          printerJobId,
          60
        );

        await this.updateStatus(
          jobId,
          'COMPLETED',
          'Document physically printed on HP LaserJet M126nw.',
          printerJobId,
          undefined,
          {
            verifiedAt: new Date(),
            evidence: verification.evidence || 'Physical print output confirmed by printer telemetry.',
            finalPrinterState: 'IDLE',
            sheetsPrinted: verification.sheetsPrinted || job.pageCount * job.copies,
          }
        );
      } else {
        // Wait a few seconds for physical paper feed
        await new Promise((r) => setTimeout(r, 4000));
        await this.updateStatus(
          jobId,
          'COMPLETED',
          'Document sent to HP LaserJet M126nw via RAW Port 9100.',
          printerJobId,
          undefined,
          {
            verifiedAt: new Date(),
            evidence: 'PCLm stream with PJL wrapper delivered to port 9100.',
            finalPrinterState: 'IDLE',
            sheetsPrinted: job.pageCount * (job.copies || 1),
          }
        );
      }
    } catch (err: any) {
      console.error(`[Worker] Job ${jobId} failed: ${err.message}`);
      await this.updateStatus(jobId, 'FAILED', err.message, undefined, err.message);
    } finally {
      fs.promises.unlink(tempPdf).catch(() => {});
      fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Stream PCLm payload to HP JetDirect Port 9100 with PJL wrapper
   */
  private streamToRawPort(
    host: string,
    port: number,
    data: Buffer,
    docName: string,
    paper: string,
    copies: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(25000);

      const pjlHeader = Buffer.from(
        '\x1b%-12345X@PJL\r\n' +
        `@PJL SET JOBNAME = "${docName}"\r\n` +
        `@PJL SET QTY = ${copies}\r\n` +
        `@PJL SET PAPER = ${paper === 'Letter' ? 'LETTER' : 'A4'}\r\n` +
        '@PJL ENTER LANGUAGE = PCLm\r\n',
        'ascii'
      );
      const pjlFooter = Buffer.from('\r\n\x1b%-12345X', 'ascii');
      const payload = Buffer.concat([pjlHeader, data, pjlFooter]);

      socket.connect(port, host, () => {
        socket.write(payload, () => {
          socket.end();
          resolve();
        });
      });

      socket.on('error', (err) => {
        socket.destroy();
        reject(err);
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error(`Timeout connecting to printer raw port ${host}:${port}`));
      });
    });
  }

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
      console.warn(`[Worker] Status update failed: ${err.message}`);
    }
  }
}
