import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';
import { CreateFlashcardBody, Flashcard } from '../types/content.types';
import { toIsoString } from '../utils/firestore';

function mapFlashcard(id: string, data: FirebaseFirestore.DocumentData): Flashcard {
  return {
    id,
    deckId: data.deckId,
    front: data.front,
    back: data.back,
    status: data.status,
    createdAt: toIsoString(data.createdAt),
  };
}

function parseCreateFlashcardBody(body: unknown): CreateFlashcardBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { deckId, front, back } = body as Record<string, unknown>;

  if (typeof deckId !== 'string' || !deckId.trim()) {
    return null;
  }

  if (typeof front !== 'string' || !front.trim()) {
    return null;
  }

  if (typeof back !== 'string' || !back.trim()) {
    return null;
  }

  return {
    deckId: deckId.trim(),
    front: front.trim(),
    back: back.trim(),
  };
}

export async function listPublishedFlashcardsByDeck(
  req: Request,
  res: Response
): Promise<void> {
  const deckId = String(req.params.deckId);

  try {
    const deckRef = db.collection(COLLECTIONS.DECKS).doc(deckId);
    const deck = await deckRef.get();

    if (!deck.exists || deck.data()?.status !== 'published') {
      res.status(404).json({
        error: 'Not Found',
        message: `Published deck not found: ${deckId}`,
      });
      return;
    }

    const snapshot = await db
      .collection(COLLECTIONS.FLASHCARDS)
      .where('deckId', '==', deckId)
      .where('status', '==', 'published')
      .get();

    const flashcards = snapshot.docs.map((doc) => mapFlashcard(doc.id, doc.data()));

    res.status(200).json({ flashcards });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch flashcards: ${message}`,
    });
  }
}

export async function createFlashcard(req: Request, res: Response): Promise<void> {
  const payload = parseCreateFlashcardBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'deckId, front, and back (non-empty strings) are required',
    });
    return;
  }

  try {
    const deckRef = db.collection(COLLECTIONS.DECKS).doc(payload.deckId);
    const deck = await deckRef.get();

    if (!deck.exists) {
      res.status(404).json({
        error: 'Not Found',
        message: `Deck not found: ${payload.deckId}`,
      });
      return;
    }

    const now = FieldValue.serverTimestamp();
    const flashcardRef = db.collection(COLLECTIONS.FLASHCARDS).doc();

    await db.runTransaction(async (transaction) => {
      transaction.set(flashcardRef, {
        deckId: payload.deckId,
        front: payload.front,
        back: payload.back,
        status: 'draft',
        createdAt: now,
      });

      transaction.update(deckRef, {
        cardCount: FieldValue.increment(1),
        updatedAt: now,
      });
    });

    const created = await flashcardRef.get();
    const flashcard = mapFlashcard(created.id, created.data()!);

    res.status(201).json({ flashcard });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to create flashcard: ${message}`,
    });
  }
}
