import { Request, Response } from 'express';
import { db, messaging } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';
import { SendNotificationBody } from '../types/notification.types';

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

    if (tokens.length === 0) {
      res.status(200).json({
        message: 'Sent',
        sentCount: 0,
      });
      return;
    }

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