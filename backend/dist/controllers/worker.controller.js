"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.heartbeat = heartbeat;
exports.getNextJob = getNextJob;
exports.updateJobStatus = updateJobStatus;
exports.updatePrinterStatus = updatePrinterStatus;
const Worker_js_1 = require("../models/Worker.js");
const PrintJob_js_1 = require("../models/PrintJob.js");
const Printer_js_1 = require("../models/Printer.js");
const queue_service_js_1 = require("../services/queue.service.js");
const logger_service_js_1 = require("../services/logger.service.js");
async function heartbeat(req, res) {
    try {
        const { workerId, name, status, vpnStatus, vpnIp, gatewayIp, version, systemInfo } = req.body;
        const finalWorkerId = workerId || req.workerId || 'cloud-worker-1';
        const worker = await Worker_js_1.Worker.findOneAndUpdate({ workerId: finalWorkerId }, {
            $set: {
                name: name || 'Cloud Print Worker',
                status: status || 'ONLINE',
                vpnStatus: vpnStatus || 'UNKNOWN',
                vpnIp,
                gatewayIp,
                version: version || '1.0.0',
                lastHeartbeat: new Date(),
                systemInfo,
            },
        }, { upsert: true, new: true });
        res.json({ success: true, message: 'Heartbeat acknowledged', worker });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function getNextJob(req, res) {
    try {
        const workerId = (req.workerId || req.query.workerId || 'cloud-worker');
        const job = await queue_service_js_1.queueService.getNextPendingJob(workerId);
        if (!job) {
            res.json({ success: true, job: null, message: 'No pending print jobs.' });
            return;
        }
        res.json({
            success: true,
            job,
            printer: job.printerId,
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function updateJobStatus(req, res) {
    try {
        const { id } = req.params;
        const { status, message, printerJobId, printerStatusMessage, errorMessage, verificationDetails, } = req.body;
        const job = await PrintJob_js_1.PrintJob.findById(id);
        if (!job) {
            res.status(404).json({ success: false, message: 'Print job not found.' });
            return;
        }
        if (status) {
            job.status = status;
            job.statusHistory.push({
                status: status,
                timestamp: new Date(),
                message: message || `Status updated to ${status}`,
            });
        }
        if (printerJobId)
            job.printerJobId = printerJobId;
        if (printerStatusMessage)
            job.printerStatusMessage = printerStatusMessage;
        if (errorMessage)
            job.errorMessage = errorMessage;
        if (verificationDetails)
            job.verificationDetails = verificationDetails;
        // Handle failure retry logic
        if (status === 'FAILED' && job.retryCount < job.maxRetries) {
            // Auto-retry if transient error (e.g. printer busy)
            if (errorMessage && (errorMessage.includes('busy') || errorMessage.includes('timeout'))) {
                job.retryCount += 1;
                job.status = 'QUEUED';
                job.statusHistory.push({
                    status: 'QUEUED',
                    timestamp: new Date(),
                    message: `Auto-retrying recoverable failure (Attempt ${job.retryCount + 1}/${job.maxRetries}): ${errorMessage}`,
                });
                await queue_service_js_1.queueService.enqueueJob(String(job._id));
            }
        }
        await job.save();
        await logger_service_js_1.loggerService.info(`JOB_${status}`, `Job ${job._id} transitioned to ${status}: ${message || errorMessage || ''}`, { jobId: job._id, status, verificationDetails }, String(job._id));
        res.json({ success: true, job });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function updatePrinterStatus(req, res) {
    try {
        const { id } = req.params;
        const { connectionStatus, paperStatus, tonerStatus, stateReasons, supportedFormats } = req.body;
        const printer = await Printer_js_1.Printer.findById(id);
        if (!printer) {
            res.status(404).json({ success: false, message: 'Printer not found.' });
            return;
        }
        if (connectionStatus)
            printer.connectionStatus = connectionStatus;
        if (paperStatus)
            printer.paperStatus = paperStatus;
        if (tonerStatus)
            printer.tonerStatus = tonerStatus;
        if (stateReasons)
            printer.stateReasons = stateReasons;
        if (supportedFormats && supportedFormats.length > 0)
            printer.supportedFormats = supportedFormats;
        printer.lastSeenAt = new Date();
        await printer.save();
        res.json({ success: true, printer });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
