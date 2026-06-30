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
import { getCategoryOrRespond, getDeckOrRespond } from '../utils/deckHelpers';
import { toIsoString } from '../utils/firestore';

function mapFlashcard(id: string, data: FirebaseFirestore.DocumentData): Flashcard {
  return {
    id,
    deckId: data.deckId,
    categoryId: data.categoryId,
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

  const { deckId, categoryId, front, back } = body as Record<string, unknown>;

  if (typeof deckId !== 'string' || !deckId.trim()) {
    return null;
  }

  if (typeof categoryId !== 'string' || !categoryId.trim()) {
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
    categoryId: categoryId.trim(),
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

async function updateFlashcardsStatusInScope(
  req: Request,
  res: Response,
  status: ContentStatus,
  scope: { deckId: string; categoryId?: string }
): Promise<void> {
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
    if (!(await getDeckOrRespond(scope.deckId, res))) {
      return;
    }

    if (scope.categoryId) {
      const category = await getCategoryOrRespond(scope.categoryId, res);
      if (!category || category.data()?.deckId !== scope.deckId) {
        if (category) {
          res.status(400).json({
            error: 'Bad Request',
            message: `Category ${scope.categoryId} does not belong to deck ${scope.deckId}`,
          });
        }
        return;
      }
    }

    const deckRef = db.collection(COLLECTIONS.DECKS).doc(scope.deckId);
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

    const wrongScope = snapshots.filter((doc) => {
      const data = doc.data();
      if (data?.deckId !== scope.deckId) {
        return true;
      }
      if (scope.categoryId && data?.categoryId !== scope.categoryId) {
        return true;
      }
      return false;
    });

    if (wrongScope.length > 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Flashcards do not belong to the requested scope: ${wrongScope.map((d) => d.id).join(', ')}`,
      });
      return;
    }

    const categoryIds = [...new Set(snapshots.map((doc) => doc.data()?.categoryId as string))];
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();

    snapshots.forEach((doc) => {
      batch.update(doc.ref, { status });
    });

    batch.update(deckRef, { updatedAt: now });
    categoryIds.forEach((categoryId) => {
      batch.update(db.collection(COLLECTIONS.CATEGORIES).doc(categoryId), { updatedAt: now });
    });

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

async function listFlashcards(
  res: Response,
  deckId: string,
  categoryId: string | undefined,
  publishedOnly: boolean
): Promise<void> {
  const deck = await db.collection(COLLECTIONS.DECKS).doc(deckId).get();

  if (!deck.exists || (publishedOnly && deck.data()?.status !== 'published')) {
    res.status(404).json({
      error: 'Not Found',
      message: `Published deck not found: ${deckId}`,
    });
    return;
  }

  if (categoryId) {
    const category = await db.collection(COLLECTIONS.CATEGORIES).doc(categoryId).get();
    if (
      !category.exists ||
      category.data()?.deckId !== deckId ||
      (publishedOnly && category.data()?.status !== 'published')
    ) {
      res.status(404).json({
        error: 'Not Found',
        message: `Published category not found: ${categoryId}`,
      });
      return;
    }
  }

  let query: FirebaseFirestore.Query = db
    .collection(COLLECTIONS.FLASHCARDS)
    .where('deckId', '==', deckId);

  if (categoryId) {
    query = query.where('categoryId', '==', categoryId);
  }

  if (publishedOnly) {
    query = query.where('status', '==', 'published');
  }

  const snapshot = await query.get();
  const flashcards = snapshot.docs.map((doc) => mapFlashcard(doc.id, doc.data()));

  res.status(200).json({ flashcards });
}

export async function listPublishedFlashcardsByDeck(
  req: Request,
  res: Response
): Promise<void> {
  const deckId = String(req.params.deckId);

  try {
    await listFlashcards(res, deckId, undefined, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch flashcards: ${message}`,
    });
  }
}

export async function listPublishedFlashcardsByCategory(
  req: Request,
  res: Response
): Promise<void> {
  const deckId = String(req.params.deckId);
  const categoryId = String(req.params.categoryId);

  try {
    await listFlashcards(res, deckId, categoryId, true);
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

export async function listAdminFlashcardsByCategory(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);
  const categoryId = String(req.params.categoryId);

  try {
    if (!(await getDeckOrRespond(deckId, res))) {
      return;
    }

    const category = await getCategoryOrRespond(categoryId, res);
    if (!category || category.data()?.deckId !== deckId) {
      if (category) {
        res.status(400).json({
          error: 'Bad Request',
          message: `Category ${categoryId} does not belong to deck ${deckId}`,
        });
      }
      return;
    }

    const snapshot = await db
      .collection(COLLECTIONS.FLASHCARDS)
      .where('categoryId', '==', categoryId)
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
      message: 'deckId, categoryId, front, and back (non-empty strings) are required',
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

    const categoryRef = db.collection(COLLECTIONS.CATEGORIES).doc(payload.categoryId);
    const category = await categoryRef.get();

    if (!category.exists || category.data()?.deckId !== payload.deckId) {
      res.status(404).json({
        error: 'Not Found',
        message: `Category not found in deck: ${payload.categoryId}`,
      });
      return;
    }

    const now = FieldValue.serverTimestamp();
    const flashcardRef = db.collection(COLLECTIONS.FLASHCARDS).doc();

    await db.runTransaction(async (transaction) => {
      transaction.set(flashcardRef, {
        deckId: payload.deckId,
        categoryId: payload.categoryId,
        front: payload.front,
        back: payload.back,
        status: 'draft',
        createdAt: now,
      });

      transaction.update(deckRef, {
        cardCount: FieldValue.increment(1),
        updatedAt: now,
      });

      transaction.update(categoryRef, {
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
  await updateFlashcardsStatusInScope(req, res, 'published', {
    deckId: String(req.params.deckId),
  });
}

export async function publishFlashcardsByCategory(req: Request, res: Response): Promise<void> {
  await updateFlashcardsStatusInScope(req, res, 'published', {
    deckId: String(req.params.deckId),
    categoryId: String(req.params.categoryId),
  });
}

export async function draftFlashcards(req: Request, res: Response): Promise<void> {
  await updateFlashcardsStatusInScope(req, res, 'draft', {
    deckId: String(req.params.deckId),
  });
}

export async function draftFlashcardsByCategory(req: Request, res: Response): Promise<void> {
  await updateFlashcardsStatusInScope(req, res, 'draft', {
    deckId: String(req.params.deckId),
    categoryId: String(req.params.categoryId),
  });
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
    const categoryId = existing.data()?.categoryId as string;
    const deckRef = db.collection(COLLECTIONS.DECKS).doc(deckId);
    const categoryRef = db.collection(COLLECTIONS.CATEGORIES).doc(categoryId);
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

      const category = await transaction.get(categoryRef);
      if (category.exists) {
        transaction.update(categoryRef, {
          cardCount: FieldValue.increment(-1),
          updatedAt: now,
        });
      }
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
