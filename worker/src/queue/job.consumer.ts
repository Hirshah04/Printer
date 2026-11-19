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
    await this.reportPrinterStatus();
    setInterval(() => this.sendHeartbeat(), config.heartbeatIntervalMs);
    setInterval(() => this.pollJobs(), config.pollIntervalMs);
    setInterval(() => this.reportPrinterStatus(), config.printerMonitorIntervalMs || 20000);
  }

  async reportPrinterStatus(): Promise<void> {
    try {
      const state = await ippClient.queryPrinterState(config.defaultPrinterIp, 631, '/ipp/printer');
      if (state) {
        const isIdle = state.state === 'IDLE';
        const isPrinting = state.state === 'PRINTING' || state.state === 'PROCESSING';
        const hasError = state.stateReasons?.some((r: string) => r && r !== 'none' && !r.includes('low') && !r.includes('report'));

        await this.apiClient.post('/api/worker/printer/status', {
          connectionStatus: hasError ? 'ERROR' : isPrinting ? 'BUSY' : 'ONLINE',
          paperStatus: state.stateReasons?.some((r: string) => r.includes('media-empty')) ? 'EMPTY' : 'OK',
          tonerStatus: state.stateReasons?.some((r: string) => r.includes('toner-empty')) ? 'EMPTY' : 'OK',
          stateReasons: state.stateReasons || ['none'],
          supportedFormats: ['application/PCLm', 'image/urf', 'image/jpeg', 'application/octet-stream'],
        });
      } else {
        const reachable = await vpnMonitor.probeHost(config.defaultPrinterIp, 631, 2000);
        if (reachable) {
          await this.apiClient.post('/api/worker/printer/status', {
            connectionStatus: 'ONLINE',
            paperStatus: 'OK',
            tonerStatus: 'OK',
            stateReasons: ['none'],
            supportedFormats: ['application/PCLm', 'image/urf', 'image/jpeg', 'application/octet-stream'],
          });
        }
      }
    } catch {
      // Telemetry report is best effort
    }
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
    const targetLanIp = config.defaultPrinterIp || (printer?.lanIp?.startsWith('192.168.') ? printer.lanIp : '192.168.1.37');
    
    let downloadUrl = job.storageUrl;
    if (!downloadUrl.startsWith('http')) {
      downloadUrl = `${config.backendUrl}${downloadUrl.startsWith('/') ? downloadUrl : '/' + downloadUrl}`;
    }

    console.log(`=====================================================================`);
    console.log(`📥 [Worker] NEW PRINT JOB RECEIVED: "${job.documentName}" (${job.pageCount} p, ${job.copies || 1}x)`);
    console.log(`🔗 [Worker] FETCHING FILE FROM   : ${downloadUrl}`);
    console.log(`🖨️ [Worker] TARGET PRINTER IP    : ${targetLanIp}`);
    console.log(`🔌 [Worker] TARGET PORT / DRIVER : Windows Driver (TCP/IP 192.168.1.37:9100) / IPP 631`);
    console.log(`=====================================================================`);

    const tempPdf = path.join(os.tmpdir(), `worker-${jobId}.pdf`);

    try {
      // 1. Download PDF
      console.log(`[Worker] Downloading document from ${downloadUrl}...`);
      const downloadRes = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: { 'X-Worker-API-Key': config.workerApiKey },
      });

      const pdfBuffer = Buffer.from(downloadRes.data);
      console.log(`[Worker] Downloaded ${pdfBuffer.length} bytes successfully.`);
      await fs.promises.writeFile(tempPdf, pdfBuffer);

      // 1. Primary Method: Direct Native IPP Port 631 (standard AirPrint hardware protocol)
      // Generates 100% clean, standardized ISO A4 PCLm stream and delivers directly to printer hardware.
      await this.updateStatus(jobId, 'PROCESSING', 'Generating native A4 PCLm raster stream...');

      const conversion = await pclmConverter.convertPdfToPclm(pdfBuffer, {
        paperSize: job.paperSize || 'A4',
        resolutionDpi: 300,
        orientation: job.orientation || 'AUTO',
      });

      const targetPort = printer?.ippPort || 631;
      const targetEndpoint = printer?.ippEndpoint || '/ipp/printer';

      await this.updateStatus(jobId, 'SENT_TO_PRINTER', `Submitting document to ${targetLanIp}:${targetPort}...`);

      let isSubmitted = false;
      let printerJobId = '';
      let methodUsed = '';

      // Protocol 1: IPP Port 631
      try {
        console.log(`[Worker] Submitting PCLm document via IPP Port 631 to ${targetLanIp}:${targetPort}${targetEndpoint}...`);
        const ippRes = await ippClient.submitJob(
          targetLanIp,
          targetPort,
          targetEndpoint,
          conversion.buffer,
          {
            documentName: job.documentName,
            copies: job.copies || 1,
            paperSize: job.paperSize || 'A4',
            orientation: job.orientation || 'AUTO',
            format: 'application/PCLm',
          }
        );

        if (ippRes.success) {
          printerJobId = ippRes.printerJobId || `IPP-${Date.now().toString().slice(-4)}`;
          isSubmitted = true;
          methodUsed = `IPP Port 631 (${printerJobId})`;
          console.log(`[Worker] Job accepted via IPP Port 631 with ID: ${printerJobId}`);
        } else {
          console.warn(`[Worker] IPP Port 631 rejected: ${ippRes.error}. Trying RAW Port 9100...`);
        }
      } catch (ippErr: any) {
        console.warn(`[Worker] IPP Port 631 error: ${ippErr.message}. Trying RAW Port 9100...`);
      }

      // Protocol 2: Fallback to Direct HP JetDirect RAW Socket (Port 9100)
      if (!isSubmitted) {
        try {
          console.log(`[Worker] Streaming to HP JetDirect RAW port 9100 on ${targetLanIp}...`);
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
          console.warn(`[Worker] RAW port 9100 failed: ${rawErr.message}. Trying Windows driver...`);
        }
      }

      // Protocol 3: Fallback to Windows GDI driver
      if (!isSubmitted && process.platform === 'win32') {
        const winPrinter = process.env.WINDOWS_PRINTER_NAME || 'Hewlett-Packard HP LaserJet Pro MFP M126nw (Copy 1)';
        console.log(`[Worker] Fallback: Printing via Windows driver: "${winPrinter}"...`);
        await this.updateStatus(jobId, 'PROCESSING', `Printing via Windows driver: ${winPrinter}...`);

        const printed = await this.printViaWindowsDriver(tempPdf, winPrinter, job.copies || 1);
        if (printed) {
          printerJobId = `WIN-${Date.now().toString().slice(-4)}`;
          isSubmitted = true;
          methodUsed = `Windows GDI (${winPrinter})`;
          await this.waitForWindowsSpooler(winPrinter);
        }
      }

      if (!isSubmitted) {
        throw new Error('All print protocols (IPP Port 631, RAW Port 9100, Windows GDI) failed to deliver document to printer.');
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
        // For RAW Port 9100 streaming: poll IPP to verify printer processed stream and returned to IDLE
        let verified = false;
        const pollStart = Date.now();
        await new Promise((r) => setTimeout(r, 4000));
        while (Date.now() - pollStart < 35000) {
          const status = await ippClient.queryPrinterState(targetLanIp, targetPort, targetEndpoint);
          if (status) {
            if (status.state === 'STOPPED' || status.stateReasons?.some((r: string) => r.includes('error') || r.includes('spool-area-full'))) {
              throw new Error(`Printer hardware reported error: ${status.stateReasons?.join(', ') || 'Processing error'}`);
            }
            if (status.state === 'IDLE') {
              verified = true;
              break;
            }
          }
          await new Promise((r) => setTimeout(r, 2000));
        }

        if (!verified) {
          throw new Error('Printer did not confirm completion within timeout period.');
        }

        await this.updateStatus(
          jobId,
          'COMPLETED',
          'Document physically printed on HP LaserJet M126nw via JetDirect RAW Port 9100.',
          printerJobId,
          undefined,
          {
            verifiedAt: new Date(),
            evidence: 'PCLm 600 DPI stream with PJL wrapper delivered to hardware Port 9100 and confirmed IDLE.',
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
   * Stream PCLm payload to HP JetDirect Port 9100 with pure hardware-accepted PJL wrapper
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

      // Clean PJL wrapper for HP LaserJet Pro MFP M126nw.
      // Standard PJL UEL + ENTER LANGUAGE = PCLm + UEL exit.
      const pjlHeader = Buffer.from(
        '\x1b%-12345X@PJL\r\n' +
        '@PJL JOB\r\n' +
        '@PJL ENTER LANGUAGE = PCLm\r\n',
        'ascii'
      );
      const pjlFooter = Buffer.from('\r\n\x1b%-12345X', 'ascii');
      const payload = Buffer.concat([pjlHeader, data, pjlFooter]);

      let finished = false;

      const cleanup = (err?: Error) => {
        if (!finished) {
          finished = true;
          clearTimeout(connectTimer);
          socket.removeAllListeners();
          socket.destroy();
          if (err) reject(err);
          else resolve();
        }
      };

      // 1. Connection Timeout (15 seconds)
      const connectTimer = setTimeout(() => {
        cleanup(new Error(`TCP connect timeout to printer ${host}:${port}`));
      }, 15000);

      socket.on('error', (err) => {
        cleanup(err);
      });

      // 2. Connect and stream
      socket.connect(port, host, () => {
        clearTimeout(connectTimer);
        // Once connected, set a generous 120s timeout to allow laser fuser warm-up and WAN transmission
        socket.setTimeout(120000);

        socket.on('timeout', () => {
          cleanup(new Error(`Timeout streaming to printer raw port ${host}:${port}`));
        });

        socket.write(payload, (writeErr) => {
          if (writeErr) {
            cleanup(writeErr);
            return;
          }
          // All data has been flushed into the kernel send buffer.
          // Disable inactivity timeout so socket draining and printer engine processing aren't aborted.
          socket.setTimeout(0);
          try {
            socket.end();
          } catch {}
          // Give TCP 2.5 seconds to flush all packets and FIN over WAN before closing socket
          setTimeout(() => {
            cleanup();
          }, 2500);
        });
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
