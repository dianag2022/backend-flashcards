import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import {
  deleteCategoriesByDeck,
  draftAllCategoriesInDeck,
} from '../controllers/categories.controller';
import { COLLECTIONS } from '../constants/collections';
import { FIRESTORE_BATCH_LIMIT } from '../constants/firestore';
import { CreateDeckBody, Deck, ReorderDecksBody, UpdateDeckBody } from '../types/content.types';
import { toIsoString } from '../utils/firestore';

const DECK_EMOJI_MAX_CODE_POINTS = 16;
const DECK_BODY_ERROR =
  'title (non-empty string), description (string), and emoji (non-empty string, max 16 code points) are required';

function mapDeck(id: string, data: FirebaseFirestore.DocumentData): Deck {
  const emoji = typeof data.emoji === 'string' ? data.emoji.trim() : '';

  return {
    id,
    title: data.title,
    description: data.description,
    ...(emoji ? { emoji } : {}),
    order: typeof data.order === 'number' ? data.order : Number.MAX_SAFE_INTEGER,
    status: data.status,
    cardCount: data.cardCount ?? 0,
    updatedAt: toIsoString(data.updatedAt),
  };
}

function compareDecksByOrder(a: Deck, b: Deck): number {
  if (a.order !== b.order) {
    return a.order - b.order;
  }

  return a.id.localeCompare(b.id);
}

function parseEmoji(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const emoji = value.trim();
  if (!emoji) {
    return null;
  }

  if (Array.from(emoji).length > DECK_EMOJI_MAX_CODE_POINTS) {
    return null;
  }

  return emoji;
}

function parseDeckBody(body: unknown): CreateDeckBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { title, description, emoji } = body as Record<string, unknown>;

  if (typeof title !== 'string' || !title.trim()) {
    return null;
  }

  if (typeof description !== 'string') {
    return null;
  }

  const parsedEmoji = parseEmoji(emoji);
  if (!parsedEmoji) {
    return null;
  }

  return {
    title: title.trim(),
    description: description.trim(),
    emoji: parsedEmoji,
  };
}

function parseCreateDeckBody(body: unknown): CreateDeckBody | null {
  return parseDeckBody(body);
}

function parseUpdateDeckBody(body: unknown): UpdateDeckBody | null {
  return parseDeckBody(body);
}

function parseReorderDecksBody(body: unknown): ReorderDecksBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { orderedIds } = body as Record<string, unknown>;

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return null;
  }

  const ids = orderedIds.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );

  if (ids.length !== orderedIds.length) {
    return null;
  }

  const trimmed = ids.map((id) => id.trim());
  if (new Set(trimmed).size !== trimmed.length) {
    return null;
  }

  return { orderedIds: trimmed };
}

async function nextDeckOrder(): Promise<number> {
  const snapshot = await db.collection(COLLECTIONS.DECKS).get();
  let maxOrder = -1;

  snapshot.docs.forEach((doc) => {
    const order = doc.data().order;
    if (typeof order === 'number' && order > maxOrder) {
      maxOrder = order;
    }
  });

  return maxOrder + 1;
}

export async function listPublishedDecks(_req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await db
      .collection(COLLECTIONS.DECKS)
      .where('status', '==', 'published')
      .get();

    const decks = snapshot.docs
      .map((doc) => mapDeck(doc.id, doc.data()))
      .sort(compareDecksByOrder);

    res.status(200).json({ decks });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch decks: ${message}`,
    });
  }
}

export async function listAdminDecks(req: Request, res: Response): Promise<void> {
  const statusParam = req.query.status;

  if (
    statusParam !== undefined &&
    statusParam !== 'draft' &&
    statusParam !== 'published'
  ) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'status query param must be "draft" or "published" when provided',
    });
    return;
  }

  try {
    let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.DECKS);

    if (statusParam === 'draft' || statusParam === 'published') {
      query = query.where('status', '==', statusParam);
    }

    const snapshot = await query.get();
    const decks = snapshot.docs
      .map((doc) => mapDeck(doc.id, doc.data()))
      .sort(compareDecksByOrder);

    res.status(200).json({ decks });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch decks: ${message}`,
    });
  }
}

