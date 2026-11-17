import { Router } from 'express';
import {
  createJob,
  getJobs,
  getJobById,
  retryJob,
  cancelJob,
  downloadDocument,
} from '../controllers/job.controller.js';
import { pdfUpload } from '../middleware/upload.middleware.js';

const router = Router();

router.post('/', pdfUpload.single('file'), createJob);
router.get('/', getJobs);
router.get('/:id', getJobById);
router.post('/:id/retry', retryJob);
router.post('/:id/cancel', cancelJob);
router.get('/download/:storageKey', downloadDocument);

export default router;
