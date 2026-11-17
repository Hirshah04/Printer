import { Router } from 'express';
import {
  getPrinter,
  testConnection,
  streamRealtimeTelemetry,
  checkPrinterNow,
} from '../controllers/printer.controller.js';

const router = Router();

router.get('/', getPrinter);
router.get('/stream', streamRealtimeTelemetry);
router.post('/check-now', checkPrinterNow);
router.post('/test-connection', testConnection);

export default router;
