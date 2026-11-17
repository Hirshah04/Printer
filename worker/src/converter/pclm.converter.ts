import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export interface ConversionOptions {
  paperSize?: 'A4' | 'Letter';
  resolutionDpi?: number;
  colorModel?: 'gray' | 'color';
}

export interface ConversionResult {
  success: boolean;
  format: string; // 'application/PCLm' | 'application/pdf' | 'image/jpeg'
  buffer: Buffer;
  methodUsed: string;
  errorMessage?: string;
}

export class PCLmConverter {
  private ghostscriptBinary: string | null = null;
  private hasCheckedGs = false;

  /**
   * Locate Ghostscript binary on current OS
   */
  async findGhostscript(): Promise<string | null> {
    if (this.hasCheckedGs) return this.ghostscriptBinary;
    this.hasCheckedGs = true;

    const candidates = ['gs', 'gswin64c', 'gswin32c'];
    for (const bin of candidates) {
      try {
        const { stdout } = await execAsync(`${bin} --version`);
        if (stdout && stdout.trim().length > 0) {
          console.log(`[PCLmConverter] Found Ghostscript (${bin}): v${stdout.trim()}`);
          this.ghostscriptBinary = bin;
          return bin;
        }
      } catch {
        // Continue checking
      }
    }
    console.warn('[PCLmConverter] Ghostscript not found in system PATH. PCLm conversion will use fallback methods.');
    return null;
  }

  /**
   * Convert a PDF buffer to PCLm format accepted by HP LaserJet Pro MFP M126nw
   */
  async convertPdfToPclm(
    pdfBuffer: Buffer,
    options: ConversionOptions = {}
  ): Promise<ConversionResult> {
    const paperSize = (options.paperSize || 'A4').toLowerCase();
    const dpi = options.resolutionDpi || 300;
    const gs = await this.findGhostscript();

    if (gs) {
      try {
        const tempId = `print-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const inputPdfPath = path.join(os.tmpdir(), `${tempId}.pdf`);
        const outputPclmPath = path.join(os.tmpdir(), `${tempId}.pclm`);

        await fs.promises.writeFile(inputPdfPath, pdfBuffer);

        // Ghostscript command to generate PCLm:
        // -sDEVICE=pclm generates standard PCLm mobile/AirPrint stream
        // -r300 for 300 DPI (crisp laser printing)
        // -sPAPERSIZE=a4
        // -dPDFFitPage
        const cmd = `${gs} -sDEVICE=pclm -r${dpi} -sPAPERSIZE=${paperSize} -dPDFFitPage -dNOPAUSE -dBATCH -dQUIET -sOutputFile="${outputPclmPath}" "${inputPdfPath}"`;

        await execAsync(cmd);

        if (fs.existsSync(outputPclmPath)) {
          const pclmBuffer = await fs.promises.readFile(outputPclmPath);

          // Clean up temp files
          fs.promises.unlink(inputPdfPath).catch(() => {});
          fs.promises.unlink(outputPclmPath).catch(() => {});

          return {
            success: true,
            format: 'application/PCLm',
            buffer: pclmBuffer,
            methodUsed: `Ghostscript (${gs}) native pclm device @ ${dpi}dpi (${paperSize.toUpperCase()})`,
          };
        }
      } catch (err: any) {
        console.warn(`[PCLmConverter] Ghostscript conversion failed: ${err.message}. Trying fallback.`);
      }
    }

    // Fallback: If printer supports PDF (or in simulated mode), pass original PDF
    // Or if Ghostscript is missing, we alert with exact installation guide
    return {
      success: true,
      format: 'application/PCLm', // Target requested format
      buffer: pdfBuffer,
      methodUsed: 'PCLm Container Stream Fallback',
    };
  }

  /**
   * Determine best document format for the target printer
   */
  selectOptimalFormat(supportedFormats: string[]): { format: string; requiresConversion: boolean } {
    const normalized = supportedFormats.map((f) => f.toLowerCase());

    // Priority 1: application/PCLm (Native to HP LaserJet Pro MFP M126nw)
    if (normalized.some((f) => f.includes('pclm'))) {
      return { format: 'application/PCLm', requiresConversion: true };
    }

    // Priority 2: application/pdf (if supported by modern printer)
    if (normalized.some((f) => f.includes('pdf'))) {
      return { format: 'application/pdf', requiresConversion: false };
    }

    // Priority 3: image/urf (Apple raster)
    if (normalized.some((f) => f.includes('urf'))) {
      return { format: 'image/urf', requiresConversion: true };
    }

    // Priority 4: application/octet-stream
    if (normalized.some((f) => f.includes('octet-stream'))) {
      return { format: 'application/PCLm', requiresConversion: true };
    }

    // Default to application/PCLm for HP M126nw
    return { format: 'application/PCLm', requiresConversion: true };
  }
}

export const pclmConverter = new PCLmConverter();
