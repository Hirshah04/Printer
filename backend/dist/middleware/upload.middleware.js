"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pdfUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const env_js_1 = require("../config/env.js");
// Use memory storage so we can validate bytes & upload to S3/R2/local
const storage = multer_1.default.memoryStorage();
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
        cb(null, true);
    }
    else {
        cb(new Error('Only PDF documents (.pdf) are allowed.'));
    }
};
exports.pdfUpload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: env_js_1.config.maxFileSizeMb * 1024 * 1024,
    },
    fileFilter,
});
