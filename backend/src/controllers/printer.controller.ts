import { Request, Response } from 'express';
import { dbService } from '../services/db.service.js';
import { ippService } from '../services/ipp.service.js';
import { config } from '../config/env.js';

export async function getPrinter(req: Request, res: Response): Promise<void> {
  try {
    const printer = dbService.getPrinter();
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
      dbService.updatePrinterState({
        connectionStatus: state,
        paperStatus: result.paperStatus || 'OK',
        tonerStatus: result.tonerStatus || 'OK',
        stateReasons: result.stateReasons || [],
        supportedFormats: result.supportedFormats || printer.supportedFormats,
      });

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
      dbService.updatePrinterState({ connectionStatus: 'UNREACHABLE' });

      res.json({
        success: false,
        reachable: false,
        error: result.error || 'Printer unreachable over IPP',
        diagnostic: {
          lanIp: printer.lanIp,
          hint: `Ensure Cloud Print Worker VPN is connected and can reach router subnet IP ${printer.lanIp}.`,
        },
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
