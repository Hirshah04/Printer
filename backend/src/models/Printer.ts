import mongoose, { Schema } from 'mongoose';

export type PrinterConnectionStatus = 'ONLINE' | 'OFFLINE' | 'UNREACHABLE' | 'BUSY' | 'ERROR';
export type PrinterResourceStatus = 'OK' | 'LOW' | 'EMPTY' | 'OUT' | 'UNKNOWN';

export interface IPrinter {
  _id: mongoose.Types.ObjectId;
  name: string;
  brand: string;
  model: string;
  lanIp: string;
  ippPort: number;
  ippEndpoint: string;
  supportedFormats: string[];
  connectionStatus: PrinterConnectionStatus;
  paperStatus: PrinterResourceStatus;
  tonerStatus: PrinterResourceStatus;
  enabled: boolean;
  isDefault: boolean;
  stateReasons: string[];
  lastSeenAt?: Date;
  locationNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const printerSchema = new Schema<IPrinter>(
  {
    name: { type: String, required: true, trim: true },
    brand: { type: String, default: 'HP' },
    model: { type: String, default: 'HP LaserJet Pro MFP M126nw' },
    lanIp: { type: String, required: true, trim: true },
    ippPort: { type: Number, default: 631 },
    ippEndpoint: { type: String, default: '/ipp/printer' },
    supportedFormats: {
      type: [String],
      default: ['application/PCLm', 'application/octet-stream', 'image/jpeg', 'image/urf'],
    },
    connectionStatus: {
      type: String,
      enum: ['ONLINE', 'OFFLINE', 'UNREACHABLE', 'BUSY', 'ERROR'],
      default: 'OFFLINE',
    },
    paperStatus: {
      type: String,
      enum: ['OK', 'LOW', 'EMPTY', 'OUT', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    tonerStatus: {
      type: String,
      enum: ['OK', 'LOW', 'EMPTY', 'OUT', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    enabled: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    stateReasons: { type: [String], default: [] },
    lastSeenAt: { type: Date },
    locationNotes: { type: String, default: 'Home / Office Wi-Fi Network' },
  },
  { timestamps: true }
);

export const Printer = mongoose.model<IPrinter>('Printer', printerSchema);
