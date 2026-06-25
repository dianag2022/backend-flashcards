import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';
import {
  ContentStatus,
  CreateFlashcardBody,
  Flashcard,
  UpdateFlashcardsStatusBody,
} from '../types/content.types';
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

function parseUpdateFlashcardsStatusBody(body: unknown): UpdateFlashcardsStatusBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { flashcardIds } = body as Record<string, unknown>;

  if (!Array.isArray(flashcardIds) || flashcardIds.length === 0) {
    return null;
  }

  const ids = flashcardIds.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );

  if (ids.length !== flashcardIds.length) {
    return null;
  }

  return { flashcardIds: ids.map((id) => id.trim()) };
}

async function getDeckOrRespond(deckId: string, res: Response): Promise<boolean> {
  const deck = await db.collection(COLLECTIONS.DECKS).doc(deckId).get();

  if (!deck.exists) {
    res.status(404).json({
      error: 'Not Found',
      message: `Deck not found: ${deckId}`,
    });
    return false;
  }

  return true;
}

async function updateFlashcardsStatus(
  req: Request,
  res: Response,
  status: ContentStatus
): Promise<void> {
  const deckId = String(req.params.deckId);
  const payload = parseUpdateFlashcardsStatusBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'flashcardIds (non-empty array of strings) is required',
    });
    return;
  }

  const uniqueIds = [...new Set(payload.flashcardIds)];

  try {
    if (!(await getDeckOrRespond(deckId, res))) {
      return;
    }

    const deckRef = db.collection(COLLECTIONS.DECKS).doc(deckId);
    const flashcardRefs = uniqueIds.map((id) => db.collection(COLLECTIONS.FLASHCARDS).doc(id));
    const snapshots = await db.getAll(...flashcardRefs);

    const missingIds = uniqueIds.filter((_id, index) => !snapshots[index].exists);
    if (missingIds.length > 0) {
      res.status(404).json({
        error: 'Not Found',
        message: `Flashcards not found: ${missingIds.join(', ')}`,
      });
      return;
    }

    const wrongDeckIds = snapshots
      .filter((doc) => doc.data()?.deckId !== deckId)
      .map((doc) => doc.id);

    if (wrongDeckIds.length > 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Flashcards do not belong to deck ${deckId}: ${wrongDeckIds.join(', ')}`,
      });
      return;
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();

    snapshots.forEach((doc) => {
      batch.update(doc.ref, { status });
    });

    batch.update(deckRef, { updatedAt: now });
    await batch.commit();

    const updated = await db.getAll(...flashcardRefs);
    const flashcards = updated.map((doc) => mapFlashcard(doc.id, doc.data()!));

    res.status(200).json({ flashcards });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to update flashcards: ${message}`,
    });
  }
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

export async function listAdminFlashcardsByDeck(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);

  try {
    if (!(await getDeckOrRespond(deckId, res))) {
      return;
    }

    const snapshot = await db
      .collection(COLLECTIONS.FLASHCARDS)
      .where('deckId', '==', deckId)
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

export async function publishFlashcards(req: Request, res: Response): Promise<void> {
  await updateFlashcardsStatus(req, res, 'published');
}

export async function draftFlashcards(req: Request, res: Response): Promise<void> {
  await updateFlashcardsStatus(req, res, 'draft');
}

export async function deleteFlashcard(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);

  try {
    const flashcardRef = db.collection(COLLECTIONS.FLASHCARDS).doc(id);
    const existing = await flashcardRef.get();

    if (!existing.exists) {
      res.status(404).json({
        error: 'Not Found',
        message: `Flashcard not found: ${id}`,
      });
      return;
    }

    const deckId = existing.data()?.deckId as string;
    const deckRef = db.collection(COLLECTIONS.DECKS).doc(deckId);
    const deck = await deckRef.get();

    if (!deck.exists) {
      res.status(404).json({
        error: 'Not Found',
        message: `Deck not found: ${deckId}`,
      });
      return;
    }

    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      transaction.delete(flashcardRef);
      transaction.update(deckRef, {
        cardCount: FieldValue.increment(-1),
        updatedAt: now,
      });
    });

    res.status(200).json({
      message: 'Flashcard deleted successfully',
      flashcardId: id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to delete flashcard: ${message}`,
    });
  }
}
