"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pdfService = exports.PDFService = void 0;
const pdf_lib_1 = require("pdf-lib");
class PDFService {
    /**
     * Validate and inspect PDF buffer
     */
    async inspectPDF(buffer) {
        const fileSizeBytes = buffer.length;
        // 1. Check Magic bytes for %PDF-
        const header = buffer.subarray(0, 5).toString('ascii');
        if (header !== '%PDF-') {
            return {
                valid: false,
                pageCount: 0,
                fileSizeBytes,
                suggestedOrientation: 'PORTRAIT',
                paperSizeGuess: 'Custom',
                dimensions: [],
                errorMessage: 'Invalid file format: Header does not match standard PDF magic bytes (%PDF-)',
            };
        }
        try {
            // 2. Load PDF with pdf-lib to count pages and inspect dimensions
            const pdfDoc = await pdf_lib_1.PDFDocument.load(buffer, { ignoreEncryption: false });
            const pageCount = pdfDoc.getPageCount();
            if (pageCount === 0) {
                return {
                    valid: false,
                    pageCount: 0,
                    fileSizeBytes,
                    suggestedOrientation: 'PORTRAIT',
                    paperSizeGuess: 'Custom',
                    dimensions: [],
                    errorMessage: 'PDF document contains 0 pages',
                };
            }
            const dimensions = [];
            let portraitCount = 0;
            let landscapeCount = 0;
            for (let i = 0; i < pageCount; i++) {
                const page = pdfDoc.getPage(i);
                const { width, height } = page.getSize();
                dimensions.push({ width: Math.round(width), height: Math.round(height) });
                if (width > height) {
                    landscapeCount++;
                }
                else {
                    portraitCount++;
                }
            }
            // Standard A4 in points is 595.28 x 841.89 (~595 x 842)
            // Letter in points is 612 x 792
            const firstPage = dimensions[0];
            const minDim = Math.min(firstPage.width, firstPage.height);
            const maxDim = Math.max(firstPage.width, firstPage.height);
            let paperSizeGuess = 'Custom';
            if (Math.abs(minDim - 595) < 15 && Math.abs(maxDim - 842) < 15) {
                paperSizeGuess = 'A4';
            }
            else if (Math.abs(minDim - 612) < 15 && Math.abs(maxDim - 792) < 15) {
                paperSizeGuess = 'Letter';
            }
            else {
                paperSizeGuess = 'A4'; // default fallback for HP printer
            }
            const suggestedOrientation = landscapeCount > portraitCount ? 'LANDSCAPE' : 'PORTRAIT';
            return {
                valid: true,
                pageCount,
                fileSizeBytes,
                suggestedOrientation,
                paperSizeGuess,
                dimensions,
            };
        }
        catch (err) {
            return {
                valid: false,
                pageCount: 0,
                fileSizeBytes,
                suggestedOrientation: 'PORTRAIT',
                paperSizeGuess: 'Custom',
                dimensions: [],
                errorMessage: `PDF Parsing Error: ${err.message || 'File is corrupted or password-protected'}`,
            };
        }
    }
}
exports.PDFService = PDFService;
exports.pdfService = new PDFService();
