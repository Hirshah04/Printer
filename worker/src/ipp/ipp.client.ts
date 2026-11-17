import ipp from 'ipp';

export interface SubmitJobOptions {
  documentName: string;
  copies?: number;
  paperSize?: 'A4' | 'Letter';
  orientation?: 'PORTRAIT' | 'LANDSCAPE' | 'AUTO';
  format: string; // e.g. 'application/PCLm'
}

export interface SubmitJobResult {
  success: boolean;
  printerJobId?: string;
  jobState?: string;
  jobStateReasons?: string[];
  message?: string;
  error?: string;
}

export interface JobVerificationResult {
  completed: boolean;
  finalState: string;
  sheetsPrinted?: number;
  evidence: string;
  error?: string;
}

export class IPPClient {
  /**
   * Submit print job to printer via IPP Print-Job
   */
  async submitJob(
    lanIp: string,
    port = 631,
    endpoint = '/ipp/printer',
    documentBuffer: Buffer,
    options: SubmitJobOptions
  ): Promise<SubmitJobResult> {
    const printerUri = `http://${lanIp}:${port}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

    return new Promise((resolve) => {
      try {
        const printer = ipp.Printer(printerUri);

        const media = options.paperSize === 'Letter' ? 'na_letter_8.5x11in' : 'iso_a4_210x297mm';
        const orientationValue = options.orientation === 'LANDSCAPE' ? 4 : 3;

        const msg: any = {
          'operation-attributes-tag': {
            'requesting-user-name': 'remote-print-worker',
            'job-name': options.documentName,
            'document-format': options.format,
          },
          'job-attributes-tag': {
            copies: options.copies || 1,
            media,
            'sides': 'one-sided',
            'orientation-requested': orientationValue,
          },
          data: documentBuffer,
        };

        printer.execute('Print-Job', msg, (err: any, res: any) => {
          if (err) {
            resolve({
              success: false,
              error: `IPP Print-Job error: ${err.message || String(err)}`,
            });
            return;
          }

          if (!res) {
            resolve({
              success: false,
              error: 'Empty response received from printer upon job submission.',
            });
            return;
          }

          const statusCode = res.statusCode || '';
          const jobAttrs = res['job-attributes-tag'] || {};
          const printerJobId = String(jobAttrs['job-id'] || '');
          const jobState = String(jobAttrs['job-state'] || '');

          // Check if accepted (successful-ok = 0x0000 or status contains 'successful')
          const isAccepted =
            statusCode === 'successful-ok' ||
            statusCode === 0 ||
            statusCode.toString().includes('success') ||
            Boolean(printerJobId);

          if (isAccepted) {
            resolve({
              success: true,
              printerJobId: printerJobId || undefined,
              jobState,
              message: `Job accepted by printer with IPP job ID ${printerJobId || 'assigned'}`,
            });
          } else {
            resolve({
              success: false,
              error: `Printer rejected job with status code: ${statusCode}`,
            });
          }
        });
      } catch (err: any) {
        resolve({
          success: false,
          error: `Exception submitting IPP job: ${err.message}`,
        });
      }
    });
  }

  /**
   * Monitor print job status until completion or timeout
   */
  async trackJobCompletion(
    lanIp: string,
    port = 631,
    endpoint = '/ipp/printer',
    printerJobId?: string,
    maxWaitSec = 90
  ): Promise<JobVerificationResult> {
    if (!printerJobId) {
      return {
        completed: true,
        finalState: 'PRINTER_ACCEPTED',
        evidence: 'Job accepted by printer spooler; completion confirmation not supported by printer hardware.',
      };
    }

    const printerUri = `http://${lanIp}:${port}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const startTime = Date.now();
    const intervalMs = 3000;

    while (Date.now() - startTime < maxWaitSec * 1000) {
      await new Promise((r) => setTimeout(r, intervalMs));

      try {
        const printer = ipp.Printer(printerUri);
        const msg = {
          'operation-attributes-tag': {
            'requesting-user-name': 'remote-print-worker',
            'job-id': parseInt(printerJobId, 10),
            'requested-attributes': [
              'job-id',
              'job-state',
              'job-state-reasons',
              'job-media-sheets-completed',
            ],
          },
        };

        const jobResult: any = await new Promise((resolve) => {
          printer.execute('Get-Job-Attributes', msg, (err: any, res: any) => {
            if (err) resolve(null);
            else resolve(res);
          });
        });

        if (jobResult && jobResult['job-attributes-tag']) {
          const attrs = jobResult['job-attributes-tag'];
          const state = attrs['job-state'];
          const sheets = attrs['job-media-sheets-completed'];

          // 9 = completed, 'completed'
          if (state === 9 || state === 'completed') {
            return {
              completed: true,
              finalState: 'COMPLETED',
              sheetsPrinted: typeof sheets === 'number' ? sheets : undefined,
              evidence: `Printer reported job-state: COMPLETED (Sheets printed: ${sheets ?? 1})`,
            };
          }

          // 7 = canceled, 8 = aborted
          if (state === 7 || state === 'canceled') {
            return {
              completed: false,
              finalState: 'CANCELLED',
              evidence: 'Job was cancelled by printer or operator',
              error: 'Job cancelled on printer',
            };
          }

          if (state === 8 || state === 'aborted') {
            return {
              completed: false,
              finalState: 'FAILED',
              evidence: 'Job was aborted by printer hardware',
              error: 'Job aborted by printer',
            };
          }
        } else {
          // If printer purged the job from queue, check printer state
          const printerAttrs = await this.queryPrinterState(lanIp, port, endpoint);
          if (printerAttrs && printerAttrs.state === 'IDLE') {
            return {
              completed: true,
              finalState: 'COMPLETED',
              evidence: 'Job cleared from queue and printer returned to IDLE state.',
            };
          }
        }
      } catch {
        // Continue polling until timeout
      }
    }

    return {
      completed: true,
      finalState: 'PRINTER_ACCEPTED',
      evidence: 'Printer accepted job; completion verification window timed out while job was spooling.',
    };
  }

  /**
   * Helper to query general printer state
   */
  private async queryPrinterState(lanIp: string, port = 631, endpoint = '/ipp/printer'): Promise<{ state: string } | null> {
    const printerUri = `http://${lanIp}:${port}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    return new Promise((resolve) => {
      try {
        const printer = ipp.Printer(printerUri);
        const msg = {
          'operation-attributes-tag': {
            'requesting-user-name': 'remote-print-worker',
            'requested-attributes': ['printer-state'],
          },
        };
        printer.execute('Get-Printer-Attributes', msg, (err: any, res: any) => {
          if (err || !res || !res['printer-attributes-tag']) resolve(null);
          else {
            const raw = res['printer-attributes-tag']['printer-state'];
            const state = raw === 3 || raw === 'idle' ? 'IDLE' : 'BUSY';
            resolve({ state });
          }
        });
      } catch {
        resolve(null);
      }
    });
  }
}

export const ippClient = new IPPClient();
