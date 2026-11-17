import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  workerApiKey: process.env.WORKER_API_KEY || 'printer-worker-auth-secret-token-xyz',
  
  // Single Target Printer
  printer: {
    ip: process.env.PRINTER_IP || '192.168.1.37',
    port: parseInt(process.env.PRINTER_PORT || '631', 10),
    rawPort: parseInt(process.env.PRINTER_RAW_PORT || '9100', 10),
    endpoint: process.env.PRINTER_ENDPOINT || '/ipp/printer',
    name: process.env.PRINTER_NAME || 'HP LaserJet Pro MFP M126nw',
    brand: 'HP',
    model: 'HP LaserJet Pro MFP M126nw',
    supportedFormats: ['application/PCLm', 'application/octet-stream', 'image/jpeg', 'image/urf'],
  },

  // Storage config (Local / S3 / R2)
  storage: {
    type: (process.env.STORAGE_TYPE || 'local') as 'local' | 's3' | 'r2',
    localUploadDir: path.resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads'),
    s3: {
      endpoint: process.env.AWS_ENDPOINT || undefined,
      region: process.env.AWS_REGION || 'auto',
      bucket: process.env.AWS_S3_BUCKET || 'remote-printer-storage',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      publicUrlBase: process.env.STORAGE_PUBLIC_URL_BASE || '',
    },
  },

  // Data persistence directory (no database needed)
  dataFile: path.resolve(process.env.DATA_FILE || 'data/jobs.json'),

  // File restrictions
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10),
};
