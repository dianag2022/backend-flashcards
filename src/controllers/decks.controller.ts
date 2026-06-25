import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';
import { CreateDeckBody, Deck } from '../types/content.types';
import { toIsoString } from '../utils/firestore';

function mapDeck(id: string, data: FirebaseFirestore.DocumentData): Deck {
  return {
    id,
    title: data.title,
    description: data.description,
    status: data.status,
    cardCount: data.cardCount ?? 0,
    updatedAt: toIsoString(data.updatedAt),
  };
}

function parseCreateDeckBody(body: unknown): CreateDeckBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { title, description } = body as Record<string, unknown>;

  if (typeof title !== 'string' || !title.trim()) {
    return null;
  }

  if (typeof description !== 'string') {
    return null;
  }

  return {
    title: title.trim(),
    description: description.trim(),
  };
}

export async function listPublishedDecks(_req: Request, res: Response): Promise<void> {
  try {
    const snapshot = await db
      .collection(COLLECTIONS.DECKS)
      .where('status', '==', 'published')
      .get();

    const decks = snapshot.docs.map((doc) => mapDeck(doc.id, doc.data()));

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
      message: 'title (non-empty string) and description (string) are required',
    });
    return;
  }

  try {
    const now = FieldValue.serverTimestamp();
    const docRef = await db.collection(COLLECTIONS.DECKS).add({
      title: payload.title,
      description: payload.description,
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

const FIRESTORE_BATCH_LIMIT = 500;

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

    const flashcardsDrafted = await draftAllFlashcardsInDeck(id);

    await docRef.update({
      status: 'draft',
      updatedAt: FieldValue.serverTimestamp(),
    });

    const updated = await docRef.get();
    const deck = mapDeck(updated.id, updated.data()!);

    res.status(200).json({ deck, flashcardsDrafted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to draft deck: ${message}`,
    });
  }
}
