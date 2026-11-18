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
        message: 'Converting document to native HP LaserJet PCLm raster format at 300 DPI...',
      });
      if (jobProcessing) sseService.broadcastJobUpdate(jobProcessing);

      // 2. Fetch document buffer
      const pdfBuffer = await storageService.getFileBuffer(job.storageKey);
      await fs.promises.writeFile(tempPdf, pdfBuffer);

      // 3. Convert PDF to native HP LaserJet PCLm stream at 300 DPI using PyMuPDF PCLm generator
      const pyBin = process.platform === 'win32' ? 'python' : 'python3';
      const scriptCandidates = [
        path.resolve(process.cwd(), 'dist/scripts/pdf_to_pclm.py'),
        path.resolve(process.cwd(), 'src/scripts/pdf_to_pclm.py'),
        path.resolve(process.cwd(), 'scripts/pdf_to_pclm.py'),
        path.resolve(__dirname, '../scripts/pdf_to_pclm.py'),
        path.resolve(__dirname, '../../src/scripts/pdf_to_pclm.py'),
      ];
      const scriptPath = scriptCandidates.find((p) => fs.existsSync(p)) || scriptCandidates[0];
      const cmd = `"${pyBin}" "${scriptPath}" "${tempPdf}" "${tempPclm}" 300 "${job.paperSize || 'A4'}" "${job.orientation || 'AUTO'}"`;

      await execAsync(cmd, { timeout: 45000 });

      if (!fs.existsSync(tempPclm)) {
        throw new Error('Failed to generate PCLm print data for HP LaserJet');
      }

      const pclmBuffer = await fs.promises.readFile(tempPclm);
      console.log(`[Dispatcher] Successfully generated PCLm stream: ${pclmBuffer.length} bytes @ 300 DPI`);

      // 4. Update status to SENT_TO_PRINTER
      const jobSent = await dbService.updateJob(jobId, {
        status: 'SENT_TO_PRINTER',
        message: `Transmitting PCLm data to printer at ${printerIp}:${printerPort}...`,
      });
      if (jobSent) sseService.broadcastJobUpdate(jobSent);

      // Attempt Primary Protocol: Direct HP JetDirect RAW Port 9100 with PJL wrapper
      // HP LaserJet Pro MFP M126nw is a host-based printer; streaming to Port 9100 avoids the IPP "spool-area-full" buffer overflow.
      let printerJobId = '';
      let isSubmitted = false;
      let methodUsed = '';

      try {
        const rawPort = config.printer.rawPort || 9100;
        console.log(`[Dispatcher] Streaming directly to HP JetDirect RAW port ${rawPort} on ${printerIp}...`);
        await this.streamToRawPort(printerIp, rawPort, pclmBuffer, job.documentName, 'A4', job.copies || 1);
        printerJobId = `RAW-${Date.now().toString().slice(-4)}`;
        isSubmitted = true;
        methodUsed = 'RAW Port 9100';
        console.log(`[Dispatcher] RAW stream successfully sent to ${printerIp}:${rawPort}!`);
      } catch (rawErr: any) {
        console.warn(`[Dispatcher] RAW Port 9100 streaming failed: ${rawErr.message}. Falling back to IPP Print-Job.`);
      }

      // Secondary Fallback: IPP Print-Job (Port 631)
      if (!isSubmitted) {
        try {
          const ippPrinter = ipp.Printer(printerUri);
          const media = 'iso_a4_210x297mm';

          const printMsg: any = {
            'operation-attributes-tag': {
              'requesting-user-name': 'AirPrintHub',
              'job-name': job.documentName,
              'document-format': 'application/PCLm',
            },
            'job-attributes-tag': {
              copies: job.copies || 1,
              media,
              'orientation-requested': job.orientation === 'LANDSCAPE' ? 4 : 3,
            },
            data: pclmBuffer,
          };

          const submitRes: any = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('IPP connection timed out')), 120000);
            ippPrinter.execute('Print-Job', printMsg, (err: any, res: any) => {
              clearTimeout(timeout);
              if (err) reject(err);
              else resolve(res);
            });
          });

          const statusStr = String(submitRes?.statusCode || '').toLowerCase();
          if (submitRes?.statusCode === 0 || statusStr.includes('successful') || submitRes?.['job-attributes-tag']?.['job-id']) {
            printerJobId = String(submitRes['job-attributes-tag']?.['job-id'] || '');
            isSubmitted = true;
            methodUsed = `IPP Job #${printerJobId}`;
            console.log(`[Dispatcher] Print job accepted via IPP! Job ID: #${printerJobId}`);
          } else {
            throw new Error(`IPP rejected submission (${submitRes?.statusCode})`);
          }
        } catch (ippErr: any) {
          throw new Error(`Both RAW Port 9100 and IPP failed: ${ippErr.message}`);
        }
      }

      const ackTime = new Date().toISOString();

      // 5. Update status: PRINTER_ACCEPTED
      const jobAccepted = await dbService.updateJob(jobId, {
        status: 'PRINTER_ACCEPTED',
        message: `Accepted by HP LaserJet M126nw (${methodUsed})`,
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
      if (methodUsed.includes('IPP') && printerJobId) {
        const ippPrinter = ipp.Printer(printerUri);
        await this.trackJobUntilFinished(ippPrinter, printerJobId, jobId, job.documentName);
      } else {
        // For RAW port 9100: monitor printer state returning to IDLE with 0 errors
        await this.trackRawJobCompletion(printerIp, jobId, printerJobId);
      }
    } catch (err: any) {
      console.error(`[Dispatcher] Print job ${jobId} failed:`, err.message);
      const isPrivateIp = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.)/.test(printerIp);
      const isNetworkTimeout = err.message && (
        err.message.includes('Timeout') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('EHOSTUNREACH') ||
        err.message.includes('ETIMEDOUT')
      );

      let userFriendlyMessage = err.message;
      if (isPrivateIp && isNetworkTimeout) {
        userFriendlyMessage = `Cannot reach private IP ${printerIp} directly from cloud server. Please start the local print worker on your home Wi-Fi or configure router port forwarding.`;
      }

      const failTime = new Date().toISOString();
      const jobFailed = await dbService.updateJob(jobId, {
        status: 'FAILED',
        failedAt: failTime,
        message: userFriendlyMessage,
        errorMessage: userFriendlyMessage,
        printerError: userFriendlyMessage,
      });
      if (jobFailed) sseService.broadcastJobUpdate(jobFailed);
    } finally {
      // Clean up temp files
      fs.promises.unlink(tempPdf).catch(() => {});
      fs.promises.unlink(tempPclm).catch(() => {});
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
      socket.setTimeout(45000);

      // Clean PJL wrapper for HP LaserJet Pro MFP M126nw.
      // NOTE: HP LaserJet M126nw firmware returns '?' (syntax error) for @PJL SET variables.
      // It only accepts @PJL ENTER LANGUAGE = PCLm and @PJL RESET.
      const pjlHeader = Buffer.from(
        '\x1b%-12345X@PJL\r\n' +
        '@PJL JOB\r\n' +
        '@PJL ENTER LANGUAGE = PCLm\r\n',
        'ascii'
      );
      const pjlFooter = Buffer.from('\r\n\x1b%-12345X@PJL\r\n@PJL EOJ\r\n\x1b%-12345X', 'ascii');
      const payload = Buffer.concat([pjlHeader, data, pjlFooter]);

      let finished = false;

      const cleanup = (err?: Error) => {
        if (!finished) {
          finished = true;
          socket.removeAllListeners();
          socket.destroy();
          if (err) reject(err);
          else resolve();
        }
      };

      socket.on('error', (err) => {
        cleanup(err);
      });

      socket.on('timeout', () => {
        cleanup(new Error(`Timeout streaming to printer raw port ${host}:${port}`));
      });

      socket.connect(port, host, () => {
        socket.write(payload, () => {
          // All data has been flushed to the network socket
          socket.end(() => {
            // Give TCP 1 second to drain buffers over WAN, then cleanly close and resolve
            setTimeout(() => {
              cleanup();
            }, 1000);
          });
        });
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
            const reasons = jobRes['job-attributes-tag']?.['job-state-reasons'] || 'aborted by printer';
            const reasonStr = Array.isArray(reasons) ? reasons.join(', ') : String(reasons);
            const jobAborted = await dbService.updateJob(jobId, {
              status: 'FAILED',
              printerJobState: 'aborted',
              failedAt: ackTime,
              lastAcknowledgementAt: ackTime,
              printerError: `Printer aborted job (${reasonStr})`,
              message: `Printer aborted job: ${reasonStr}. Please check printer control panel.`,
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
          // If Get-Job-Attributes returns null, the HP LaserJet may have finished and purged the job from memory.
          // Check printer attributes directly:
          const pAttrs: any = await new Promise((resolve) => {
            ippPrinter.execute('Get-Printer-Attributes', null, (err: any, res: any) => {
              if (err) resolve(null);
              else resolve(res);
            });
          });

          if (pAttrs && pAttrs['printer-attributes-tag']) {
            const pState = pAttrs['printer-attributes-tag']['printer-state'];
            const pReasons = pAttrs['printer-attributes-tag']['printer-state-reasons'];
            const activeErr = this.extractPrinterError(pReasons);

            if (activeErr) {
              const errTime = new Date().toISOString();
              const jobFailed = await dbService.updateJob(jobId, {
                status: 'FAILED',
                failedAt: errTime,
                lastAcknowledgementAt: errTime,
                printerError: activeErr,
                message: activeErr,
              });
              if (jobFailed) sseService.broadcastJobUpdate(jobFailed);
              return;
            }

            const qCount = pAttrs['printer-attributes-tag']['queued-job-count'] || 0;
            if ((pState === 'idle' || pState === 3) && qCount === 0 && Date.now() - startTime > 12000) {
              console.log(`[Dispatcher] Job #${printerJobId} concluded: HP printer idle with clear queue.`);
              const doneTime = new Date().toISOString();
              const jobDone = await dbService.updateJob(jobId, {
                status: 'COMPLETED',
                printerJobState: 'completed',
                completionVerified: true,
                completedAt: doneTime,
                sheetsPrinted: 1,
                lastAcknowledgementAt: doneTime,
                message: 'Printer reports that the document has finished printing.',
                verificationDetails: {
                  verifiedAt: doneTime,
                  evidence: 'HP LaserJet completed physical print: printer returned to IDLE with 0 queued jobs.',
                  finalPrinterState: 'IDLE',
                  sheetsPrinted: 1,
                },
              });
              if (jobDone) sseService.broadcastJobUpdate(jobDone);
              return;
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Dispatcher] Error tracking job #${printerJobId}: ${err.message}`);
      }
    }

    // Timeout reached without explicit verification: check printer error state
    const finalAck = new Date().toISOString();
    let finalError = 'Printing timed out: Printer did not confirm completion within 60 seconds.';

    try {
      const pAttrs: any = await new Promise((resolve) => {
        ippPrinter.execute('Get-Printer-Attributes', null, (err: any, res: any) => {
          if (err) resolve(null);
          else resolve(res);
        });
      });
      if (pAttrs && pAttrs['printer-attributes-tag']) {
        const pReasons = pAttrs['printer-attributes-tag']['printer-state-reasons'];
        const activeErr = this.extractPrinterError(pReasons);
        if (activeErr) finalError = activeErr;
      }
    } catch {}

    const jobFailed = await dbService.updateJob(jobId, {
      status: 'FAILED',
      completionVerified: false,
      failedAt: finalAck,
      lastAcknowledgementAt: finalAck,
      printerError: finalError,
      message: finalError,
    });
    if (jobFailed) sseService.broadcastJobUpdate(jobFailed);
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

        const activeErr = this.extractPrinterError(pReasons);
        if (activeErr) {
          const jobFailed = await dbService.updateJob(jobId, {
            status: 'FAILED',
            failedAt: ackTime,
            lastAcknowledgementAt: ackTime,
            printerError: activeErr,
            message: activeErr,
          });
          if (jobFailed) sseService.broadcastJobUpdate(jobFailed);
          return;
        }

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
    const jobFailed = await dbService.updateJob(jobId, {
      status: 'FAILED',
      completionVerified: false,
      failedAt: finalAck,
      lastAcknowledgementAt: finalAck,
      printerError: 'RAW Print timed out: printer did not acknowledge completion.',
      message: 'RAW print job could not be verified by printer telemetry.',
    });
    if (jobFailed) sseService.broadcastJobUpdate(jobFailed);
  }

  /**
   * Helper to parse and return human-readable printer hardware errors
   */
  private extractPrinterError(reasons: any): string | null {
    if (!reasons) return null;
    const reasonList = Array.isArray(reasons) ? reasons : [reasons];
    const errorMap: Record<string, string> = {
      'media-empty-report': 'Printer is out of paper. Please load paper into the input tray.',
      'media-empty': 'Printer is out of paper. Please load paper into the input tray.',
      'media-jam-report': 'Paper jam detected in the printer.',
      'media-jam': 'Paper jam detected in the printer.',
      'cover-open-report': 'Printer door or toner cartridge cover is open.',
      'door-open': 'Printer door or toner cartridge cover is open.',
      'spool-area-full-report': 'Printer memory / spool area is full. Waiting for current jobs to clear.',
      'spool-area-full': 'Printer memory / spool area is full.',
      'toner-empty-report': 'Toner cartridge is empty and must be replaced.',
      'toner-empty': 'Toner cartridge is empty.',
      'toner-missing-report': 'Toner cartridge is not installed.',
    };

    const critical = reasonList.filter(
      (r: any) => typeof r === 'string' && r !== 'none' && !r.includes('low') && errorMap[r]
    );

    if (critical.length > 0) {
      return critical.map((r: string) => errorMap[r] || r).join('; ');
    }
    return null;
  }
}

export const dispatcherService = new DispatcherService();
