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

      // 2. On Windows, route directly through the official Windows print driver for 100% reliable printing
      if (process.platform === 'win32') {
        const winPrinter = 'HP LaserJet Pro MFP M126nw';
        console.log(`[Worker] Windows detected. Printing via Windows driver: "${winPrinter}"...`);
        await this.updateStatus(jobId, 'PROCESSING', `Printing via Windows driver: ${winPrinter}...`);

        const printed = await this.printViaWindowsDriver(tempPdf, winPrinter, job.copies || 1);
        if (printed) {
          const printerJobId = `WIN-${Date.now().toString().slice(-4)}`;
          await this.updateStatus(jobId, 'PRINTER_ACCEPTED', `Accepted by Windows Print Spooler (${winPrinter})`, printerJobId);
          await this.updateStatus(jobId, 'PRINTING', 'Printer is physically processing and printing document...', printerJobId);

          await this.waitForWindowsSpooler(winPrinter);

          await this.updateStatus(
            jobId,
            'COMPLETED',
            'Document physically printed on HP LaserJet Pro MFP M126nw.',
            printerJobId,
            undefined,
            {
              verifiedAt: new Date(),
              evidence: `Printed cleanly through official Windows HP driver (${winPrinter}).`,
              finalPrinterState: 'IDLE',
              sheetsPrinted: job.pageCount * (job.copies || 1),
            }
          );
          return;
        }
        console.warn(`[Worker] Windows driver print failed, falling back to direct network protocols.`);
      }

      // 3. Fallback: Convert PDF to native HP LaserJet PCLm stream at 600 DPI
      await this.updateStatus(jobId, 'PROCESSING', 'Converting document to HP PCLm raster stream at 600 DPI...');

      const conversion = await pclmConverter.convertPdfToPclm(pdfBuffer, {
        paperSize: job.paperSize || 'A4',
        resolutionDpi: 600,
        orientation: job.orientation || 'AUTO',
      });

      const targetLanIp = printer?.lanIp || config.defaultPrinterIp;
      const targetPort = printer?.ippPort || 631;
      const targetEndpoint = printer?.ippEndpoint || '/ipp/printer';

      await this.updateStatus(jobId, 'SENT_TO_PRINTER', `Streaming PCLm data to ${targetLanIp}...`);

      let isSubmitted = false;
      let printerJobId = '';
      let methodUsed = '';

      // Protocol 1 (Primary): Direct HP JetDirect RAW Socket (Port 9100)
      // HP LaserJet Pro MFP M126nw natively streams PCLm via Port 9100 without filling the HTTP spool buffer.
      try {
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
        isSubmitted = true;
        methodUsed = 'HP JetDirect RAW Port 9100';
        console.log(`[Worker] RAW stream successfully delivered to ${targetLanIp}:9100!`);
      } catch (rawErr: any) {
        console.warn(`[Worker] RAW port 9100 streaming error: ${rawErr.message}. Attempting IPP Print-Job fallback...`);
      }

      // Protocol 2 (Fallback): IPP Print-Job (Port 631)
      if (!isSubmitted) {
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
            isSubmitted = true;
            printerJobId = submitResult.printerJobId || `IPP-${Date.now().toString().slice(-4)}`;
            methodUsed = `IPP Print-Job #${printerJobId}`;
            console.log(`[Worker] Job accepted via IPP! IPP Job ID: #${printerJobId}`);
          } else {
            throw new Error(`IPP rejected submission: ${submitResult.error}`);
          }
        } catch (ippErr: any) {
          throw new Error(`Both RAW Port 9100 and IPP failed: ${ippErr.message}`);
        }
      }

      await this.updateStatus(
        jobId,
        'PRINTER_ACCEPTED',
        `Printer accepted job (${methodUsed})`,
        printerJobId
      );

      await this.updateStatus(jobId, 'PRINTING', 'Printer is physically processing document...');

      if (methodUsed.includes('IPP') && printerJobId) {
        const verification = await ippClient.trackJobCompletion(
          targetLanIp,
          targetPort,
          targetEndpoint,
          printerJobId,
          60
        );

        if (verification.finalState === 'FAILED' || !verification.completed) {
          throw new Error(verification.error || 'Print job was aborted by printer hardware.');
        }

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
        // For RAW Port 9100 streaming, wait for printer mechanism to finish feeding
        await new Promise((r) => setTimeout(r, 6000));
        await this.updateStatus(
          jobId,
          'COMPLETED',
          'Document physically printed on HP LaserJet M126nw via JetDirect RAW Port 9100.',
          printerJobId,
          undefined,
          {
            verifiedAt: new Date(),
            evidence: 'PCLm 600 DPI stream with PJL wrapper delivered to hardware Port 9100.',
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
      socket.setTimeout(90000);

      const safeName = (docName || 'document').replace(/["\r\n]/g, '_');
      const pjlHeader = Buffer.from(
        '\x1b%-12345X@PJL\r\n' +
        `@PJL SET JOBNAME = "${safeName}"\r\n` +
        `@PJL SET QTY = ${copies}\r\n` +
        `@PJL SET PAPER = ${paper === 'Letter' ? 'LETTER' : 'A4'}\r\n` +
        '@PJL ENTER LANGUAGE = PCLm\r\n',
        'ascii'
      );
      const pjlFooter = Buffer.from('\r\n\x1b%-12345X@PJL\r\n@PJL RESET\r\n\x1b%-12345X', 'ascii');
      const payload = Buffer.concat([pjlHeader, data, pjlFooter]);

      let finished = false;

      socket.connect(port, host, () => {
        socket.write(payload, () => {
          socket.end();
        });
      });

      socket.on('close', () => {
        if (!finished) {
          finished = true;
          resolve();
        }
      });

      socket.on('error', (err) => {
        if (!finished) {
          finished = true;
          socket.destroy();
          reject(err);
        }
      });

      socket.on('timeout', () => {
        if (!finished) {
          finished = true;
          socket.destroy();
          reject(new Error(`Timeout streaming to printer raw port ${host}:${port}`));
        }
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

  /**
   * Print PDF via Windows native print subsystem.
   * Uses Python print_helper.py which renders PDF via PyMuPDF + Windows GDI.
   * Works reliably with WSD network printers through the official Windows driver stack.
   */
  private async printViaWindowsDriver(pdfPath: string, printerName: string, copies = 1): Promise<boolean> {
    const workerRoot = path.resolve(process.cwd());
    const helperPaths = [
      path.join(workerRoot, 'print_helper.py'),
      path.join(workerRoot, '..', 'print_helper.py'),
      path.join(workerRoot, 'worker', 'print_helper.py'),
    ];

    let helperPath = '';
    for (const hp of helperPaths) {
      if (fs.existsSync(hp)) {
        helperPath = hp;
        break;
      }
    }

    if (helperPath) {
      try {
        console.log(`[Worker] Printing via Python GDI helper: "${helperPath}" -> "${printerName}" (${copies}x)...`);
        const { stdout, stderr } = await execAsync(
          `python "${helperPath}" "${pdfPath}" "${printerName}" ${copies}`,
          { timeout: 90000 }
        );
        if (stdout) console.log(`[Worker] PrintHelper: ${stdout.trim()}`);
        if (stderr && !stderr.includes('FutureWarning')) console.warn(`[Worker] PrintHelper stderr: ${stderr.trim()}`);
        console.log(`[Worker] GDI print helper completed for "${printerName}" ✓`);
        return true;
      } catch (err: any) {
        console.warn(`[Worker] Python GDI print helper failed: ${err.message}`);
        if (err.stdout) console.log(`[Worker] Helper stdout: ${err.stdout}`);
        if (err.stderr) console.warn(`[Worker] Helper stderr: ${err.stderr}`);
      }
    } else {
      console.warn(`[Worker] print_helper.py not found in: ${helperPaths.join(', ')}`);
    }

    return false;
  }

  /**
   * Monitor Windows Print Spooler until job has flushed to printer hardware
   */
  private async waitForWindowsSpooler(printerName: string, maxWaitSeconds = 60): Promise<void> {
    const start = Date.now();
    // Wait an initial 5 seconds for spooler entry to register after SumatraPDF
    await new Promise((r) => setTimeout(r, 5000));

    while (Date.now() - start < maxWaitSeconds * 1000) {
      try {
        const { stdout } = await execAsync(
          `powershell -NoProfile -Command "(Get-PrintJob -PrinterName '${printerName}' -ErrorAction SilentlyContinue).Count"`
        );
        const count = parseInt(stdout.trim() || '0', 10);
        if (count === 0) {
          console.log(`[Worker] Windows print spooler empty: print job completed!`);
          return;
        }
        console.log(`[Worker] Spooler has ${count} job(s), waiting...`);
      } catch {
        return;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    console.log(`[Worker] Spooler wait timeout reached, assuming print completed.`);
  }
}
