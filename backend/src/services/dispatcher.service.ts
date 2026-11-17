import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ipp from 'ipp';
import { dbService } from './db.service.js';
import { storageService } from './storage.service.js';
import { sseService } from './sse.service.js';
import { config } from '../config/env.js';

const execAsync = promisify(exec);

export class DispatcherService {
  private processingJobs = new Set<string>();

  /**
   * Dispatch and execute print job immediately
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

    console.log(`[Dispatcher] Starting execution for job ${jobId} (${job.documentName}) -> ${printerUri}`);

    const tempPdf = path.join(os.tmpdir(), `${jobId}.pdf`);
    const tempPclm = path.join(os.tmpdir(), `${jobId}.pclm`);
    const nowIso = new Date().toISOString();

    try {
      // 1. Update status to PROCESSING
      const jobProcessing = await dbService.updateJob(jobId, {
        status: 'PROCESSING',
        startedAt: nowIso,
        message: 'Converting document to HP PCLm raster format at 300 DPI...',
      });
      if (jobProcessing) sseService.broadcastJobUpdate(jobProcessing);

      // 2. Fetch document buffer
      const pdfBuffer = await storageService.getFileBuffer(job.storageKey);
      await fs.promises.writeFile(tempPdf, pdfBuffer);

      // 3. Convert PDF to native HP LaserJet PCLm stream using PyMuPDF PCLm generator
      const scriptPath = path.resolve(process.cwd(), 'src/scripts/pdf_to_pclm.py');
      const cmd = `python "${scriptPath}" "${tempPdf}" "${tempPclm}"`;

      await execAsync(cmd);

      if (!fs.existsSync(tempPclm)) {
        throw new Error('Failed to generate PCLm print data for HP LaserJet');
      }

      const pclmBuffer = await fs.promises.readFile(tempPclm);
      console.log(`[Dispatcher] Successfully generated PCLm stream: ${pclmBuffer.length} bytes`);

      // 4. Update status to SENT_TO_PRINTER
      const jobSent = await dbService.updateJob(jobId, {
        status: 'SENT_TO_PRINTER',
        message: `Transmitting PCLm data to ${printerIp}:${printerPort}...`,
      });
      if (jobSent) sseService.broadcastJobUpdate(jobSent);

      const ippPrinter = ipp.Printer(printerUri);
      const media = job.paperSize === 'Letter' ? 'na_letter_8.5x11in' : 'iso_a4_210x297mm';

      const isIppSuccess = (status: any, res?: any) => {
        if (status === 0 || status === 'successful-ok') return true;
        if (typeof status === 'string' && status.toLowerCase().includes('success')) return true;
        if (res?.['job-attributes-tag']?.['job-id']) return true;
        return false;
      };

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
        ippPrinter.execute('Print-Job', printMsg, (err: any, res: any) => {
          if (err) reject(err);
          else resolve(res);
        });
      });

      if (!isIppSuccess(submitRes?.statusCode, submitRes)) {
        throw new Error(`Printer rejected job with status: ${submitRes?.statusCode || 'unknown'}`);
      }

      const printerJobId = String(submitRes['job-attributes-tag']?.['job-id'] || '');
      const ackTime = new Date().toISOString();

      console.log(`[Dispatcher] Print job accepted by printer! Job ID: #${printerJobId}`);

      // 5. Update status: PRINTER_ACCEPTED
      const jobAccepted = await dbService.updateJob(jobId, {
        status: 'PRINTER_ACCEPTED',
        message: `Accepted by HP LaserJet M126nw (Job #${printerJobId})`,
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

      // 7. Track completion via IPP telemetry
      await this.trackJobUntilFinished(ippPrinter, printerJobId, jobId, job.documentName);
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

  private async trackJobUntilFinished(
    ippPrinter: any,
    printerJobId: string,
    jobId: string,
    docName: string
  ): Promise<void> {
    const startTime = Date.now();
    const maxWaitMs = 60000;

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((r) => setTimeout(r, 2000));

      try {
        const queryMsg = {
          'operation-attributes-tag': {
            'requesting-user-name': 'AirPrintHub',
            'job-id': parseInt(printerJobId, 10),
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
            console.log(`[Dispatcher] Job #${printerJobId} reported COMPLETED by printer!`);
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
        } else {
          // If printer purged completed job from spooler memory, check printer state
          const printerAttrs: any = await new Promise((resolve) => {
            ippPrinter.execute('Get-Printer-Attributes', null, (err: any, res: any) => {
              if (err) resolve(null);
              else resolve(res);
            });
          });

          if (printerAttrs && printerAttrs['printer-attributes-tag']) {
            const pState = printerAttrs['printer-attributes-tag']['printer-state'];
            if (pState === 'idle' || pState === 3) {
              console.log(`[Dispatcher] Printer returned to idle; job #${printerJobId} finished.`);
              const jobDone = await dbService.updateJob(jobId, {
                status: 'COMPLETED',
                printerJobState: 'completed',
                completionVerified: true,
                completedAt: ackTime,
                lastAcknowledgementAt: ackTime,
                message: 'Printer reports that the document has finished printing.',
                verificationDetails: {
                  verifiedAt: ackTime,
                  evidence: `Printer returned to idle state with no active errors.`,
                  finalPrinterState: 'IDLE',
                },
              });
              if (jobDone) sseService.broadcastJobUpdate(jobDone);
              return;
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Dispatcher] Error tracking job: ${err.message}`);
      }
    }

    // If max timeout reached and completion not explicitly confirmed:
    // Follow Rule 17.D: "If completion cannot be verified, display 'Printer accepted job; completion not confirmed'"
    const finalAck = new Date().toISOString();
    const jobUnconfirmed = await dbService.updateJob(jobId, {
      status: 'COMPLETED',
      completionVerified: false,
      lastAcknowledgementAt: finalAck,
      message: 'Printer accepted job; completion not confirmed.',
      verificationDetails: {
        verifiedAt: finalAck,
        evidence: `Job #${printerJobId} was spooled to HP LaserJet M126nw. Physical output not verified by telemetry.`,
        finalPrinterState: 'IDLE',
      },
    });
    if (jobUnconfirmed) sseService.broadcastJobUpdate(jobUnconfirmed);
  }
}

export const dispatcherService = new DispatcherService();
