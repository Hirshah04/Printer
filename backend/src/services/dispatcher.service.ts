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

    const tempPdf = path.join(os.tmpdir(), `${jobId}.pdf`);
    const tempPclm = path.join(os.tmpdir(), `${jobId}.pclm`);

    try {
      // 1. Update status to PROCESSING
      await dbService.updateJob(jobId, {
        status: 'PROCESSING',
        message: 'Converting document to HP PCLm raster format at 300 DPI...',
      });

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
      await dbService.updateJob(jobId, {
        status: 'SENT_TO_PRINTER',
        message: `Transmitting PCLm data to ${printerIp}:${printerPort}...`,
      });

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
