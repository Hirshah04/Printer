"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStats = getStats;
exports.getUsers = getUsers;
exports.updateUserRole = updateUserRole;
exports.getWorkers = getWorkers;
exports.getLogs = getLogs;
const User_js_1 = require("../models/User.js");
const Printer_js_1 = require("../models/Printer.js");
const PrintJob_js_1 = require("../models/PrintJob.js");
const Worker_js_1 = require("../models/Worker.js");
const SystemLog_js_1 = require("../models/SystemLog.js");
async function getStats(req, res) {
    try {
        const [totalUsers, totalPrinters, printersOnline, totalJobs, completedJobs, pendingJobs, failedJobs, activeWorkers,] = await Promise.all([
            User_js_1.User.countDocuments(),
            Printer_js_1.Printer.countDocuments(),
            Printer_js_1.Printer.countDocuments({ connectionStatus: { $in: ['ONLINE', 'BUSY'] } }),
            PrintJob_js_1.PrintJob.countDocuments(),
            PrintJob_js_1.PrintJob.countDocuments({ status: 'COMPLETED' }),
            PrintJob_js_1.PrintJob.countDocuments({ status: { $in: ['QUEUED', 'PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING'] } }),
            PrintJob_js_1.PrintJob.countDocuments({ status: 'FAILED' }),
            Worker_js_1.Worker.countDocuments({
                lastHeartbeat: { $gt: new Date(Date.now() - 3 * 60 * 1000) },
                status: { $in: ['ONLINE', 'BUSY'] },
            }),
        ]);
        res.json({
            success: true,
            stats: {
                totalUsers,
                totalPrinters,
                printersOnline,
                totalJobs,
                completedJobs,
                pendingJobs,
                failedJobs,
                activeWorkers,
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function getUsers(req, res) {
    try {
        const users = await User_js_1.User.find().select('-passwordHash').sort({ createdAt: -1 });
        res.json({ success: true, users });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function updateUserRole(req, res) {
    try {
        const { id } = req.params;
        const { role } = req.body;
        if (!['admin', 'user'].includes(role)) {
            res.status(400).json({ success: false, message: 'Invalid role. Must be admin or user.' });
            return;
        }
        const user = await User_js_1.User.findByIdAndUpdate(id, { role }, { new: true }).select('-passwordHash');
        if (!user) {
            res.status(404).json({ success: false, message: 'User not found.' });
            return;
        }
        res.json({ success: true, user });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function getWorkers(req, res) {
    try {
        const workers = await Worker_js_1.Worker.find().sort({ lastHeartbeat: -1 });
        res.json({ success: true, workers });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
async function getLogs(req, res) {
    try {
        const { level, eventType, limit = '50', page = '1' } = req.query;
        const limitNum = parseInt(limit, 10) || 50;
        const pageNum = parseInt(page, 10) || 1;
        const filter = {};
        if (level)
            filter.level = level;
        if (eventType)
            filter.eventType = eventType;
        const total = await SystemLog_js_1.SystemLog.countDocuments(filter);
        const logs = await SystemLog_js_1.SystemLog.find(filter)
            .sort({ timestamp: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum);
        res.json({
            success: true,
            logs,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
}
