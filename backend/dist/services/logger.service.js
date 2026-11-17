"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loggerService = exports.LoggerService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const SystemLog_js_1 = require("../models/SystemLog.js");
class LoggerService {
    async log(eventType, description, level = 'info', metadata, relatedJobId, relatedPrinterId) {
        const timestamp = new Date();
        const formatted = `[${timestamp.toISOString()}] [${level.toUpperCase()}] [${eventType}] ${description}`;
        if (level === 'error') {
            console.error(formatted, metadata || '');
        }
        else if (level === 'warn') {
            console.warn(formatted, metadata || '');
        }
        else {
            console.log(formatted, metadata || '');
        }
        try {
            if (mongoose_1.default.connection.readyState === 1) {
                await SystemLog_js_1.SystemLog.create({
                    eventType,
                    level,
                    description,
                    metadata,
                    relatedJobId: relatedJobId ? new mongoose_1.default.Types.ObjectId(relatedJobId) : undefined,
                    relatedPrinterId: relatedPrinterId ? new mongoose_1.default.Types.ObjectId(relatedPrinterId) : undefined,
                    timestamp,
                });
            }
        }
        catch (err) {
            // Don't crash logging if DB fails
            console.error('[LoggerService] Failed to persist system log to DB:', err.message);
        }
    }
    async info(eventType, description, metadata, relatedJobId, relatedPrinterId) {
        return this.log(eventType, description, 'info', metadata, relatedJobId, relatedPrinterId);
    }
    async warn(eventType, description, metadata, relatedJobId, relatedPrinterId) {
        return this.log(eventType, description, 'warn', metadata, relatedJobId, relatedPrinterId);
    }
    async error(eventType, description, metadata, relatedJobId, relatedPrinterId) {
        return this.log(eventType, description, 'error', metadata, relatedJobId, relatedPrinterId);
    }
}
exports.LoggerService = LoggerService;
exports.loggerService = new LoggerService();
