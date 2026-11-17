import { Request, Response } from 'express';
import { User } from '../models/User.js';
import { Printer } from '../models/Printer.js';
import { PrintJob } from '../models/PrintJob.js';
import { Worker } from '../models/Worker.js';
import { SystemLog } from '../models/SystemLog.js';

export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const [
      totalUsers,
      totalPrinters,
      printersOnline,
      totalJobs,
      completedJobs,
      pendingJobs,
      failedJobs,
      activeWorkers,
    ] = await Promise.all([
      User.countDocuments(),
      Printer.countDocuments(),
      Printer.countDocuments({ connectionStatus: { $in: ['ONLINE', 'BUSY'] } }),
      PrintJob.countDocuments(),
      PrintJob.countDocuments({ status: 'COMPLETED' }),
      PrintJob.countDocuments({ status: { $in: ['QUEUED', 'PROCESSING', 'SENT_TO_PRINTER', 'PRINTER_ACCEPTED', 'PRINTING'] } }),
      PrintJob.countDocuments({ status: 'FAILED' }),
      Worker.countDocuments({
        lastHeartbeat: { $gt: new Date(Date.now() - 3 * 60 * 1000) },
        status: { $in: ['ONLINE', 'BUSY'] },
      }),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalPrinters,
        printersOnline,
        totalJobs,
        completedJobs,
        pendingJobs,
        failedJobs,
        activeWorkers,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getUsers(req: Request, res: Response): Promise<void> {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateUserRole(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'user'].includes(role)) {
      res.status(400).json({ success: false, message: 'Invalid role. Must be admin or user.' });
      return;
    }

    const user = await User.findByIdAndUpdate(id, { role }, { new: true }).select('-passwordHash');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found.' });
      return;
    }

    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getWorkers(req: Request, res: Response): Promise<void> {
  try {
    const workers = await Worker.find().sort({ lastHeartbeat: -1 });
    res.json({ success: true, workers });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getLogs(req: Request, res: Response): Promise<void> {
  try {
    const { level, eventType, limit = '50', page = '1' } = req.query;
    const limitNum = parseInt(limit as string, 10) || 50;
    const pageNum = parseInt(page as string, 10) || 1;

    const filter: Record<string, any> = {};
    if (level) filter.level = level;
    if (eventType) filter.eventType = eventType;

    const total = await SystemLog.countDocuments(filter);
    const logs = await SystemLog.find(filter)
      .sort({ timestamp: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
