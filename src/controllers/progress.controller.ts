import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS, SUBCOLLECTIONS } from '../constants/collections';
import { FIRESTORE_BATCH_LIMIT } from '../constants/firestore';
import { MASTERED_CORRECT_STREAK } from '../constants/progress';
import { Flashcard } from '../types/content.types';
import {
  CardAnswerResult,
  RecordCardAnswerBody,
  ReinforcementCard,
  ResetProgressResponse,
  UserCardProgress,
  UserCardProgressResponse,
} from '../types/progress.types';
import { getUserIdOrRespond } from '../middlewares/authMiddleware';
import { getCategoryOrRespond, getDeckOrRespond } from '../utils/deckHelpers';
import { toIsoString } from '../utils/firestore';

const GET_ALL_CHUNK_SIZE = 100;

function userCardProgressCollection(userId: string): FirebaseFirestore.CollectionReference {
  return db
    .collection(COLLECTIONS.USER_CARD_PROGRESS)
    .doc(userId)
    .collection(SUBCOLLECTIONS.CARDS);
}

function mapProgress(cardId: string, data: FirebaseFirestore.DocumentData): UserCardProgress {
  return {
    cardId,
    deckId: data.deckId,
    categoryId: data.categoryId,
    lastResult: data.lastResult,
    correctStreak: data.correctStreak ?? 0,
    lastAttemptAt: toIsoString(data.lastAttemptAt),
    mastered: Boolean(data.mastered),
  };
}

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

function parseRecordAnswerBody(body: unknown): RecordCardAnswerBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { result } = body as Record<string, unknown>;

  if (result !== 'correct' && result !== 'incorrect') {
    return null;
  }

  return { result };
}

function nextProgressState(
  result: CardAnswerResult,
  previousStreak: number
): { correctStreak: number; mastered: boolean } {
  if (result === 'incorrect') {
    return { correctStreak: 0, mastered: false };
  }

  const correctStreak = previousStreak + 1;
  return {
    correctStreak,
    mastered: correctStreak >= MASTERED_CORRECT_STREAK,
  };
}

async function deleteProgressDocs(
  docs: FirebaseFirestore.QueryDocumentSnapshot[]
): Promise<number> {
  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  return docs.length;
}

async function loadPublishedFlashcardsByIds(
  cardIds: string[]
): Promise<Map<string, Flashcard>> {
  const flashcards = new Map<string, Flashcard>();

  for (let i = 0; i < cardIds.length; i += GET_ALL_CHUNK_SIZE) {
    const chunk = cardIds.slice(i, i + GET_ALL_CHUNK_SIZE);
    const refs = chunk.map((id) => db.collection(COLLECTIONS.FLASHCARDS).doc(id));
    const snapshots = await db.getAll(...refs);

    snapshots.forEach((doc) => {
      const data = doc.data();
      if (doc.exists && data?.status === 'published') {
        flashcards.set(doc.id, mapFlashcard(doc.id, data));
      }
    });
  }

  return flashcards;
}

async function listReinforcementCards(
  req: Request,
  res: Response,
  deckId: string,
  categoryId?: string
): Promise<void> {
  const userId = getUserIdOrRespond(req, res);
  if (!userId) {
    return;
  }

  const deck = await db.collection(COLLECTIONS.DECKS).doc(deckId).get();
  if (!deck.exists || deck.data()?.status !== 'published') {
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
      category.data()?.status !== 'published'
    ) {
      res.status(404).json({
        error: 'Not Found',
        message: `Published category not found: ${categoryId}`,
      });
      return;
    }
  }

  const snapshot = await userCardProgressCollection(userId).where('deckId', '==', deckId).get();

  const progressDocs = snapshot.docs.filter((doc) => {
    const data = doc.data();
    if (data.mastered === true) {
      return false;
    }
    if (categoryId && data.categoryId !== categoryId) {
      return false;
    }
    return true;
  });

  const flashcards = await loadPublishedFlashcardsByIds(progressDocs.map((doc) => doc.id));

  const cards: ReinforcementCard[] = progressDocs
    .map((doc) => {
      const flashcard = flashcards.get(doc.id);
      if (!flashcard) {
        return null;
      }

      return {
        flashcard,
        progress: mapProgress(doc.id, doc.data()),
      };
    })
    .filter((card): card is ReinforcementCard => card !== null)
    .sort((a, b) => {
      if (a.progress.lastResult !== b.progress.lastResult) {
        return a.progress.lastResult === 'incorrect' ? -1 : 1;
      }

      return a.progress.lastAttemptAt.localeCompare(b.progress.lastAttemptAt);
    });

  res.status(200).json({ cards });
}

