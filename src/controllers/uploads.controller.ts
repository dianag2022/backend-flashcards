import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { storage } from '../config/firebase';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function uploadAdminFile(req: Request, res: Response): Promise<void> {
  const file = req.file;

  if (!file) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'multipart field "file" is required',
    });
    return;
  }

  try {
    const bucket = storage.bucket();
    const extension = EXTENSION_BY_MIME[file.mimetype] ?? 'bin';
    const objectPath = `uploads/${Date.now()}-${randomUUID()}.${extension}`;
    const token = randomUUID();
    const storageFile = bucket.file(objectPath);

    await storageFile.save(file.buffer, {
      resumable: false,
      metadata: {
        contentType: file.mimetype,
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;

    res.status(201).json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to upload file: ${message}`,
    });
  }
}