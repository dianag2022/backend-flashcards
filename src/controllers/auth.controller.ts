import { Request, Response } from 'express';
import { auth } from '../config/firebase';
import { AuthCredentialsBody, AuthTokenResponse } from '../types/auth.types';

const FIREBASE_SIGN_IN_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
const FIREBASE_SIGN_UP_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const FIREBASE_TOKEN_URL = 'https://securetoken.googleapis.com/v1/token';

interface FirebaseAuthSuccess {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
  email: string;
}

interface FirebaseTokenRefreshSuccess {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id: string;
}

function getFirebaseWebApiKey(): string {
  const apiKey = process.env.FIREBASE_WEB_API_KEY?.trim();

  if (!apiKey) {
    throw new Error('Missing required environment variable: FIREBASE_WEB_API_KEY');
  }

  return apiKey;
}

function parseCredentialsBody(body: unknown): AuthCredentialsBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { email, password } = body as Record<string, unknown>;

  if (typeof email !== 'string' || !email.trim()) {
    return null;
  }

  if (typeof password !== 'string' || !password) {
    return null;
  }

  if (password.length < 6) {
    return null;
  }

  return {
    email: email.trim(),
    password,
  };
}

function mapFirebaseAuthError(message: string): { status: number; error: string; message: string } {
  const normalized = message.toUpperCase();

  if (normalized.includes('EMAIL_EXISTS')) {
    return { status: 409, error: 'Conflict', message: 'An account with this email already exists' };
  }

  if (normalized.includes('WEAK_PASSWORD')) {
    return { status: 400, error: 'Bad Request', message: 'Password must be at least 6 characters' };
  }

  if (
    normalized.includes('INVALID_LOGIN_CREDENTIALS') ||
    normalized.includes('EMAIL_NOT_FOUND') ||
    normalized.includes('INVALID_PASSWORD') ||
    normalized.includes('INVALID_EMAIL')
  ) {
    return { status: 401, error: 'Unauthorized', message: 'Invalid email or password' };
  }

  if (normalized.includes('USER_DISABLED')) {
    return { status: 403, error: 'Forbidden', message: 'This account has been disabled' };
  }

  if (normalized.includes('TOO_MANY_ATTEMPTS')) {
    return { status: 429, error: 'Too Many Requests', message: 'Too many failed attempts. Try again later' };
  }

  return { status: 400, error: 'Bad Request', message: 'Authentication failed' };
}

async function refreshIdToken(
  refreshToken: string,
  apiKey: string
): Promise<FirebaseTokenRefreshSuccess> {
  const response = await fetch(`${FIREBASE_TOKEN_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = (await response.json()) as FirebaseTokenRefreshSuccess & {
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(data.error?.message ?? 'Failed to refresh ID token');
  }

  return data;
}

async function buildAuthResponse(
  data: FirebaseAuthSuccess,
  apiKey: string,
  refreshAfterClaims = false
): Promise<AuthTokenResponse> {
  let idToken = data.idToken;
  let refreshToken = data.refreshToken;
  let expiresIn = data.expiresIn;

  if (refreshAfterClaims) {
    const refreshed = await refreshIdToken(refreshToken, apiKey);
    idToken = refreshed.id_token;
    refreshToken = refreshed.refresh_token;
    expiresIn = refreshed.expires_in;
  }

  const decoded = await auth.verifyIdToken(idToken);

  return {
    uid: data.localId,
    email: data.email,
    idToken,
    refreshToken,
    expiresIn,
    role: decoded.role as string | undefined,
  };
}

async function callFirebaseAuth(
  url: string,
  apiKey: string,
  payload: AuthCredentialsBody
): Promise<{ ok: true; data: FirebaseAuthSuccess } | { ok: false; mapped: ReturnType<typeof mapFirebaseAuthError> }> {
  const response = await fetch(`${url}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: payload.email,
      password: payload.password,
      returnSecureToken: true,
    }),
  });

  const data = (await response.json()) as FirebaseAuthSuccess & {
    error?: { message?: string };
  };

  if (!response.ok) {
    const firebaseMessage = data.error?.message ?? 'Authentication failed';
    return { ok: false, mapped: mapFirebaseAuthError(firebaseMessage) };
  }

  return { ok: true, data };
}

export async function signUp(req: Request, res: Response): Promise<void> {
  const payload = parseCredentialsBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'email and password (min. 6 characters) are required',
    });
    return;
  }

  let apiKey: string;

  try {
    apiKey = getFirebaseWebApiKey();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Internal Server Error', message });
    return;
  }

  try {
    const result = await callFirebaseAuth(FIREBASE_SIGN_UP_URL, apiKey, payload);

    if (!result.ok) {
      res.status(result.mapped.status).json({
        error: result.mapped.error,
        message: result.mapped.message,
      });
      return;
    }

    await auth.setCustomUserClaims(result.data.localId, { role: 'end-user' });

    const authResponse = await buildAuthResponse(result.data, apiKey, true);

    res.status(201).json(authResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Sign up failed: ${message}`,
    });
  }
}

export async function signIn(req: Request, res: Response): Promise<void> {
  const payload = parseCredentialsBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'email and password (min. 6 characters) are required',
    });
    return;
  }

  let apiKey: string;

  try {
    apiKey = getFirebaseWebApiKey();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'Internal Server Error', message });
    return;
  }

  try {
    const result = await callFirebaseAuth(FIREBASE_SIGN_IN_URL, apiKey, payload);

    if (!result.ok) {
      res.status(result.mapped.status).json({
        error: result.mapped.error,
        message: result.mapped.message,
      });
      return;
    }

    const authResponse = await buildAuthResponse(result.data, apiKey);

    res.status(200).json(authResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Sign in failed: ${message}`,
    });
  }
}

export async function signOut(req: Request, res: Response): Promise<void> {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
    return;
  }

  const idToken = authorization.slice('Bearer '.length).trim();

  if (!idToken) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
    return;
  }

  try {
    const decoded = await auth.verifyIdToken(idToken);
    await auth.revokeRefreshTokens(decoded.uid);

    res.status(200).json({
      message: 'Signed out successfully. Refresh tokens revoked; discard stored credentials on the client.',
    });
  } catch {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired Firebase ID token',
    });
  }
}
