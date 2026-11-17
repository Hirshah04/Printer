"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const env_js_1 = require("./config/env.js");
const database_js_1 = require("./config/database.js");
const error_middleware_js_1 = require("./middleware/error.middleware.js");
const rateLimit_middleware_js_1 = require("./middleware/rateLimit.middleware.js");
const Printer_js_1 = require("./models/Printer.js");
// Route imports
const auth_routes_js_1 = __importDefault(require("./routes/auth.routes.js"));
const printer_routes_js_1 = __importDefault(require("./routes/printer.routes.js"));
const job_routes_js_1 = __importDefault(require("./routes/job.routes.js"));
const worker_routes_js_1 = __importDefault(require("./routes/worker.routes.js"));
const network_routes_js_1 = __importDefault(require("./routes/network.routes.js"));
const admin_routes_js_1 = __importDefault(require("./routes/admin.routes.js"));
const app = (0, express_1.default)();
// Security & Parsing Middlewares
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: env_js_1.config.corsOrigin, credentials: true }));
app.use((0, morgan_1.default)(env_js_1.config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Apply rate limiting to all standard APIs
app.use('/api', rateLimit_middleware_js_1.apiLimiter);
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: env_js_1.config.nodeEnv,
        storageType: env_js_1.config.storage.type,
    });
});
// Mount Routes
app.use('/api/auth', auth_routes_js_1.default);
app.use('/api/printers', printer_routes_js_1.default);
app.use('/api/jobs', job_routes_js_1.default);
app.use('/api/worker', worker_routes_js_1.default);
app.use('/api/network', network_routes_js_1.default);
app.use('/api/admin', admin_routes_js_1.default);
// Error Handler Middleware
app.use(error_middleware_js_1.errorHandler);
// Seed initial default HP printer if database is empty
async function seedDefaultPrinter() {
    try {
        const count = await Printer_js_1.Printer.countDocuments();
        if (count === 0) {
            await Printer_js_1.Printer.create({
                name: 'Office HP LaserJet M126nw',
                brand: 'HP',
                model: 'HP LaserJet Pro MFP M126nw',
                lanIp: '192.168.1.150', // placeholder LAN IP (instructed user to update with verified router IP)
                ippPort: 631,
                ippEndpoint: '/ipp/printer',
                supportedFormats: ['application/PCLm', 'application/octet-stream', 'image/jpeg', 'image/urf'],
                connectionStatus: 'OFFLINE',
                paperStatus: 'UNKNOWN',
                tonerStatus: 'UNKNOWN',
                enabled: true,
                isDefault: true,
                locationNotes: 'Connected via Wi-Fi to Home/Office Router. Note: Verify LAN IP (do NOT use 192.168.223.1 Wi-Fi Direct).',
            });
            console.log('[Seed] Default HP LaserJet Pro MFP M126nw printer registered in database.');
        }
    }
    catch (err) {
        console.warn('[Seed] Could not seed default printer:', err.message);
    }
}
// Start Server
async function startServer() {
    await (0, database_js_1.connectDatabase)();
    await seedDefaultPrinter();
    app.listen(env_js_1.config.port, () => {
        console.log(`====================================================`);
        console.log(`🚀 Cloud Backend API listening on port ${env_js_1.config.port}`);
        console.log(`📡 Environment: ${env_js_1.config.nodeEnv}`);
        console.log(`💾 Storage Provider: ${env_js_1.config.storage.type}`);
        console.log(`🔐 Worker API Key protected on /api/worker/*`);
        console.log(`====================================================`);
    });
}
startServer();
exports.default = app;
