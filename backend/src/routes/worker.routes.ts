import { Router } from 'express';
import {
  heartbeat,
  getNextJob,
  updateJobStatus,
  updatePrinterStatus,
} from '../controllers/worker.controller.js';
import { authenticateWorker } from '../middleware/auth.middleware.js';

const router = Router();

// All worker routes require Worker API Key
router.use(authenticateWorker);

router.post('/heartbeat', heartbeat);
router.get('/jobs/next', getNextJob);
router.patch('/jobs/:id/status', updateJobStatus);
router.post('/printers/:id/status', updatePrinterStatus);

export default router;
