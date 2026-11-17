"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobConsumer = void 0;
const axios_1 = __importDefault(require("axios"));
const env_js_1 = require("../config/env.js");
const vpn_monitor_js_1 = require("../vpn/vpn.monitor.js");
const pclm_converter_js_1 = require("../converter/pclm.converter.js");
const ipp_client_js_1 = require("../ipp/ipp.client.js");
class JobConsumer {
    isProcessing = false;
    isRunning = false;
    apiClient = axios_1.default.create({
        baseURL: env_js_1.config.backendUrl,
        timeout: 30000,
        headers: {
            'X-Worker-API-Key': env_js_1.config.workerApiKey,
            'X-Worker-ID': env_js_1.config.workerId,
        },
    });
    /**
     * Start worker processing loop & background tasks
     */
    async start() {
        this.isRunning = true;
        console.log(`[Worker] Started Cloud Print Worker: ${env_js_1.config.workerId}`);
        console.log(`[Worker] Connected to Backend: ${env_js_1.config.backendUrl}`);
        // Initial heartbeat
        await this.sendHeartbeat();
        // Start intervals
        setInterval(() => this.sendHeartbeat(), env_js_1.config.heartbeatIntervalMs);
        setInterval(() => this.pollJobs(), env_js_1.config.pollIntervalMs);
    }
    /**
     * Send heartbeat to backend
     */
    async sendHeartbeat() {
        try {
            const vpnHealth = await vpn_monitor_js_1.vpnMonitor.checkVpnStatus();
            await this.apiClient.post('/api/worker/heartbeat', {
                workerId: env_js_1.config.workerId,
                name: env_js_1.config.workerName,
                status: this.isProcessing ? 'BUSY' : 'ONLINE',
                vpnStatus: vpnHealth.vpnStatus,
                vpnIp: vpnHealth.vpnIp,
                gatewayIp: vpnHealth.gatewayIp,
                version: '1.0.0',
                systemInfo: {
                    platform: process.platform,
                    arch: process.arch,
                    uptime: process.uptime(),
                    freeMemoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    wireguardInterface: vpnHealth.interfaceName,
                },
            });
        }
        catch (err) {
            console.warn(`[Worker] Heartbeat failed: ${err.message}`);
        }
    }
    /**
     * Poll backend for pending print jobs
     */
    async pollJobs() {
        if (this.isProcessing || !this.isRunning)
            return;
        try {
            const res = await this.apiClient.get('/api/worker/jobs/next');
            const data = res.data;
            if (data && data.success && data.job) {
                this.isProcessing = true;
                await this.processJob(data.job, data.printer);
            }
        }
        catch (err) {
            // Backend might be offline or sleeping
        }
        finally {
            this.isProcessing = false;
        }
    }
    /**
     * Process a single print job from download to IPP completion
     */
    async processJob(job, printer) {
        const jobId = job._id;
        console.log(`[Worker] Processing Job ${jobId} for document "${job.documentName}"`);
        try {
            // 1. Check VPN status before attempting printer communication
            const vpnHealth = await vpn_monitor_js_1.vpnMonitor.checkVpnStatus();
            console.log(`[Worker] VPN Status: ${vpnHealth.vpnStatus} (IP: ${vpnHealth.vpnIp || 'none'})`);
            // 2. Fetch document bytes
            let downloadUrl = job.storageUrl;
            if (!downloadUrl.startsWith('http')) {
                downloadUrl = `${env_js_1.config.backendUrl}${downloadUrl.startsWith('/') ? downloadUrl : '/' + downloadUrl}`;
            }
            console.log(`[Worker] Downloading document from ${downloadUrl}`);
            const downloadResponse = await axios_1.default.get(downloadUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'X-Worker-API-Key': env_js_1.config.workerApiKey,
                },
            });
            const pdfBuffer = Buffer.from(downloadResponse.data);
            console.log(`[Worker] Downloaded ${pdfBuffer.length} bytes for ${job.documentName}`);
            // 3. Format Conversion (Targeting HP LaserJet Pro MFP M126nw)
            const targetLanIp = printer?.lanIp || env_js_1.config.defaultPrinterIp;
            const targetPort = printer?.ippPort || 631;
            const targetEndpoint = printer?.ippEndpoint || '/ipp/printer';
            const supportedFormats = printer?.supportedFormats || ['application/PCLm'];
            console.log(`[Worker] Target printer: ${printer?.name || 'HP Printer'} @ ${targetLanIp}:${targetPort}${targetEndpoint}`);
            // Check if LAN IP is the HP Wi-Fi Direct address
            if (targetLanIp.startsWith('192.168.223.')) {
                throw new Error(`Target printer IP (${targetLanIp}) is on the HP Wi-Fi Direct SoftAP subnet. ` +
                    `A cloud worker over router VPN cannot reach Wi-Fi Direct. Update the printer LAN IP in Admin Settings to the real router subnet address.`);
            }
            // Format selection
            const formatStrategy = pclm_converter_js_1.pclmConverter.selectOptimalFormat(supportedFormats);
            console.log(`[Worker] Converting document using strategy: format=${formatStrategy.format}, requiresConversion=${formatStrategy.requiresConversion}`);
            let payloadBuffer = pdfBuffer;
            let usedFormat = formatStrategy.format;
            if (formatStrategy.requiresConversion) {
                const conversion = await pclm_converter_js_1.pclmConverter.convertPdfToPclm(pdfBuffer, {
                    paperSize: job.paperSize || 'A4',
                    resolutionDpi: 300,
                });
                payloadBuffer = conversion.buffer;
                usedFormat = conversion.format;
                console.log(`[Worker] Converted to ${usedFormat} (${payloadBuffer.length} bytes) via ${conversion.methodUsed}`);
            }
            // 4. Update status: SENT_TO_PRINTER
            await this.updateStatus(jobId, 'SENT_TO_PRINTER', `Sending ${usedFormat} payload to printer @ ${targetLanIp}`);
            // 5. Submit to IPP
            const submitResult = await ipp_client_js_1.ippClient.submitJob(targetLanIp, targetPort, targetEndpoint, payloadBuffer, {
                documentName: job.documentName,
                copies: job.copies || 1,
                paperSize: job.paperSize || 'A4',
                orientation: job.orientation || 'PORTRAIT',
                format: usedFormat,
            });
            if (!submitResult.success) {
                throw new Error(`IPP submission failed: ${submitResult.error}`);
            }
            console.log(`[Worker] IPP submission accepted! Job ID: ${submitResult.printerJobId}`);
            // 6. Update status: PRINTER_ACCEPTED
            await this.updateStatus(jobId, 'PRINTER_ACCEPTED', `Printer accepted job (IPP Job ID: ${submitResult.printerJobId})`, submitResult.printerJobId);
            // 7. Track job execution until completion
            await this.updateStatus(jobId, 'PRINTING', 'Printer is currently printing document...');
            const verification = await ipp_client_js_1.ippClient.trackJobCompletion(targetLanIp, targetPort, targetEndpoint, submitResult.printerJobId, 90);
            if (verification.completed && verification.finalState === 'COMPLETED') {
                console.log(`[Worker] Job ${jobId} physically completed: ${verification.evidence}`);
                await this.updateStatus(jobId, 'COMPLETED', 'Document physically printed and verified.', submitResult.printerJobId, undefined, {
                    verifiedAt: new Date(),
                    evidence: verification.evidence,
                    finalPrinterState: 'IDLE',
                    sheetsPrinted: verification.sheetsPrinted || job.pageCount * job.copies,
                });
            }
            else if (verification.finalState === 'PRINTER_ACCEPTED') {
                // As requested in Section 10: "If completion cannot be verified, display a clear status such as 'Printer accepted job; completion not confirmed.'"
                await this.updateStatus(jobId, 'PRINTER_ACCEPTED', 'Printer accepted job; completion not confirmed by printer telemetry.', submitResult.printerJobId, undefined, {
                    verifiedAt: new Date(),
                    evidence: verification.evidence,
                    finalPrinterState: 'UNKNOWN',
                });
            }
            else {
                throw new Error(verification.error || 'Printing was stopped or aborted by hardware');
            }
        }
        catch (err) {
            console.error(`[Worker] Job ${jobId} failed: ${err.message}`);
            await this.updateStatus(jobId, 'FAILED', err.message, undefined, err.message);
        }
    }
    /**
     * Helper to update status in backend
     */
    async updateStatus(jobId, status, message, printerJobId, errorMessage, verificationDetails) {
        try {
            await this.apiClient.patch(`/api/worker/jobs/${jobId}/status`, {
                status,
                message,
                printerJobId,
                errorMessage,
                verificationDetails,
            });
        }
        catch (err) {
            console.warn(`[Worker] Failed to report status ${status} to backend: ${err.message}`);
        }
    }
}
exports.JobConsumer = JobConsumer;