export async function createDeck(req: Request, res: Response): Promise<void> {
  const payload = parseCreateDeckBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: DECK_BODY_ERROR,
    });
    return;
  }

  try {
    const now = FieldValue.serverTimestamp();
    const order = await nextDeckOrder();
    const docRef = await db.collection(COLLECTIONS.DECKS).add({
      title: payload.title,
      description: payload.description,
      emoji: payload.emoji,
      order,
      status: 'draft',
      cardCount: 0,
      updatedAt: now,
    });

    const created = await docRef.get();
    const deck = mapDeck(created.id, created.data()!);

    res.status(201).json({ deck });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to create deck: ${message}`,
    });
  }
}

export async function reorderDecks(req: Request, res: Response): Promise<void> {
  const payload = parseReorderDecksBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'orderedIds (non-empty array of unique strings) is required',
    });
    return;
  }

  try {
    const deckRefs = payload.orderedIds.map((id) => db.collection(COLLECTIONS.DECKS).doc(id));
    const snapshots = await db.getAll(...deckRefs);
    const missingIds = payload.orderedIds.filter((_id, index) => !snapshots[index].exists);

    if (missingIds.length > 0) {
      res.status(404).json({
        error: 'Not Found',
        message: `Decks not found: ${missingIds.join(', ')}`,
      });
      return;
    }

    const now = FieldValue.serverTimestamp();

    for (let i = 0; i < snapshots.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = snapshots.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = db.batch();

      chunk.forEach((doc, chunkIndex) => {
        batch.update(doc.ref, {
          order: i + chunkIndex,
          updatedAt: now,
        });
      });

      await batch.commit();
    }

    const updated = await db.getAll(...deckRefs);
    const decks = updated
      .map((doc) => mapDeck(doc.id, doc.data()!))
      .sort(compareDecksByOrder);

    res.status(200).json({ decks });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to reorder decks: ${message}`,
    });
  }
}

export async function updateDeck(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);
  const payload = parseUpdateDeckBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: DECK_BODY_ERROR,
    });
    return;
  }

  try {
    const docRef = db.collection(COLLECTIONS.DECKS).doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      res.status(404).json({
        error: 'Not Found',
        message: `Deck not found: ${id}`,
      });
      return;
    }

    await docRef.update({
      title: payload.title,
      description: payload.description,
      emoji: payload.emoji,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updated = await docRef.get();
    const deck = mapDeck(updated.id, updated.data()!);

    res.status(200).json({ deck });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to update deck: ${message}`,
    });
  }
}

export async function publishDeck(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);

  try {
    const docRef = db.collection(COLLECTIONS.DECKS).doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      res.status(404).json({
        error: 'Not Found',
        message: `Deck not found: ${id}`,
      });
      return;
    }

    await docRef.update({
      status: 'published',
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updated = await docRef.get();
    const deck = mapDeck(updated.id, updated.data()!);

    res.status(200).json({ deck });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to publish deck: ${message}`,
    });
  }
}

async function draftAllFlashcardsInDeck(deckId: string): Promise<number> {
  const snapshot = await db
    .collection(COLLECTIONS.FLASHCARDS)
    .where('deckId', '==', deckId)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const docs = snapshot.docs;
  let drafted = 0;

  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    let batchOps = 0;

    chunk.forEach((doc) => {
      if (doc.data().status !== 'draft') {
        batch.update(doc.ref, { status: 'draft' });
        drafted += 1;
        batchOps += 1;
      }
    });

    if (batchOps > 0) {
      await batch.commit();
    }
  }

  return drafted;
}

export async function draftDeck(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);

  try {
    const docRef = db.collection(COLLECTIONS.DECKS).doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      res.status(404).json({
        error: 'Not Found',
        message: `Deck not found: ${id}`,
      });
      return;
    }

    const categoriesDrafted = await draftAllCategoriesInDeck(id);
    const flashcardsDrafted = await draftAllFlashcardsInDeck(id);

    await docRef.update({
      status: 'draft',
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updated = await docRef.get();
    const deck = mapDeck(updated.id, updated.data()!);

    res.status(200).json({ deck, categoriesDrafted, flashcardsDrafted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to draft deck: ${message}`,
    });
  }
}

async function deleteFlashcardsByDeck(deckId: string): Promise<number> {
  const snapshot = await db
    .collection(COLLECTIONS.FLASHCARDS)
    .where('deckId', '==', deckId)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  const docs = snapshot.docs;

  for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();

    chunk.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();
  }

  return docs.length;
}

export async function deleteDeck(req: Request, res: Response): Promise<void> {
  const id = String(req.params.id);

  try {
    const docRef = db.collection(COLLECTIONS.DECKS).doc(id);
    const existing = await docRef.get();

    if (!existing.exists) {
      res.status(404).json({
        error: 'Not Found',
        message: `Deck not found: ${id}`,
      });
      return;
    }

    const flashcardsDeleted = await deleteFlashcardsByDeck(id);
    const categoriesDeleted = await deleteCategoriesByDeck(id);

    await docRef.delete();

    res.status(200).json({
      message: 'Deck deleted successfully',
      deckId: id,
      categoriesDeleted,
      flashcardsDeleted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to delete deck: ${message}`,
    });
  }
}
