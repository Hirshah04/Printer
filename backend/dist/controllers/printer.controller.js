"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrinters = getPrinters;
exports.getPrinterById = getPrinterById;
exports.createPrinter = createPrinter;
exports.updatePrinter = updatePrinter;
exports.deletePrinter = deletePrinter;
exports.testConnection = testConnection;
exports.detectCapabilities = detectCapabilities;
const zod_1 = require("zod");
const Printer_js_1 = require("../models/Printer.js");
const ipp_service_js_1 = require("../services/ipp.service.js");
const logger_service_js_1 = require("../services/logger.service.js");
const printerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Printer name must be at least 2 characters'),
    brand: zod_1.z.string().default('HP'),
    model: zod_1.z.string().default('HP LaserJet Pro MFP M126nw'),
    lanIp: zod_1.z.string().min(7, 'A valid IPv4 address is required'),
    ippPort: zod_1.z.number().int().min(1).max(65535).default(631),
    ippEndpoint: zod_1.z.string().default('/ipp/printer'),
    supportedFormats: zod_1.z.array(zod_1.z.string()).optional(),
    enabled: zod_1.z.boolean().default(true),
    isDefault: zod_1.z.boolean().default(false),
    locationNotes: zod_1.z.string().optional(),
});
async function getPrinters(req, res) {
    try {
        const printers = await Printer_js_1.Printer.find().sort({ isDefault: -1, createdAt: 1 });
        res.json({ success: true, printers });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function getPrinterById(req, res) {
    try {
        const printer = await Printer_js_1.Printer.findById(req.params.id);
        if (!printer) {
            res.status(404).json({ success: false, message: 'Printer not found.' });
            return;
        }
        res.json({ success: true, printer });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function createPrinter(req, res) {
    try {
        const parseResult = printerSchema.safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({ success: false, message: parseResult.error.errors[0].message });
            return;
        }
        const data = parseResult.data;
        // Check if this IP is known HP Wi-Fi Direct SoftAP
        if (data.lanIp.startsWith('192.168.223.')) {
            // Allowed but note warning in logger
            await logger_service_js_1.loggerService.warn('PRINTER_CONFIG_WARNING', `Printer registered with 192.168.223.x IP (${data.lanIp}). This is often HP Wi-Fi Direct rather than normal router LAN IP.`, { lanIp: data.lanIp });
        }
        if (data.isDefault) {
            await Printer_js_1.Printer.updateMany({}, { isDefault: false });
        }
        const printer = await Printer_js_1.Printer.create(data);
        await logger_service_js_1.loggerService.info('PRINTER_CREATED', `Printer added: ${printer.name} (${printer.lanIp})`, { printerId: printer._id });
        res.status(201).json({ success: true, printer });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function updatePrinter(req, res) {
    try {
        const parseResult = printerSchema.partial().safeParse(req.body);
        if (!parseResult.success) {
            res.status(400).json({ success: false, message: parseResult.error.errors[0].message });
            return;
        }
        const data = parseResult.data;
        if (data.isDefault) {
            await Printer_js_1.Printer.updateMany({ _id: { $ne: req.params.id } }, { isDefault: false });
        }
        const printer = await Printer_js_1.Printer.findByIdAndUpdate(req.params.id, data, { new: true });
        if (!printer) {
            res.status(404).json({ success: false, message: 'Printer not found.' });
            return;
        }
        await logger_service_js_1.loggerService.info('PRINTER_UPDATED', `Printer updated: ${printer.name} (${printer.lanIp})`, { printerId: printer._id });
        res.json({ success: true, printer });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function deletePrinter(req, res) {
    try {
        const printer = await Printer_js_1.Printer.findByIdAndDelete(req.params.id);
        if (!printer) {
            res.status(404).json({ success: false, message: 'Printer not found.' });
            return;
        }
        await logger_service_js_1.loggerService.info('PRINTER_DELETED', `Printer removed: ${printer.name}`);
        res.json({ success: true, message: 'Printer deleted successfully.' });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function testConnection(req, res) {
    try {
        const printer = await Printer_js_1.Printer.findById(req.params.id);
        if (!printer) {
            res.status(404).json({ success: false, message: 'Printer not found.' });
            return;
        }
        // IPP query
        const result = await ipp_service_js_1.ippService.getPrinterAttributes(printer.lanIp, printer.ippPort, printer.ippEndpoint, 5000);
        if (result.reachable) {
            printer.connectionStatus = result.state === 'STOPPED' ? 'ERROR' : result.state === 'PROCESSING' ? 'BUSY' : 'ONLINE';
            if (result.paperStatus)
                printer.paperStatus = result.paperStatus;
            if (result.tonerStatus)
                printer.tonerStatus = result.tonerStatus;
            if (result.stateReasons)
                printer.stateReasons = result.stateReasons;
            if (result.supportedFormats && result.supportedFormats.length > 0) {
                printer.supportedFormats = result.supportedFormats;
            }
            printer.lastSeenAt = new Date();
            await printer.save();
            res.json({
                success: true,
                reachable: true,
                state: result.state,
                paperStatus: result.paperStatus,
                tonerStatus: result.tonerStatus,
                supportedFormats: result.supportedFormats,
                stateReasons: result.stateReasons,
                rawAttributes: result.rawAttributes,
            });
        }
        else {
            printer.connectionStatus = 'UNREACHABLE';
            await printer.save();
            res.json({
                success: false,
                reachable: false,
                error: result.error || 'Printer unreachable over IPP',
                diagnostic: {
                    lanIp: printer.lanIp,
                    isDirectWifiSubnet: printer.lanIp.startsWith('192.168.223.'),
                    hint: printer.lanIp.startsWith('192.168.223.')
                        ? 'The configured IP appears to be the HP Wi-Fi Direct subnet (192.168.223.x). Ensure the printer is connected to your router Wi-Fi and use its router-assigned LAN IP (e.g. 192.168.1.x).'
                        : 'Check if Cloud Worker VPN is connected and can route to this LAN IP.',
                },
            });
        }
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function detectCapabilities(req, res) {
    return testConnection(req, res);
}
