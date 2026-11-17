import multer from 'multer';
import { Request } from 'express';
import { config } from '../config/env.js';

// Use memory storage so we can validate bytes & upload to S3/R2/local
const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF documents (.pdf) are allowed.'));
  }
};

export const pdfUpload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSizeMb * 1024 * 1024,
  },
  fileFilter,
});
