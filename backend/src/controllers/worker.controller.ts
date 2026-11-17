import { Request, Response } from 'express';
import { dbService, PrintJobStatus } from '../services/db.service.js';
import { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { sseService } from '../services/sse.service.js';

let latestWorkerInfo: any = null;

export function hasActiveWorker(): boolean {
  if (!latestWorkerInfo || !latestWorkerInfo.lastHeartbeat) return false;
  const timeSinceHeartbeat = Date.now() - new Date(latestWorkerInfo.lastHeartbeat).getTime();
  return timeSinceHeartbeat < 45000;
}

export function getActiveWorkerInfo() {
  return latestWorkerInfo;
}

export async function heartbeat(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { workerId, name, status, vpnStatus, vpnIp, gatewayIp, version, systemInfo } = req.body;
    latestWorkerInfo = {
      workerId: workerId || req.workerId || 'cloud-worker-1',
      name: name || 'Cloud Print Worker',
      status: status || 'ONLINE',
      vpnStatus: vpnStatus || 'UNKNOWN',
      vpnIp,
      gatewayIp,
      version: version || '1.0.0',
      lastHeartbeat: new Date().toISOString(),
      systemInfo,
    };

    res.json({ success: true, message: 'Heartbeat acknowledged', worker: latestWorkerInfo });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getNextJob(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const workerId = (req.workerId || req.query.workerId || 'cloud-worker') as string;
    const job = await dbService.claimNextQueuedJob(workerId);

    if (!job) {
      res.json({ success: true, job: null, message: 'No pending print jobs.' });
      return;
    }

    const printer = dbService.getPrinter();

    res.json({
      success: true,
      job,
      printer,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateJobStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const {
      status,
      message,
      printerJobId,
      printerStatusMessage,
      errorMessage,
      verificationDetails,
    } = req.body;

    const job = await dbService.updateJob(id, {
      status: status as PrintJobStatus,
      message,
      printerJobId,
      printerStatusMessage,
      errorMessage,
      verificationDetails,
    });

    if (!job) {
      res.status(404).json({ success: false, message: 'Print job not found.' });
      return;
    }

    console.log(`[WorkerController] Job ${id} updated to ${status} - ${message || ''}`);
    sseService.broadcastJobUpdate(job);

    res.json({ success: true, job });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updatePrinterStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { connectionStatus, paperStatus, tonerStatus, stateReasons, supportedFormats } = req.body;

    const printer = dbService.updatePrinterState({
      connectionStatus,
      paperStatus,
      tonerStatus,
      stateReasons,
      supportedFormats,
    });

    sseService.broadcastPrinterUpdate(printer);

    res.json({ success: true, printer });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
