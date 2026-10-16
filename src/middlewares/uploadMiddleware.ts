import { NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(new Error('file must be a jpg, png, or webp image'));
      return;
    }

    callback(null, true);
  },
});

export function uploadSingleImage(fieldName = 'file'): RequestHandler {
  const handler = upload.single(fieldName);

  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }

      const isSizeLimit =
        error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
      const message = isSizeLimit
        ? 'file must be 4 MB or smaller'
        : error instanceof Error
          ? error.message
          : 'Invalid upload';

      res.status(400).json({
        error: 'Bad Request',
        message,
      });
    });
  };
}