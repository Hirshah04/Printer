import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';

// Route imports
import printerRoutes from './routes/printer.routes.js';
import jobRoutes from './routes/job.routes.js';
import workerRoutes from './routes/worker.routes.js';
import { printerMonitorService } from './services/printer-monitor.service.js';

const app = express();

// Security & Parsing Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Comprehensive CORS for any network (different Wi-Fi, cellular 4G/5G, Vercel frontend)
app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Worker-API-Key', 'X-Worker-ID', 'Accept', 'Origin'],
  })
);
app.options('*', cors());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiting
app.use('/api', apiLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    printerTarget: `${config.printer.ip}:${config.printer.port}${config.printer.endpoint}`,
    environment: config.nodeEnv,
    storageType: config.storage.type,
  });
});

// Mount active routes (no login or registration required)
app.use('/api/printer', printerRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/worker', workerRoutes);

// Error Handler Middleware
app.use(errorHandler);

// Start Server
app.listen(config.port, () => {
  console.log(`====================================================`);
  console.log(`🚀 Remote Printer API listening on port ${config.port}`);
  console.log(`🖨️  Target Printer: HP LaserJet M126nw @ ${config.printer.ip}`);
  console.log(`💾 Data Storage: File-backed (${config.dataFile}) - No external DB needed`);
  console.log(`📡 Real-Time Telemetry: 10s IPP Acknowledgement Polling Active`);
  console.log(`====================================================`);

  // Start continuous 10-second IPP monitoring loop
  printerMonitorService.start();
});

export default app;
