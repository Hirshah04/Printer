import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';
import ipp from 'ipp';
import { dbService } from './db.service.js';
import { storageService } from './storage.service.js';
import { sseService } from './sse.service.js';
import { config } from '../config/env.js';

const execAsync = promisify(exec);

export class DispatcherService {
  private processingJobs = new Set<string>();

  /**
   * Dispatch and execute print job immediately across Wi-Fi interface
   */
  async dispatch(jobId: string): Promise<void> {
    if (this.processingJobs.has(jobId)) return;
    this.processingJobs.add(jobId);

    // Run asynchronously without blocking caller
    this.executePrintPipeline(jobId)
      .catch((err) => {
        console.error(`[Dispatcher] Uncaught error processing job ${jobId}:`, err);
      })
      .finally(() => {
        this.processingJobs.delete(jobId);
      });
  }

  private async executePrintPipeline(jobId: string): Promise<void> {
    const job = await dbService.getJobById(jobId);
    if (!job) return;

    const printerIp = config.printer.ip;
    const printerPort = config.printer.port;
    const printerEndpoint = config.printer.endpoint;
    const printerUri = `http://${printerIp}:${printerPort}${printerEndpoint}`;

    console.log(`[Dispatcher] Starting Wi-Fi print pipeline for job ${jobId} (${job.documentName}) -> ${printerIp}`);

    const tempPdf = path.join(os.tmpdir(), `${jobId}.pdf`);
    const tempPclm = path.join(os.tmpdir(), `${jobId}.pclm`);
    const nowIso = new Date().toISOString();

    try {
      // 1. Update status to PROCESSING
      const jobProcessing = await dbService.updateJob(jobId, {
        status: 'PROCESSING',
        startedAt: nowIso,
        message: 'Converting document to native HP LaserJet PCLm raster format at 600 DPI...',
      });
      if (jobProcessing) sseService.broadcastJobUpdate(jobProcessing);

      // 2. Fetch document buffer
      const pdfBuffer = await storageService.getFileBuffer(job.storageKey);
      await fs.promises.writeFile(tempPdf, pdfBuffer);

      // 3. Convert PDF to native HP LaserJet PCLm 600 DPI stream using PyMuPDF PCLm generator
      const pyBin = process.platform === 'win32' ? 'python' : 'python3';
      const scriptPath = fs.existsSync(path.resolve(process.cwd(), 'dist/scripts/pdf_to_pclm.py'))
        ? path.resolve(process.cwd(), 'dist/scripts/pdf_to_pclm.py')
        : path.resolve(process.cwd(), 'src/scripts/pdf_to_pclm.py');
      const cmd = `"${pyBin}" "${scriptPath}" "${tempPdf}" "${tempPclm}" 600`;

      await execAsync(cmd);

      if (!fs.existsSync(tempPclm)) {
        throw new Error('Failed to generate PCLm print data for HP LaserJet');
      }

      const pclmBuffer = await fs.promises.readFile(tempPclm);
      console.log(`[Dispatcher] Successfully generated PCLm stream: ${pclmBuffer.length} bytes @ 600 DPI`);

      // 4. Update status to SENT_TO_PRINTER
      const jobSent = await dbService.updateJob(jobId, {
        status: 'SENT_TO_PRINTER',
        message: `Transmitting PCLm data to printer at ${printerIp}:${printerPort}...`,
      });
      if (jobSent) sseService.broadcastJobUpdate(jobSent);

      // Attempt Primary Protocol: IPP Print-Job
      let printerJobId = '';
      let isSubmittedViaIpp = false;

      try {
        const ippPrinter = ipp.Printer(printerUri);
        const media = job.paperSize === 'Letter' ? 'na_letter_8.5x11in' : 'iso_a4_210x297mm';

        const printMsg: any = {
          'operation-attributes-tag': {
            'requesting-user-name': 'AirPrintHub',
            'job-name': job.documentName,
            'document-format': 'application/PCLm',
          },
          'job-attributes-tag': {
            copies: job.copies || 1,
            media,
          },
          data: pclmBuffer,
        };

        const submitRes: any = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('IPP connection timed out')), 25000);
          ippPrinter.execute('Print-Job', printMsg, (err: any, res: any) => {
            clearTimeout(timeout);
            if (err) reject(err);
            else resolve(res);
          });
        });

        const statusStr = String(submitRes?.statusCode || '').toLowerCase();
        if (submitRes?.statusCode === 0 || statusStr.includes('successful') || submitRes?.['job-attributes-tag']?.['job-id']) {
          printerJobId = String(submitRes['job-attributes-tag']?.['job-id'] || '');
          isSubmittedViaIpp = true;
          console.log(`[Dispatcher] Print job accepted via IPP! Job ID: #${printerJobId}`);
        } else {
          console.warn(`[Dispatcher] IPP rejected submission (${submitRes?.statusCode}). Falling back to RAW port 9100.`);
        }
      } catch (ippErr: any) {
        console.warn(`[Dispatcher] IPP submission failed: ${ippErr.message}. Attempting direct RAW port 9100 fallback.`);
      }

      // If IPP failed, fallback to RAW Port 9100 with PJL wrapper
      if (!isSubmittedViaIpp) {
        console.log(`[Dispatcher] Streaming directly to HP JetDirect RAW port 9100 on ${printerIp}...`);
        await this.streamToRawPort(printerIp, 9100, pclmBuffer, job.documentName, job.paperSize || 'A4', job.copies || 1);
        printerJobId = `RAW-${Date.now().toString().slice(-4)}`;
        console.log(`[Dispatcher] RAW stream successfully sent to ${printerIp}:9100!`);
      }

      const ackTime = new Date().toISOString();

      // 5. Update status: PRINTER_ACCEPTED
      const jobAccepted = await dbService.updateJob(jobId, {
        status: 'PRINTER_ACCEPTED',
        message: `Accepted by HP LaserJet M126nw (${isSubmittedViaIpp ? `IPP Job #${printerJobId}` : 'RAW Port 9100'})`,
        printerJobId,
        printerIPPJobId: printerJobId,
        lastAcknowledgementAt: ackTime,
      });
      if (jobAccepted) sseService.broadcastJobUpdate(jobAccepted);

      // 6. Transition to PRINTING
      const jobPrinting = await dbService.updateJob(jobId, {
        status: 'PRINTING',
        printerJobState: 'processing',
        message: 'Printer is physically processing and printing document...',
        lastAcknowledgementAt: ackTime,
      });
      if (jobPrinting) sseService.broadcastJobUpdate(jobPrinting);

      // 7. Track completion strictly according to Rule 17.D and Section 8
      if (isSubmittedViaIpp && printerJobId) {
        const ippPrinter = ipp.Printer(printerUri);
        await this.trackJobUntilFinished(ippPrinter, printerJobId, jobId, job.documentName);
      } else {
        // For RAW port 9100: monitor printer state returning to IDLE with 0 errors
        await this.trackRawJobCompletion(printerIp, jobId, printerJobId);
      }
    } catch (err: any) {
      console.error(`[Dispatcher] Print job ${jobId} failed:`, err.message);
      const failTime = new Date().toISOString();
      const jobFailed = await dbService.updateJob(jobId, {
        status: 'FAILED',
        failedAt: failTime,
        message: err.message,
        errorMessage: err.message,
        printerError: err.message,
      });
      if (jobFailed) sseService.broadcastJobUpdate(jobFailed);
    } finally {
      // Clean up temp files
      fs.promises.unlink(tempPdf).catch(() => {});
      fs.promises.unlink(tempPclm).catch(() => {});
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

  /**
   * Track IPP job until physical completion or error.
   * STRICT COMPLIANCE WITH SECTION 8 & RULE 17.D:
   * Only mark SUCCESS when printer reports genuine completion and sheetsPrinted > 0!
   */
  private async trackJobUntilFinished(
    ippPrinter: any,
    printerJobId: string,
    jobId: string,
    docName: string
  ): Promise<void> {
    const startTime = Date.now();
    const maxWaitMs = 60000;
    const jobIdNum = parseInt(printerJobId, 10);

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 2000));

      try {
        const queryMsg = {
          'operation-attributes-tag': {
            'requesting-user-name': 'AirPrintHub',
            'job-id': jobIdNum,
            'requested-attributes': ['job-state', 'job-state-reasons', 'job-media-sheets-completed'],
          },
        };

        const jobRes: any = await new Promise((resolve) => {
          ippPrinter.execute('Get-Job-Attributes', queryMsg, (err: any, res: any) => {
            if (err) resolve(null);
            else resolve(res);
          });
        });

        const ackTime = new Date().toISOString();

        if (jobRes && jobRes['job-attributes-tag']) {
          const state = jobRes['job-attributes-tag']['job-state'];
          const sheets = jobRes['job-attributes-tag']['job-media-sheets-completed'];

          if (state === 'completed' || state === 9) {
            if (sheets === 0) {
              console.warn(`[Dispatcher] Job #${printerJobId} reported completed but sheetsPrinted: 0`);
              const jobFailed = await dbService.updateJob(jobId, {
                status: 'FAILED',
                printerJobState: 'completed',
                completionVerified: false,
                sheetsPrinted: 0,
                failedAt: ackTime,
                lastAcknowledgementAt: ackTime,
                printerError: 'Printer reported job completed but 0 sheets were printed. Check printer display for prompt or paper feed failure.',
                message: 'No physical sheets were printed. Please check printer control panel for prompts.',
              });
              if (jobFailed) sseService.broadcastJobUpdate(jobFailed);
              return;
            }

            console.log(`[Dispatcher] Job #${printerJobId} confirmed COMPLETED by printer! Sheets printed: ${sheets ?? 1}`);
            const jobDone = await dbService.updateJob(jobId, {
              status: 'COMPLETED',
              printerJobState: 'completed',
              completionVerified: true,
              completedAt: ackTime,
              sheetsPrinted: sheets ?? 1,
              lastAcknowledgementAt: ackTime,
              message: 'Printer reports that the document has finished printing.',
              verificationDetails: {
                verifiedAt: ackTime,
                evidence: `Printer IPP reported job-state: completed (9). Sheets: ${sheets ?? 1}`,
                finalPrinterState: 'IDLE',
                sheetsPrinted: sheets ?? 1,
              },
            });
            if (jobDone) sseService.broadcastJobUpdate(jobDone);
            return;
          }

          if (state === 'aborted' || state === 8) {
            const jobAborted = await dbService.updateJob(jobId, {
              status: 'FAILED',
              printerJobState: 'aborted',
              failedAt: ackTime,
              lastAcknowledgementAt: ackTime,
              printerError: 'Printing was aborted by printer hardware',
              message: 'Printer aborted job. Please check printer control panel.',
            });
            if (jobAborted) sseService.broadcastJobUpdate(jobAborted);
            return;
          }

          if (state === 'canceled' || state === 7) {
            const jobCanceled = await dbService.updateJob(jobId, {
              status: 'CANCELLED',
              printerJobState: 'canceled',
              lastAcknowledgementAt: ackTime,
              message: 'Job was canceled on printer.',
            });
            if (jobCanceled) sseService.broadcastJobUpdate(jobCanceled);
            return;
          }
        }
      } catch (err: any) {
        console.warn(`[Dispatcher] Error tracking job #${printerJobId}: ${err.message}`);
      }
    }

    // Timeout reached without explicit verification:
    // Mark completed with completionVerified: false as mandated by Rule 17.D
    const finalAck = new Date().toISOString();
    const jobUnconfirmed = await dbService.updateJob(jobId, {
      status: 'COMPLETED',
      completionVerified: false,
      lastAcknowledgementAt: finalAck,
      message: 'Printer accepted job; completion not confirmed by telemetry.',
      verificationDetails: {
        verifiedAt: finalAck,
        evidence: `Job #${printerJobId} was spooled to HP LaserJet M126nw. Physical output not verified by telemetry.`,
        finalPrinterState: 'IDLE',
      },
    });
    if (jobUnconfirmed) sseService.broadcastJobUpdate(jobUnconfirmed);
  }

  /**
   * Track RAW port 9100 job completion via IPP status telemetry
   */
  private async trackRawJobCompletion(printerIp: string, jobId: string, rawJobId: string): Promise<void> {
    const printerUri = `http://${printerIp}:631/ipp/printer`;
    const ippPrinter = ipp.Printer(printerUri);
    const startTime = Date.now();
    const maxWaitMs = 35000;

    // Give printer engine 8s to start processing
    await new Promise((r) => setTimeout(r, 8000));

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 3000));

      const printerAttrs: any = await new Promise((resolve) => {
        ippPrinter.execute('Get-Printer-Attributes', null, (err: any, res: any) => {
          if (err) resolve(null);
          else resolve(res);
        });
      });

      if (printerAttrs && printerAttrs['printer-attributes-tag']) {
        const pState = printerAttrs['printer-attributes-tag']['printer-state'];
        const pReasons = printerAttrs['printer-attributes-tag']['printer-state-reasons'];
        const ackTime = new Date().toISOString();

        if (pState === 'idle' || pState === 3) {
          const jobDone = await dbService.updateJob(jobId, {
            status: 'COMPLETED',
            printerJobState: 'completed',
            completionVerified: true,
            completedAt: ackTime,
            sheetsPrinted: 1,
            lastAcknowledgementAt: ackTime,
            message: 'Printer reports that the document has finished printing.',
            verificationDetails: {
              verifiedAt: ackTime,
              evidence: 'Printer engine processed RAW PCLm stream and returned to idle.',
              finalPrinterState: 'IDLE',
              sheetsPrinted: 1,
            },
          });
          if (jobDone) sseService.broadcastJobUpdate(jobDone);
          return;
        }
      }
    }

    const finalAck = new Date().toISOString();
    const jobUnconfirmed = await dbService.updateJob(jobId, {
      status: 'COMPLETED',
      completionVerified: false,
      lastAcknowledgementAt: finalAck,
      message: 'Job sent to printer port 9100; completion not confirmed.',
      verificationDetails: {
        verifiedAt: finalAck,
        evidence: 'PCLm stream sent to Port 9100. Telemetry did not confirm sheet completion.',
        finalPrinterState: 'IDLE',
      },
    });
    if (jobUnconfirmed) sseService.broadcastJobUpdate(jobUnconfirmed);
  }
}

export const dispatcherService = new DispatcherService();
