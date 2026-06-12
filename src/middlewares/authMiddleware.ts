import { NextFunction, Request, RequestHandler, Response } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { auth } from '../config/firebase';

export type UserRole = 'admin' | 'end-user';

export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken & { role?: UserRole };
}

function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();
  return token || null;
}

export function checkAuth(requiredRole?: UserRole): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
      });
      return;
    }

    let decodedToken: DecodedIdToken;

    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired Firebase ID token',
      });
      return;
    }

    const userRole = decodedToken.role as UserRole | undefined;

    if (requiredRole && userRole !== requiredRole) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Required role: ${requiredRole}`,
      });
      return;
    }

    (req as AuthenticatedRequest).user = {
      ...decodedToken,
      role: userRole,
    };

    next();
  };
}
