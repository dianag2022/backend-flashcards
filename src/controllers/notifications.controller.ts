import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db, messaging } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';
import { Notification, SendNotificationBody } from '../types/notification.types';
import { toIsoString, toMillis } from '../utils/firestore';

const FCM_MULTICAST_LIMIT = 500;

function parseSendNotificationBody(body: unknown): SendNotificationBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { title, body: messageBody, audience } = body as Record<string, unknown>;

  if (typeof title !== 'string' || !title.trim()) {
    return null;
  }

  if (typeof messageBody !== 'string' || !messageBody.trim()) {
    return null;
  }

  if (audience !== 'all') {
    return null;
  }

  return {
    title: title.trim(),
    body: messageBody.trim(),
    audience,
  };
}

function collectTokens(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }

      if (item && typeof item === 'object' && 'token' in item) {
        const token = (item as { token: unknown }).token;
        return typeof token === 'string' ? token.trim() : '';
      }

      return '';
    })
    .filter((token) => token.length > 0);
}

function mapNotification(id: string, data: FirebaseFirestore.DocumentData): Notification {
  return {
    id,
    title: data.title,
    body: data.body,
    audience: 'all',
    sentCount: typeof data.sentCount === 'number' ? data.sentCount : 0,
    createdAt: toIsoString(data.createdAt),
  };
}

async function persistNotification(
  payload: SendNotificationBody,
  sentCount: number
): Promise<void> {
  await db.collection(COLLECTIONS.NOTIFICATIONS).add({
    title: payload.title,
    body: payload.body,
    audience: payload.audience,
    sentCount,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function loadAllFcmTokens(): Promise<string[]> {
  const snapshot = await db.collection(COLLECTIONS.USERS).get();
  const tokens = new Set<string>();

  snapshot.docs.forEach((doc) => {
    collectTokens(doc.data()?.fcmTokens).forEach((token) => tokens.add(token));
  });

  return [...tokens];
}

export async function sendAdminNotification(req: Request, res: Response): Promise<void> {
  const payload = parseSendNotificationBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'title, body (non-empty strings), and audience "all" are required',
    });
    return;
  }

  try {
    const tokens = await loadAllFcmTokens();
    let sentCount = 0;

    for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
      const chunk = tokens.slice(i, i + FCM_MULTICAST_LIMIT);
      const result = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: {
          title: payload.title,
          body: payload.body,
        },
      });

      sentCount += result.successCount;
    }

    await persistNotification(payload, sentCount);

    res.status(200).json({
      message: 'Sent',
      sentCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to send notification: ${message}`,
    });
  }
}

export async function listNotifications(_req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await db.collection(COLLECTIONS.NOTIFICATIONS).get();
    const notifications = snapshot.docs
      .slice()
      .sort((a, b) => (toMillis(b.data().createdAt) ?? 0) - (toMillis(a.data().createdAt) ?? 0))
      .map((doc) => mapNotification(doc.id, doc.data()));

    res.status(200).json({ notifications });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch notifications: ${message}`,
    });
  }
}