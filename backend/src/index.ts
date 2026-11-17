import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env.js';
import { connectDatabase } from './config/database.js';
import { errorHandler } from './middleware/error.middleware.js';
import { apiLimiter } from './middleware/rateLimit.middleware.js';
import { Printer } from './models/Printer.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import printerRoutes from './routes/printer.routes.js';
import jobRoutes from './routes/job.routes.js';
import workerRoutes from './routes/worker.routes.js';
import networkRoutes from './routes/network.routes.js';
import adminRoutes from './routes/admin.routes.js';

const app = express();

// Security & Parsing Middlewares
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiting to all standard APIs
app.use('/api', apiLimiter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.nodeEnv,
    storageType: config.storage.type,
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/printers', printerRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/worker', workerRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/admin', adminRoutes);

// Error Handler Middleware
app.use(errorHandler);

// Seed initial default HP printer if database is empty
async function seedDefaultPrinter(): Promise<void> {
  try {
    const count = await Printer.countDocuments();
    if (count === 0) {
      await Printer.create({
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
  } catch (err: any) {
    console.warn('[Seed] Could not seed default printer:', err.message);
  }
}

// Start Server
async function startServer(): Promise<void> {
  await connectDatabase();
  await seedDefaultPrinter();

  app.listen(config.port, () => {
    console.log(`====================================================`);
    console.log(`🚀 Cloud Backend API listening on port ${config.port}`);
    console.log(`📡 Environment: ${config.nodeEnv}`);
    console.log(`💾 Storage Provider: ${config.storage.type}`);
    console.log(`🔐 Worker API Key protected on /api/worker/*`);
    console.log(`====================================================`);
  });
}

startServer();

export default app;
