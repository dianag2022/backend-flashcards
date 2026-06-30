import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';
import { FIRESTORE_BATCH_LIMIT } from '../constants/firestore';
import { Category, CreateCategoryBody, DraftCategoryResponse } from '../types/content.types';
import { getDeckOrRespond } from '../utils/deckHelpers';
import { toIsoString } from '../utils/firestore';

function mapCategory(id: string, data: FirebaseFirestore.DocumentData): Category {
  return {
    id,
    deckId: data.deckId,
    title: data.title,
    description: data.description ?? '',
    status: data.status,
    cardCount: data.cardCount ?? 0,
    updatedAt: toIsoString(data.updatedAt),
  };
}

function parseCreateCategoryBody(body: unknown): CreateCategoryBody | null {
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

function parseCategoryIdsBody(body: unknown): string[] | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { categoryIds } = body as Record<string, unknown>;

  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    return null;
  }

  const ids = categoryIds.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );

  if (ids.length !== categoryIds.length) {
    return null;
  }

  return [...new Set(ids.map((id) => id.trim()))];
}

async function draftAllFlashcardsInCategory(categoryId: string): Promise<number> {
  const snapshot = await db
    .collection(COLLECTIONS.FLASHCARDS)
    .where('categoryId', '==', categoryId)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  let drafted = 0;

  for (let i = 0; i < snapshot.docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = snapshot.docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
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

export async function deleteFlashcardsByCategory(categoryId: string): Promise<number> {
  const snapshot = await db
    .collection(COLLECTIONS.FLASHCARDS)
    .where('categoryId', '==', categoryId)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  for (let i = 0; i < snapshot.docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = snapshot.docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  return snapshot.docs.length;
}

export async function deleteCategoriesByDeck(deckId: string): Promise<number> {
  const snapshot = await db
    .collection(COLLECTIONS.CATEGORIES)
    .where('deckId', '==', deckId)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  for (let i = 0; i < snapshot.docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = snapshot.docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  return snapshot.docs.length;
}

export async function draftAllCategoriesInDeck(deckId: string): Promise<number> {
  const snapshot = await db
    .collection(COLLECTIONS.CATEGORIES)
    .where('deckId', '==', deckId)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  let drafted = 0;
  const now = FieldValue.serverTimestamp();

  for (let i = 0; i < snapshot.docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = snapshot.docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    let batchOps = 0;

    chunk.forEach((doc) => {
      if (doc.data().status !== 'draft') {
        batch.update(doc.ref, { status: 'draft', updatedAt: now });
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

export async function listPublishedCategoriesByDeck(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);

  try {
    const deck = await db.collection(COLLECTIONS.DECKS).doc(deckId).get();

    if (!deck.exists || deck.data()?.status !== 'published') {
      res.status(404).json({
        error: 'Not Found',
        message: `Published deck not found: ${deckId}`,
      });
      return;
    }

    const snapshot = await db
      .collection(COLLECTIONS.CATEGORIES)
      .where('deckId', '==', deckId)
      .where('status', '==', 'published')
      .get();

    const categories = snapshot.docs.map((doc) => mapCategory(doc.id, doc.data()));

    res.status(200).json({ categories });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch categories: ${message}`,
    });
  }
}

export async function listAdminCategoriesByDeck(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);

  try {
    if (!(await getDeckOrRespond(deckId, res))) {
      return;
    }

    const snapshot = await db
      .collection(COLLECTIONS.CATEGORIES)
      .where('deckId', '==', deckId)
      .get();

    const categories = snapshot.docs.map((doc) => mapCategory(doc.id, doc.data()));

    res.status(200).json({ categories });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to fetch categories: ${message}`,
    });
  }
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);
  const payload = parseCreateCategoryBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'title (non-empty string) and description (string) are required',
    });
    return;
  }

  try {
    if (!(await getDeckOrRespond(deckId, res))) {
      return;
    }

    const now = FieldValue.serverTimestamp();
    const docRef = await db.collection(COLLECTIONS.CATEGORIES).add({
      deckId,
      title: payload.title,
      description: payload.description,
      status: 'draft',
      cardCount: 0,
      updatedAt: now,
    });

    await db.collection(COLLECTIONS.DECKS).doc(deckId).update({ updatedAt: now });

    const created = await docRef.get();
    const category = mapCategory(created.id, created.data()!);

    res.status(201).json({ category });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to create category: ${message}`,
    });
  }
}

async function updateCategoriesStatus(
  req: Request,
  res: Response,
  status: 'draft' | 'published'
): Promise<void> {
  const deckId = String(req.params.deckId);
  const categoryIds = parseCategoryIdsBody(req.body);

  if (!categoryIds) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'categoryIds (non-empty array of strings) is required',
    });
    return;
  }

  try {
    if (!(await getDeckOrRespond(deckId, res))) {
      return;
    }

    const deckRef = db.collection(COLLECTIONS.DECKS).doc(deckId);
    const categoryRefs = categoryIds.map((id) => db.collection(COLLECTIONS.CATEGORIES).doc(id));
    const snapshots = await db.getAll(...categoryRefs);

    const missingIds = categoryIds.filter((_id, index) => !snapshots[index].exists);
    if (missingIds.length > 0) {
      res.status(404).json({
        error: 'Not Found',
        message: `Categories not found: ${missingIds.join(', ')}`,
      });
      return;
    }

    const wrongDeckIds = snapshots
      .filter((doc) => doc.data()?.deckId !== deckId)
      .map((doc) => doc.id);

    if (wrongDeckIds.length > 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: `Categories do not belong to deck ${deckId}: ${wrongDeckIds.join(', ')}`,
      });
      return;
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();

    snapshots.forEach((doc) => {
      batch.update(doc.ref, { status, updatedAt: now });
    });

    batch.update(deckRef, { updatedAt: now });
    await batch.commit();

    const updated = await db.getAll(...categoryRefs);
    const categories = updated.map((doc) => mapCategory(doc.id, doc.data()!));

    res.status(200).json({ categories });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to update categories: ${message}`,
    });
  }
}

