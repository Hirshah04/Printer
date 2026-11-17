import mongoose, { Document, Schema } from 'mongoose';

export type LogLevel = 'info' | 'warn' | 'error';

export interface ISystemLog extends Document {
  eventType: string;
  level: LogLevel;
  description: string;
  metadata?: Record<string, any>;
  relatedJobId?: mongoose.Types.ObjectId;
  relatedPrinterId?: mongoose.Types.ObjectId;
  timestamp: Date;
}

const systemLogSchema = new Schema<ISystemLog>(
  {
    eventType: { type: String, required: true, index: true },
    level: { type: String, enum: ['info', 'warn', 'error'], default: 'info', index: true },
    description: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    relatedJobId: { type: Schema.Types.ObjectId, ref: 'PrintJob', index: true },
    relatedPrinterId: { type: Schema.Types.ObjectId, ref: 'Printer', index: true },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false }
);

export const SystemLog = mongoose.model<ISystemLog>('SystemLog', systemLogSchema);
