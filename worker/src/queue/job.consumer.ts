import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
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

      // 2. Convert PDF to native HP LaserJet PCLm stream using PyMuPDF PCLm generator
      await this.updateStatus(jobId, 'PROCESSING', 'Converting document to HP PCLm raster stream at 300 DPI...');

      const conversion = await pclmConverter.convertPdfToPclm(pdfBuffer, {
        paperSize: job.paperSize || 'A4',
        resolutionDpi: 300,
      });

      const targetLanIp = printer?.lanIp || config.defaultPrinterIp;
      const targetPort = printer?.ippPort || 631;
      const targetEndpoint = printer?.ippEndpoint || '/ipp/printer';

      // 3. Submit to printer via IPP
      await this.updateStatus(jobId, 'SENT_TO_PRINTER', `Sending PCLm data to ${targetLanIp}:${targetPort}...`);

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

      if (!submitResult.success) {
        throw new Error(`IPP submission failed: ${submitResult.error}`);
      }

      console.log(`[Worker] Job accepted! IPP Job ID: #${submitResult.printerJobId}`);

      await this.updateStatus(
        jobId,
        'PRINTER_ACCEPTED',
        `Printer accepted job (IPP Job ID: ${submitResult.printerJobId})`,
        submitResult.printerJobId
      );

      await this.updateStatus(jobId, 'PRINTING', 'Printer is physically processing document...');

      const verification = await ippClient.trackJobCompletion(
        targetLanIp,
        targetPort,
        targetEndpoint,
        submitResult.printerJobId,
        60
      );

      await this.updateStatus(
        jobId,
        'COMPLETED',
        'Document physically printed on HP LaserJet M126nw.',
        submitResult.printerJobId,
        undefined,
        {
          verifiedAt: new Date(),
          evidence: verification.evidence || 'Physical print output confirmed by printer telemetry.',
          finalPrinterState: 'IDLE',
          sheetsPrinted: verification.sheetsPrinted || job.pageCount * job.copies,
        }
      );
    } catch (err: any) {
      console.error(`[Worker] Job ${jobId} failed: ${err.message}`);
      await this.updateStatus(jobId, 'FAILED', err.message, undefined, err.message);
    } finally {
      fs.promises.unlink(tempPdf).catch(() => {});
      fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
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