export async function publishCategories(req: Request, res: Response): Promise<void> {
  await updateCategoriesStatus(req, res, 'published');
}

export async function draftCategories(req: Request, res: Response): Promise<void> {
  await updateCategoriesStatus(req, res, 'draft');
}

export async function draftCategory(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);
  const categoryId = String(req.params.categoryId);

  try {
    if (!(await getDeckOrRespond(deckId, res))) {
      return;
    }

    const categoryRef = db.collection(COLLECTIONS.CATEGORIES).doc(categoryId);
    const existing = await categoryRef.get();

    if (!existing.exists || existing.data()?.deckId !== deckId) {
      res.status(404).json({
        error: 'Not Found',
        message: `Category not found in deck: ${categoryId}`,
      });
      return;
    }

    const flashcardsDrafted = await draftAllFlashcardsInCategory(categoryId);
    const now = FieldValue.serverTimestamp();

    await categoryRef.update({ status: 'draft', updatedAt: now });
    await db.collection(COLLECTIONS.DECKS).doc(deckId).update({ updatedAt: now });

    const updated = await categoryRef.get();
    const response: DraftCategoryResponse = {
      category: mapCategory(updated.id, updated.data()!),
      flashcardsDrafted,
    };

    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to draft category: ${message}`,
    });
  }
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);
  const categoryId = String(req.params.categoryId);

  try {
    if (!(await getDeckOrRespond(deckId, res))) {
      return;
    }

    const categoryRef = db.collection(COLLECTIONS.CATEGORIES).doc(categoryId);
    const existing = await categoryRef.get();

    if (!existing.exists || existing.data()?.deckId !== deckId) {
      res.status(404).json({
        error: 'Not Found',
        message: `Category not found in deck: ${categoryId}`,
      });
      return;
    }

    const cardCount = existing.data()?.cardCount ?? 0;
    const flashcardsDeleted = await deleteFlashcardsByCategory(categoryId);
    const now = FieldValue.serverTimestamp();

    await categoryRef.delete();
    await db.collection(COLLECTIONS.DECKS).doc(deckId).update({
      cardCount: FieldValue.increment(-cardCount),
      updatedAt: now,
    });

    res.status(200).json({
      message: 'Category deleted successfully',
      categoryId,
      flashcardsDeleted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to delete category: ${message}`,
    });
  }
}
