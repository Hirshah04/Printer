import { Request, Response } from 'express';
import net from 'net';
import { dbService } from '../services/db.service.js';
import { ippService } from '../services/ipp.service.js';
import { sseService } from '../services/sse.service.js';
import { printerMonitorService } from '../services/printer-monitor.service.js';

export async function getPrinter(req: Request, res: Response): Promise<void> {
  try {
    const printer = dbService.getPrinter();
    res.json({ success: true, printer });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Server-Sent Events stream providing real-time telemetry updates
 */
export async function streamRealtimeTelemetry(req: Request, res: Response): Promise<void> {
  try {
    await sseService.registerClient(res);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
}

/**
 * Force an immediate telemetry cycle
 */
export async function checkPrinterNow(req: Request, res: Response): Promise<void> {
  try {
    const printer = await printerMonitorService.checkNow();
    res.json({ success: true, printer });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function testConnection(req: Request, res: Response): Promise<void> {
  try {
    const printer = dbService.getPrinter();
    const result = await ippService.getPrinterAttributes(printer.lanIp, printer.ippPort, printer.ippEndpoint, 5000);

    if (result.reachable) {
      const state = result.state === 'STOPPED' ? 'ERROR' : result.state === 'PROCESSING' ? 'BUSY' : 'ONLINE';
      const updated = dbService.updatePrinterState({
        connectionStatus: state,
        currentStatus: result.state === 'PROCESSING' ? 'PRINTING' : 'ONLINE',
        paperStatus: result.paperStatus || 'OK',
        tonerStatus: result.tonerStatus || 'OK',
        stateReasons: result.stateReasons || [],
        supportedFormats: result.supportedFormats || printer.supportedFormats,
        consecutiveFailureCount: 0,
        lastSuccessfulAcknowledgementAt: new Date().toISOString(),
      });
      sseService.broadcastPrinterUpdate(updated);

      res.json({
        success: true,
        reachable: true,
        state: result.state,
        paperStatus: result.paperStatus,
        tonerStatus: result.tonerStatus,
        supportedFormats: result.supportedFormats,
        stateReasons: result.stateReasons,
        rawAttributes: result.rawAttributes,
      });
    } else {
      const updated = dbService.updatePrinterState({
        connectionStatus: 'UNREACHABLE',
        currentStatus: 'OFFLINE',
        lastError: result.error || 'Printer unreachable over IPP',
      });
      sseService.broadcastPrinterUpdate(updated);

      res.json({
        success: false,
        reachable: false,
        error: result.error || 'Printer unreachable over IPP',
        diagnostic: {
          lanIp: printer.lanIp,
          hint: `Ensure printer is powered on and reachable on router subnet at ${printer.lanIp}:631.`,
        },
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function testRawPort(req: Request, res: Response): Promise<void> {
  const printer = dbService.getPrinter();
  const host = printer.lanIp || '103.209.67.76';
  const port = 9100;
  const socket = new net.Socket();
  const t0 = Date.now();
  let done = false;

  socket.setTimeout(6000);
  socket.connect(port, host, () => {
    if (!done) {
      done = true;
      const elapsed = Date.now() - t0;
      socket.destroy();
      res.json({ success: true, reachable: true, host, port, elapsedMs: elapsed });
    }
  });

  socket.on('timeout', () => {
    if (!done) {
      done = true;
      socket.destroy();
      res.json({
        success: false,
        reachable: false,
        host,
        port,
        error: `Connection timed out after 6000ms. Port ${port} is NOT open/forwarded on the router at ${host}.`,
      });
    }
  });

  socket.on('error', (err) => {
    if (!done) {
      done = true;
      socket.destroy();
      res.json({ success: false, reachable: false, host, port, error: err.message });
    }
  });
}
