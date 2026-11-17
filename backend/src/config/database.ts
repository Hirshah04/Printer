import mongoose from 'mongoose';
import { config } from './env.js';

export async function connectDatabase(): Promise<void> {
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });
    console.log(`[Database] Successfully connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`);
  } catch (err: any) {
    console.error('[Database] MongoDB connection failed:', err.message);
    if (config.nodeEnv === 'production') {
      process.exit(1);
    } else {
      console.warn('[Database] Running in development mode without active MongoDB. Some persistent operations will fail until MongoDB is connected.');
    }
  }
}

mongoose.connection.on('disconnected', () => {
  console.warn('[Database] MongoDB disconnected.');
});

mongoose.connection.on('reconnected', () => {
  console.log('[Database] MongoDB reconnected.');
});
