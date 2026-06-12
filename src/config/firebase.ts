import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { AppOptions, ServiceAccount, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const REQUIRED_SERVICE_ACCOUNT_FIELDS = [
  'type',
  'project_id',
  'private_key_id',
  'private_key',
  'client_email',
  'client_id',
] as const;

function resolveServiceAccountPath(): string {
  const credentialsPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!credentialsPath?.trim()) {
    throw new Error(
      'Missing required environment variable: FIREBASE_SERVICE_ACCOUNT_PATH'
    );
  }

  return path.isAbsolute(credentialsPath)
    ? credentialsPath
    : path.resolve(process.cwd(), credentialsPath);
}

function loadServiceAccount(filePath: string): ServiceAccount {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Firebase service account file not found at: ${filePath}`
    );
  }

  let rawContent: string;

  try {
    rawContent = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Failed to read Firebase service account file at ${filePath}: ${message}`
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(
      `Invalid JSON in Firebase service account file at ${filePath}: ${message}`
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(
      `Firebase service account file at ${filePath} must contain a JSON object`
    );
  }

  const account = parsed as Record<string, unknown>;
  const missingFields = REQUIRED_SERVICE_ACCOUNT_FIELDS.filter(
    (field) => !account[field]
  );

  if (missingFields.length > 0) {
    throw new Error(
      `Firebase service account file is missing required fields: ${missingFields.join(', ')}`
    );
  }

  return account as ServiceAccount;
}

function initializeFirebase(): void {
  if (getApps().length > 0) {
    return;
  }

  const serviceAccountPath = resolveServiceAccountPath();
  const serviceAccount = loadServiceAccount(serviceAccountPath);

  const appOptions: AppOptions = {
    credential: cert(serviceAccount),
  };

  const databaseUrl = process.env.FIREBASE_DATABASE_URL?.trim();
  if (databaseUrl) {
    appOptions.databaseURL = databaseUrl;
  }

  try {
    initializeApp(appOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Firebase Admin SDK initialization failed: ${message}`);
  }
}

try {
  initializeFirebase();
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`[Firebase] Configuration error: ${message}`);
  process.exit(1);
}

export const db = getFirestore();
export const auth = getAuth();
