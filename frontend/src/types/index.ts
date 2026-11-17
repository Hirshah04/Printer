export type PrinterOperationalStatus =
  | 'ONLINE'
  | 'BUSY'
  | 'PRINTING'
  | 'IDLE'
  | 'PAPER_OUT'
  | 'TONER_LOW'
  | 'ERROR'
  | 'OFFLINE'
  | 'UNKNOWN';

export interface Printer {
  name: string;
  brand: string;
  model: string;
  lanIp: string;
  ippPort: number;
  ippEndpoint: string;
  supportedFormats: string[];
  currentStatus: PrinterOperationalStatus;
  connectionStatus: 'ONLINE' | 'OFFLINE' | 'UNREACHABLE' | 'BUSY' | 'ERROR';
  paperStatus: 'OK' | 'LOW' | 'EMPTY' | 'OUT' | 'UNKNOWN';
  tonerStatus: 'OK' | 'LOW' | 'EMPTY' | 'OUT' | 'UNKNOWN';
  stateReasons: string[];
  queuedJobCount?: number;
  lastAcknowledgementAt?: string;
  lastSuccessfulAcknowledgementAt?: string;
  nextCheckAt?: string;
  consecutiveFailureCount?: number;
  lastError?: string;
  monitoringEnabled?: boolean;
  lastSeenAt?: string;
}

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

export interface StatusHistoryItem {
  status: PrintJobStatus;
  timestamp: string;
  message?: string;
}

export interface PrintJob {
  _id: string;
  documentName: string;
  storageKey: string;
  storageUrl?: string;
  fileSizeBytes: number;
  pageCount: number;
  copies: number;
  paperSize: 'A4' | 'Letter';
  orientation: 'PORTRAIT' | 'LANDSCAPE' | 'AUTO';
  status: PrintJobStatus;
  statusHistory: StatusHistoryItem[];
  printerJobId?: string;
  printerIPPJobId?: string | number;
  printerJobState?: string;
  lastAcknowledgementAt?: string;
  message?: string;
  printerError?: string;
  printerStatusMessage?: string;
  errorMessage?: string;
  submittedAt?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  completionVerified?: boolean;
  sheetsPrinted?: number;
  retryCount: number;
  maxRetries: number;
  verificationDetails?: {
    verifiedAt?: string;
    evidence?: string;
    finalPrinterState?: string;
    sheetsPrinted?: number;
  };
  createdAt: string;
  updatedAt: string;
}
