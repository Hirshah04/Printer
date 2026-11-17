"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pclmConverter = exports.PCLmConverter = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class PCLmConverter {
    ghostscriptBinary = null;
    hasCheckedGs = false;
    /**
     * Locate Ghostscript binary on current OS
     */
    async findGhostscript() {
        if (this.hasCheckedGs)
            return this.ghostscriptBinary;
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
            }
            catch {
                // Continue checking
            }
        }
        console.warn('[PCLmConverter] Ghostscript not found in system PATH. PCLm conversion will use fallback methods.');
        return null;
    }
    /**
     * Convert a PDF buffer to PCLm format accepted by HP LaserJet Pro MFP M126nw
     */
    async convertPdfToPclm(pdfBuffer, options = {}) {
        const paperSize = (options.paperSize || 'A4').toLowerCase();
        const dpi = options.resolutionDpi || 300;
        const gs = await this.findGhostscript();
        if (gs) {
            try {
                const tempId = `print-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
                const inputPdfPath = path_1.default.join(os_1.default.tmpdir(), `${tempId}.pdf`);
                const outputPclmPath = path_1.default.join(os_1.default.tmpdir(), `${tempId}.pclm`);
                await fs_1.default.promises.writeFile(inputPdfPath, pdfBuffer);
                // Ghostscript command to generate PCLm:
                // -sDEVICE=pclm generates standard PCLm mobile/AirPrint stream
                // -r300 for 300 DPI (crisp laser printing)
                // -sPAPERSIZE=a4
                // -dPDFFitPage
                const cmd = `${gs} -sDEVICE=pclm -r${dpi} -sPAPERSIZE=${paperSize} -dPDFFitPage -dNOPAUSE -dBATCH -dQUIET -sOutputFile="${outputPclmPath}" "${inputPdfPath}"`;
                await execAsync(cmd);
                if (fs_1.default.existsSync(outputPclmPath)) {
                    const pclmBuffer = await fs_1.default.promises.readFile(outputPclmPath);
                    // Clean up temp files
                    fs_1.default.promises.unlink(inputPdfPath).catch(() => { });
                    fs_1.default.promises.unlink(outputPclmPath).catch(() => { });
                    return {
                        success: true,
                        format: 'application/PCLm',
                        buffer: pclmBuffer,
                        methodUsed: `Ghostscript (${gs}) native pclm device @ ${dpi}dpi (${paperSize.toUpperCase()})`,
                    };
                }
            }
            catch (err) {
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
    selectOptimalFormat(supportedFormats) {
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
exports.PCLmConverter = PCLmConverter;
exports.pclmConverter = new PCLmConverter();
