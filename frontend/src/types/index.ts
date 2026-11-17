export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  createdAt?: string;
}

export interface Printer {
  _id: string;
  name: string;
  brand: string;
  model: string;
  lanIp: string;
  ippPort: number;
  ippEndpoint: string;
  supportedFormats: string[];
  connectionStatus: 'ONLINE' | 'OFFLINE' | 'UNREACHABLE' | 'BUSY' | 'ERROR';
  paperStatus: 'OK' | 'LOW' | 'EMPTY' | 'OUT' | 'UNKNOWN';
  tonerStatus: 'OK' | 'LOW' | 'EMPTY' | 'OUT' | 'UNKNOWN';
  enabled: boolean;
  isDefault: boolean;
  stateReasons: string[];
  lastSeenAt?: string;
  locationNotes?: string;
  createdAt: string;
  updatedAt: string;
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
  userId: { _id: string; name: string; email: string } | string;
  printerId: Printer | string;
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
  printerStatusMessage?: string;
  errorMessage?: string;
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

export interface WorkerInfo {
  _id: string;
  workerId: string;
  name: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  vpnStatus: 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
  vpnIp?: string;
  gatewayIp?: string;
  version: string;
  lastHeartbeat: string;
  systemInfo?: {
    platform?: string;
    arch?: string;
    uptime?: number;
    freeMemoryMb?: number;
    wireguardInterface?: string;
  };
}

export interface SystemLogItem {
  _id: string;
  eventType: string;
  level: 'info' | 'warn' | 'error';
  description: string;
  metadata?: Record<string, any>;
  relatedJobId?: string;
  relatedPrinterId?: string;
  timestamp: string;
}

export interface DashboardStats {
  totalUsers: number;
  totalPrinters: number;
  printersOnline: number;
  totalJobs: number;
  completedJobs: number;
  pendingJobs: number;
  failedJobs: number;
  activeWorkers: number;
}
