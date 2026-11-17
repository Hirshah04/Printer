"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    workerId: process.env.WORKER_ID || `worker-${process.platform}-${Math.random().toString(36).substring(2, 7)}`,
    workerName: process.env.WORKER_NAME || 'Cloud Print Worker #1',
    backendUrl: (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, ''),
    workerApiKey: process.env.WORKER_API_KEY || 'printer-worker-auth-secret-token-xyz',
    redisUrl: process.env.REDIS_URL || '',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '3000', 10),
    heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '15000', 10),
    printerMonitorIntervalMs: parseInt(process.env.PRINTER_MONITOR_INTERVAL_MS || '30000', 10),
    wireguardInterface: process.env.WIREGUARD_INTERFACE || 'wg0',
    gatewayIp: process.env.GATEWAY_IP || '10.14.0.1',
    defaultPrinterIp: process.env.DEFAULT_PRINTER_IP || '192.168.1.150',
    converterMode: (process.env.CONVERTER_MODE || 'auto'),
};
