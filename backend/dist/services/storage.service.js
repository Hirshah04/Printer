"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageService = exports.StorageService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const env_js_1 = require("../config/env.js");
let s3Client = null;
if ((env_js_1.config.storage.type === 's3' || env_js_1.config.storage.type === 'r2') && env_js_1.config.storage.s3.accessKeyId) {
    s3Client = new client_s3_1.S3Client({
        region: env_js_1.config.storage.s3.region,
        endpoint: env_js_1.config.storage.s3.endpoint || undefined,
        credentials: {
            accessKeyId: env_js_1.config.storage.s3.accessKeyId,
            secretAccessKey: env_js_1.config.storage.s3.secretAccessKey,
        },
        forcePathStyle: true,
    });
}
class StorageService {
    constructor() {
        // Ensure local upload directory exists if local storage is used
        if (env_js_1.config.storage.type === 'local' || !s3Client) {
            if (!fs_1.default.existsSync(env_js_1.config.storage.localUploadDir)) {
                fs_1.default.mkdirSync(env_js_1.config.storage.localUploadDir, { recursive: true });
            }
        }
    }
    async saveFile(fileName, buffer, mimeType) {
        const uniqueKey = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        if (s3Client && (env_js_1.config.storage.type === 's3' || env_js_1.config.storage.type === 'r2')) {
            const command = new client_s3_1.PutObjectCommand({
                Bucket: env_js_1.config.storage.s3.bucket,
                Key: uniqueKey,
                Body: buffer,
                ContentType: mimeType,
            });
            await s3Client.send(command);
            // Generate signed URL valid for 24 hours
            const getCommand = new client_s3_1.GetObjectCommand({
                Bucket: env_js_1.config.storage.s3.bucket,
                Key: uniqueKey,
            });
            const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, getCommand, { expiresIn: 86400 });
            return {
                storageKey: uniqueKey,
                downloadUrl: signedUrl,
            };
        }
        else {
            // Local fallback
            const filePath = path_1.default.join(env_js_1.config.storage.localUploadDir, uniqueKey);
            await fs_1.default.promises.writeFile(filePath, buffer);
            const downloadUrl = `/api/jobs/download/${uniqueKey}`;
            return {
                storageKey: uniqueKey,
                downloadUrl,
            };
        }
    }
    async getFileStream(storageKey) {
        if (s3Client && (env_js_1.config.storage.type === 's3' || env_js_1.config.storage.type === 'r2')) {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: env_js_1.config.storage.s3.bucket,
                Key: storageKey,
            });
            const response = await s3Client.send(command);
            return {
                stream: response.Body,
                contentLength: response.ContentLength,
                contentType: response.ContentType,
            };
        }
        else {
            const filePath = path_1.default.join(env_js_1.config.storage.localUploadDir, storageKey);
            if (!fs_1.default.existsSync(filePath)) {
                throw new Error(`File not found: ${storageKey}`);
            }
            const stat = await fs_1.default.promises.stat(filePath);
            const stream = fs_1.default.createReadStream(filePath);
            return {
                stream,
                contentLength: stat.size,
                contentType: 'application/pdf',
            };
        }
    }
    async getFileBuffer(storageKey) {
        if (s3Client && (env_js_1.config.storage.type === 's3' || env_js_1.config.storage.type === 'r2')) {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: env_js_1.config.storage.s3.bucket,
                Key: storageKey,
            });
            const response = await s3Client.send(command);
            const chunks = [];
            const stream = response.Body;
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        }
        else {
            const filePath = path_1.default.join(env_js_1.config.storage.localUploadDir, storageKey);
            return fs_1.default.promises.readFile(filePath);
        }
    }
    async deleteFile(storageKey) {
        try {
            if (s3Client && (env_js_1.config.storage.type === 's3' || env_js_1.config.storage.type === 'r2')) {
                const command = new client_s3_1.DeleteObjectCommand({
                    Bucket: env_js_1.config.storage.s3.bucket,
                    Key: storageKey,
                });
                await s3Client.send(command);
            }
            else {
                const filePath = path_1.default.join(env_js_1.config.storage.localUploadDir, storageKey);
                if (fs_1.default.existsSync(filePath)) {
                    await fs_1.default.promises.unlink(filePath);
                }
            }
        }
        catch (err) {
            console.warn(`[StorageService] Failed to delete file ${storageKey}:`, err.message);
        }
    }
}
exports.StorageService = StorageService;
exports.storageService = new StorageService();
