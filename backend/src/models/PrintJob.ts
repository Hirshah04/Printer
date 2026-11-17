import mongoose, { Document, Schema } from 'mongoose';

export type PrintJobStatus =
  | 'UPLOADING'
  | 'UPLOADED'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SENT_TO_PRINTER'
  | 'PRINTER_ACCEPTED'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface IStatusHistoryItem {
  status: PrintJobStatus;
  timestamp: Date;
  message?: string;
}

export interface IPrintJob extends Document {
  userId: mongoose.Types.ObjectId;
  printerId: mongoose.Types.ObjectId;
  documentName: string;
  storageKey: string;
  storageUrl?: string;
  fileSizeBytes: number;
  pageCount: number;
  copies: number;
  paperSize: 'A4' | 'Letter';
  orientation: 'PORTRAIT' | 'LANDSCAPE' | 'AUTO';
  status: PrintJobStatus;
  statusHistory: IStatusHistoryItem[];
  printerJobId?: string;
  printerStatusMessage?: string;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  verificationDetails?: {
    verifiedAt?: Date;
    evidence?: string;
    finalPrinterState?: string;
    sheetsPrinted?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const printJobSchema = new Schema<IPrintJob>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    printerId: { type: Schema.Types.ObjectId, ref: 'Printer', required: true, index: true },
    documentName: { type: String, required: true },
    storageKey: { type: String, required: true },
    storageUrl: { type: String },
    fileSizeBytes: { type: Number, required: true },
    pageCount: { type: Number, default: 1 },
    copies: { type: Number, default: 1, min: 1, max: 100 },
    paperSize: { type: String, enum: ['A4', 'Letter'], default: 'A4' },
    orientation: { type: String, enum: ['PORTRAIT', 'LANDSCAPE', 'AUTO'], default: 'PORTRAIT' },
    status: {
      type: String,
      enum: [
        'UPLOADING',
        'UPLOADED',
        'QUEUED',
        'PROCESSING',
        'SENT_TO_PRINTER',
        'PRINTER_ACCEPTED',
        'PRINTING',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
      ],
      default: 'QUEUED',
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        message: { type: String },
      },
    ],
    printerJobId: { type: String },
    printerStatusMessage: { type: String },
    errorMessage: { type: String },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    verificationDetails: {
      verifiedAt: { type: Date },
      evidence: { type: String },
      finalPrinterState: { type: String },
      sheetsPrinted: { type: Number },
    },
  },
  { timestamps: true }
);

export const PrintJob = mongoose.model<IPrintJob>('PrintJob', printJobSchema);
