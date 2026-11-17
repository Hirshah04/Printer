import dotenv from 'dotenv';
import path from 'path';

// Load .env from backend directory
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/remote_printer_hub',
  jwtSecret: process.env.JWT_SECRET || 'dev-super-secret-key-change-in-production-1234567890',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  workerApiKey: process.env.WORKER_API_KEY || 'printer-worker-auth-secret-token-xyz',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  
  // Storage config (Local / S3 / R2)
  storage: {
    type: (process.env.STORAGE_TYPE || 'local') as 'local' | 's3' | 'r2',
    localUploadDir: path.resolve(process.env.LOCAL_UPLOAD_DIR || 'uploads'),
    s3: {
      endpoint: process.env.AWS_ENDPOINT || undefined, // e.g. https://<account_id>.r2.cloudflarestorage.com
      region: process.env.AWS_REGION || 'auto',
      bucket: process.env.AWS_S3_BUCKET || 'remote-printer-storage',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      publicUrlBase: process.env.STORAGE_PUBLIC_URL_BASE || '',
    },
  },

  // Queue config (Redis / BullMQ with fallback)
  redisUrl: process.env.REDIS_URL || '',
  
  // File restrictions
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '25', 10),
};
