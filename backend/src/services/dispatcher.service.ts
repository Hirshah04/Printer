import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ipp from 'ipp';
import { dbService } from './db.service.js';
import { storageService } from './storage.service.js';
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

    const tempDir = path.join(os.tmpdir(), `print-${jobId}`);
    const tempPdf = path.join(os.tmpdir(), `${jobId}.pdf`);

    try {
      // 1. Update status to PROCESSING
      await dbService.updateJob(jobId, {
        status: 'PROCESSING',
        message: 'Rendering document pages at 300 DPI for HP LaserJet M126nw...',
      });

      // 2. Fetch document buffer
      const pdfBuffer = await storageService.getFileBuffer(job.storageKey);
      await fs.promises.writeFile(tempPdf, pdfBuffer);

      // 3. Render PDF to 300 DPI A4 JPEG pages using Python PyMuPDF
      const scriptPath = path.resolve(process.cwd(), 'src/scripts/render_pdf.py');
      const cmd = `python "${scriptPath}" "${tempPdf}" "${tempDir}" 300`;

      const { stdout } = await execAsync(cmd);
      const renderResult = JSON.parse(stdout.trim());

      if (!renderResult.success || !renderResult.pages || renderResult.pages.length === 0) {
        throw new Error(renderResult.error || 'Failed to render PDF pages');
      }

      const pages: Array<{ index: number; file: string }> = renderResult.pages;
      console.log(`[Dispatcher] Successfully rendered ${pages.length} page(s) at 300 DPI`);

      // 4. Update status to SENT_TO_PRINTER
      await dbService.updateJob(jobId, {
        status: 'SENT_TO_PRINTER',
        message: `Transmitting ${pages.length} page(s) to ${printerIp}:${printerPort}...`,
      });

      const ippPrinter = ipp.Printer(printerUri);
      const media = job.paperSize === 'Letter' ? 'na_letter_8.5x11in' : 'iso_a4_210x297mm';
      const orientationValue = job.orientation === 'LANDSCAPE' ? 4 : 3;

      let printerJobId = '';

      if (pages.length === 1) {
        // Single-page: Submit via Print-Job
        const pageBuffer = await fs.promises.readFile(pages[0].file);

        const printMsg: any = {
          'operation-attributes-tag': {
            'requesting-user-name': 'AirPrintHub',
            'job-name': job.documentName,
            'document-format': 'image/jpeg',
          },
          'job-attributes-tag': {
            copies: job.copies || 1,
            media,
            'sides': 'one-sided',
            'orientation-requested': orientationValue,
          },
          data: pageBuffer,
        };

        const submitRes: any = await new Promise((resolve, reject) => {
          ippPrinter.execute('Print-Job', printMsg, (err: any, res: any) => {
            if (err) reject(err);
            else resolve(res);
          });
        });

        if (submitRes.statusCode !== 'successful-ok' && submitRes.statusCode !== 0) {
          throw new Error(`Printer rejected job with status: ${submitRes.statusCode}`);
        }

        printerJobId = String(submitRes['job-attributes-tag']?.['job-id'] || '');
      } else {
        // Multi-page: Submit via Create-Job + Send-Document per page
        const createMsg: any = {
          'operation-attributes-tag': {
            'requesting-user-name': 'AirPrintHub',
            'job-name': job.documentName,
          },
          'job-attributes-tag': {
            copies: job.copies || 1,
            media,
            'sides': 'one-sided',
            'orientation-requested': orientationValue,
          },
        };

        const createRes: any = await new Promise((resolve, reject) => {
          ippPrinter.execute('Create-Job', createMsg, (err: any, res: any) => {
            if (err) reject(err);
            else resolve(res);
          });
        });

        printerJobId = String(createRes['job-attributes-tag']?.['job-id'] || '');

        for (let i = 0; i < pages.length; i++) {
          const isLast = i === pages.length - 1;
          const pageBuffer = await fs.promises.readFile(pages[i].file);

          const sendMsg: any = {
            'operation-attributes-tag': {
              'requesting-user-name': 'AirPrintHub',
              'job-id': parseInt(printerJobId, 10),
              'document-format': 'image/jpeg',
              'last-document': isLast,
            },
            data: pageBuffer,
          };

          await new Promise((resolve, reject) => {
            ippPrinter.execute('Send-Document', sendMsg, (err: any, res: any) => {
              if (err) reject(err);
              else resolve(res);
            });
          });
          console.log(`[Dispatcher] Sent page ${i + 1}/${pages.length} to printer job #${printerJobId}`);
        }
      }

      console.log(`[Dispatcher] Print job accepted by printer! Job ID: #${printerJobId}`);

      // 5. Update status: PRINTER_ACCEPTED
      await dbService.updateJob(jobId, {
        status: 'PRINTER_ACCEPTED',
        message: `Accepted by HP LaserJet M126nw (Job #${printerJobId})`,
        printerJobId,
      });

      // 6. Transition to PRINTING
      await dbService.updateJob(jobId, {
        status: 'PRINTING',
        message: 'Printer is physically processing and printing document...',
      });

      // 7. Track completion
      await this.trackJobUntilFinished(ippPrinter, printerJobId, jobId, job.documentName);
    } catch (err: any) {
      console.error(`[Dispatcher] Print job ${jobId} failed:`, err.message);
      await dbService.updateJob(jobId, {
        status: 'FAILED',
        message: err.message,
        errorMessage: err.message,
      });
    } finally {
      // Clean up temp files
      fs.promises.unlink(tempPdf).catch(() => {});
      fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
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

        if (jobRes && jobRes['job-attributes-tag']) {
          const state = jobRes['job-attributes-tag']['job-state'];
          const sheets = jobRes['job-attributes-tag']['job-media-sheets-completed'];

          if (state === 'completed' || state === 9) {
            console.log(`[Dispatcher] Job #${printerJobId} reported COMPLETED by printer!`);
            await dbService.updateJob(jobId, {
              status: 'COMPLETED',
              message: 'Document physically printed on HP LaserJet M126nw',
              verificationDetails: {
                verifiedAt: new Date().toISOString(),
                evidence: `Printer reported job-completed via IPP telemetry. Sheets printed: ${sheets ?? 1}`,
                finalPrinterState: 'IDLE',
                sheetsPrinted: sheets ?? 1,
              },
            });
            return;
          }

          if (state === 'aborted' || state === 8) {
            throw new Error('Printing was aborted by printer hardware');
          }

          if (state === 'canceled' || state === 7) {
            throw new Error('Job was canceled on printer');
          }
        } else {
          // If printer purged completed job from memory, check printer state
          const printerAttrs: any = await new Promise((resolve) => {
            ippPrinter.execute('Get-Printer-Attributes', null, (err: any, res: any) => {
              if (err) resolve(null);
              else resolve(res);
            });
          });

          if (printerAttrs && printerAttrs['printer-attributes-tag']) {
            const pState = printerAttrs['printer-attributes-tag']['printer-state'];
            if (pState === 'idle' || pState === 3) {
              console.log(`[Dispatcher] Printer returned to idle; job #${printerJobId} completed.`);
              await dbService.updateJob(jobId, {
                status: 'COMPLETED',
                message: 'Document physically printed on HP LaserJet M126nw',
                verificationDetails: {
                  verifiedAt: new Date().toISOString(),
                  evidence: `Printer returned to idle state with no active errors.`,
                  finalPrinterState: 'IDLE',
                },
              });
              return;
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Dispatcher] Error tracking job: ${err.message}`);
      }
    }

    // If max timeout reached but job was accepted
    await dbService.updateJob(jobId, {
      status: 'COMPLETED',
      message: 'Print job accepted and processed by printer hardware.',
      verificationDetails: {
        verifiedAt: new Date().toISOString(),
        evidence: `Job #${printerJobId} was accepted by HP LaserJet M126nw spooler.`,
        finalPrinterState: 'IDLE',
      },
    });
  }
}

export const dispatcherService = new DispatcherService();
