"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ippService = exports.IPPService = void 0;
const ipp_1 = __importDefault(require("ipp"));
class IPPService {
    /**
     * Query printer attributes via IPP Get-Printer-Attributes
     */
    async getPrinterAttributes(lanIp, port = 631, endpoint = '/ipp/printer', timeoutMs = 6000) {
        const printerUri = `http://${lanIp}:${port}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
        return new Promise((resolve) => {
            let isResolved = false;
            const timer = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    resolve({
                        reachable: false,
                        error: `Connection timed out after ${timeoutMs}ms trying to reach ${printerUri}. Verify VPN connection and LAN IP.`,
                    });
                }
            }, timeoutMs);
            try {
                const printer = ipp_1.default.Printer(printerUri);
                const msg = {
                    'operation-attributes-tag': {
                        'requesting-user-name': 'remote-print-hub',
                        'requested-attributes': [
                            'printer-state',
                            'printer-state-reasons',
                            'printer-state-message',
                            'document-format-supported',
                            'marker-levels',
                            'marker-names',
                            'marker-types',
                            'media-ready',
                            'printer-is-accepting-jobs',
                            'printer-name',
                            'printer-make-and-model',
                        ],
                    },
                };
                printer.execute('Get-Printer-Attributes', msg, (err, res) => {
                    if (isResolved)
                        return;
                    clearTimeout(timer);
                    isResolved = true;
                    if (err) {
                        resolve({
                            reachable: false,
                            error: `IPP Error: ${err.message || String(err)}`,
                        });
                        return;
                    }
                    if (!res || !res['printer-attributes-tag']) {
                        resolve({
                            reachable: false,
                            error: 'Invalid IPP response received from printer.',
                        });
                        return;
                    }
                    const attrs = res['printer-attributes-tag'];
                    // State mapping: 3 = idle, 4 = processing, 5 = stopped
                    let state = 'UNKNOWN';
                    if (attrs['printer-state'] === 'idle' || attrs['printer-state'] === 3)
                        state = 'IDLE';
                    else if (attrs['printer-state'] === 'processing' || attrs['printer-state'] === 4)
                        state = 'PROCESSING';
                    else if (attrs['printer-state'] === 'stopped' || attrs['printer-state'] === 5)
                        state = 'STOPPED';
                    // State reasons
                    let stateReasons = [];
                    if (Array.isArray(attrs['printer-state-reasons'])) {
                        stateReasons = attrs['printer-state-reasons'];
                    }
                    else if (typeof attrs['printer-state-reasons'] === 'string') {
                        stateReasons = [attrs['printer-state-reasons']];
                    }
                    // Formats
                    let supportedFormats = [];
                    if (Array.isArray(attrs['document-format-supported'])) {
                        supportedFormats = attrs['document-format-supported'];
                    }
                    else if (typeof attrs['document-format-supported'] === 'string') {
                        supportedFormats = [attrs['document-format-supported']];
                    }
                    // Paper status detection
                    let paperStatus = 'OK';
                    if (stateReasons.some((r) => r.includes('media-empty') || r.includes('media-needed'))) {
                        paperStatus = 'OUT';
                    }
                    else if (stateReasons.some((r) => r.includes('media-low'))) {
                        paperStatus = 'LOW';
                    }
                    // Toner status detection
                    let tonerStatus = 'OK';
                    if (stateReasons.some((r) => r.includes('toner-empty') || r.includes('marker-supply-empty'))) {
                        tonerStatus = 'EMPTY';
                    }
                    else if (stateReasons.some((r) => r.includes('toner-low') || r.includes('marker-supply-low'))) {
                        tonerStatus = 'LOW';
                    }
                    resolve({
                        reachable: true,
                        state,
                        stateReasons,
                        supportedFormats,
                        paperStatus,
                        tonerStatus,
                        rawAttributes: {
                            makeAndModel: attrs['printer-make-and-model'],
                            acceptingJobs: attrs['printer-is-accepting-jobs'],
                            printerStateMessage: attrs['printer-state-message'],
                        },
                    });
                });
            }
            catch (e) {
                if (!isResolved) {
                    clearTimeout(timer);
                    isResolved = true;
                    resolve({
                        reachable: false,
                        error: `Failed to initiate IPP request: ${e.message}`,
                    });
                }
            }
        });
    }
}
exports.IPPService = IPPService;
exports.ippService = new IPPService();
