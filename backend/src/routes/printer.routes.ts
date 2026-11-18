import { Router } from 'express';
import {
  getPrinter,
  testConnection,
  testRawPort,
  streamRealtimeTelemetry,
  checkPrinterNow,
} from '../controllers/printer.controller.js';

const router = Router();

router.get('/', getPrinter);
router.get('/stream', streamRealtimeTelemetry);
router.get('/test-raw-port', testRawPort);
router.post('/check-now', checkPrinterNow);
router.post('/test-connection', testConnection);

export default router;
