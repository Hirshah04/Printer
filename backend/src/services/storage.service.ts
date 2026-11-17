import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/env.js';

let s3Client: S3Client | null = null;

if ((config.storage.type === 's3' || config.storage.type === 'r2') && config.storage.s3.accessKeyId) {
  s3Client = new S3Client({
    region: config.storage.s3.region,
    endpoint: config.storage.s3.endpoint || undefined,
    credentials: {
      accessKeyId: config.storage.s3.accessKeyId,
      secretAccessKey: config.storage.s3.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

export class StorageService {
  constructor() {
    // Ensure local upload directory exists if local storage is used
    if (config.storage.type === 'local' || !s3Client) {
      if (!fs.existsSync(config.storage.localUploadDir)) {
        fs.mkdirSync(config.storage.localUploadDir, { recursive: true });
      }
    }
  }

  async saveFile(fileName: string, buffer: Buffer, mimeType: string): Promise<{ storageKey: string; downloadUrl: string }> {
    const uniqueKey = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

    if (s3Client && (config.storage.type === 's3' || config.storage.type === 'r2')) {
      const command = new PutObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: uniqueKey,
        Body: buffer,
        ContentType: mimeType,
      });

      await s3Client.send(command);

      // Generate signed URL valid for 24 hours
      const getCommand = new GetObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: uniqueKey,
      });
      const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 86400 });

      return {
        storageKey: uniqueKey,
        downloadUrl: signedUrl,
      };
    } else {
      // Local fallback
      const filePath = path.join(config.storage.localUploadDir, uniqueKey);
      await fs.promises.writeFile(filePath, buffer);
      
      const downloadUrl = `/api/jobs/download/${uniqueKey}`;
      return {
        storageKey: uniqueKey,
        downloadUrl,
      };
    }
  }

  async getFileStream(storageKey: string): Promise<{ stream: NodeJS.ReadableStream; contentLength?: number; contentType?: string }> {
    if (s3Client && (config.storage.type === 's3' || config.storage.type === 'r2')) {
      const command = new GetObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: storageKey,
      });
      const response = await s3Client.send(command);
      return {
        stream: response.Body as NodeJS.ReadableStream,
        contentLength: response.ContentLength,
        contentType: response.ContentType,
      };
    } else {
      const filePath = path.join(config.storage.localUploadDir, storageKey);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${storageKey}`);
      }
      const stat = await fs.promises.stat(filePath);
      const stream = fs.createReadStream(filePath);
      return {
        stream,
        contentLength: stat.size,
        contentType: 'application/pdf',
      };
    }
  }

  async getFileBuffer(storageKey: string): Promise<Buffer> {
    if (s3Client && (config.storage.type === 's3' || config.storage.type === 'r2')) {
      const command = new GetObjectCommand({
        Bucket: config.storage.s3.bucket,
        Key: storageKey,
      });
      const response = await s3Client.send(command);
      const chunks: Uint8Array[] = [];
      const stream = response.Body as NodeJS.ReadableStream;
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }
      return Buffer.concat(chunks);
    } else {
      const filePath = path.join(config.storage.localUploadDir, storageKey);
      return fs.promises.readFile(filePath);
    }
  }

  async deleteFile(storageKey: string): Promise<void> {
    try {
      if (s3Client && (config.storage.type === 's3' || config.storage.type === 'r2')) {
        const command = new DeleteObjectCommand({
          Bucket: config.storage.s3.bucket,
          Key: storageKey,
        });
        await s3Client.send(command);
      } else {
        const filePath = path.join(config.storage.localUploadDir, storageKey);
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
        }
      }
    } catch (err: any) {
      console.warn(`[StorageService] Failed to delete file ${storageKey}:`, err.message);
    }
  }
}

export const storageService = new StorageService();
