import { Router } from 'express';
import {
  heartbeat,
  getNextJob,
  updateJobStatus,
  updatePrinterStatus,
} from '../controllers/worker.controller.js';
import { authenticateWorker } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authenticateWorker);

router.post('/heartbeat', heartbeat);
router.get('/jobs/next', getNextJob);
router.patch('/jobs/:id/status', updateJobStatus);
router.post('/printer/status', updatePrinterStatus);

export default router;