async function resetProgress(
  req: Request,
  res: Response,
  deckId: string,
  categoryId?: string
): Promise<void> {
  const userId = getUserIdOrRespond(req, res);
  if (!userId) {
    return;
  }

  if (!(await getDeckOrRespond(deckId, res))) {
    return;
  }

  if (categoryId) {
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
  }

  const snapshot = await userCardProgressCollection(userId).where('deckId', '==', deckId).get();
  const docs = categoryId
    ? snapshot.docs.filter((doc) => doc.data().categoryId === categoryId)
    : snapshot.docs;

  const progressDeleted = await deleteProgressDocs(docs);

  const response: ResetProgressResponse = {
    message: 'Progress reset successfully',
    deckId,
    progressDeleted,
  };

  if (categoryId) {
    response.categoryId = categoryId;
  }

  res.status(200).json(response);
}

export async function recordCardAnswer(req: Request, res: Response): Promise<void> {
  const userId = getUserIdOrRespond(req, res);
  if (!userId) {
    return;
  }

  const cardId = String(req.params.cardId);
  const payload = parseRecordAnswerBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'result must be "correct" or "incorrect"',
    });
    return;
  }

  try {
    const flashcardRef = db.collection(COLLECTIONS.FLASHCARDS).doc(cardId);
    const flashcard = await flashcardRef.get();
    const flashcardData = flashcard.data();

    if (!flashcard.exists || flashcardData?.status !== 'published') {
      res.status(404).json({
        error: 'Not Found',
        message: `Published flashcard not found: ${cardId}`,
      });
      return;
    }

    const deckId = flashcardData.deckId;
    const categoryId = flashcardData.categoryId;

    if (typeof deckId !== 'string' || typeof categoryId !== 'string') {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Flashcard is missing deckId or categoryId',
      });
      return;
    }

    const progressRef = userCardProgressCollection(userId).doc(cardId);

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(progressRef);
      const previousStreak = existing.data()?.correctStreak ?? 0;
      const { correctStreak, mastered } = nextProgressState(payload.result, previousStreak);

      transaction.set(progressRef, {
        deckId,
        categoryId,
        lastResult: payload.result,
        correctStreak,
        lastAttemptAt: FieldValue.serverTimestamp(),
        mastered,
      });
    });

    const updated = await progressRef.get();
    const response: UserCardProgressResponse = {
      progress: mapProgress(updated.id, updated.data()!),
    };

    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to record answer: ${message}`,
    });
  }
}

export async function listReinforcementCardsByDeck(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);

  try {
    await listReinforcementCards(req, res, deckId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch reinforcement cards: ${message}`,
    });
  }
}

export async function listReinforcementCardsByCategory(
  req: Request,
  res: Response
): Promise<void> {
  const deckId = String(req.params.deckId);
  const categoryId = String(req.params.categoryId);

  try {
    await listReinforcementCards(req, res, deckId, categoryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch reinforcement cards: ${message}`,
    });
  }
}

export async function resetProgressByDeck(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);

  try {
    await resetProgress(req, res, deckId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to reset progress: ${message}`,
    });
  }
}

export async function resetProgressByCategory(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);
  const categoryId = String(req.params.categoryId);

  try {
    await resetProgress(req, res, deckId, categoryId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to reset progress: ${message}`,
    });
  }
}