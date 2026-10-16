import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';
import { FIRESTORE_BATCH_LIMIT } from '../constants/firestore';
import {
  Category,
  CreateCategoryBody,
  DeleteCategoryResponse,
  DraftCategoryResponse,
  PublishCategoryResponse,
  UpdateCategoryBody,
} from '../types/content.types';
import { getDeckOrRespond } from '../utils/deckHelpers';
import { toIsoString, toMillis } from '../utils/firestore';

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CATEGORY_BODY_ERROR =
  'title (non-empty string), description (string), and color (hex, e.g. "#2eab95") are required';

function mapCategory(id: string, data: FirebaseFirestore.DocumentData): Category {
  const color = typeof data.color === 'string' ? data.color.trim() : '';
  const createdAt = data.createdAt ? toIsoString(data.createdAt) : undefined;

  return {
    id,
    deckId: data.deckId,
    title: data.title,
    description: data.description ?? '',
    ...(color ? { color } : {}),
    status: data.status,
    cardCount: data.cardCount ?? 0,
    ...(createdAt ? { createdAt } : {}),
    updatedAt: toIsoString(data.updatedAt),
  };
}

function parseColor(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const color = value.trim();
  if (!HEX_COLOR_PATTERN.test(color)) {
    return null;
  }

  if (color.length === 4) {
    const [, r, g, b] = color;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  return color.toLowerCase();
}

function parseCategoryBody(body: unknown): CreateCategoryBody | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const { title, description, color } = body as Record<string, unknown>;

  if (typeof title !== 'string' || !title.trim()) {
    return null;
  }

  if (typeof description !== 'string') {
    return null;
  }

  const parsedColor = parseColor(color);
  if (!parsedColor) {
    return null;
  }

  return {
    title: title.trim(),
    description: description.trim(),
    color: parsedColor,
  };
}

function parseCreateCategoryBody(body: unknown): CreateCategoryBody | null {
  return parseCategoryBody(body);
}

function parseUpdateCategoryBody(body: unknown): UpdateCategoryBody | null {
  return parseCategoryBody(body);
}

function compareCategoryDocsNewestFirst(
  a: FirebaseFirestore.QueryDocumentSnapshot,
  b: FirebaseFirestore.QueryDocumentSnapshot
): number {
  const aCreated = toMillis(a.data().createdAt) ?? 0;
  const bCreated = toMillis(b.data().createdAt) ?? 0;

  if (aCreated !== bCreated) {
    return bCreated - aCreated;
  }

  return a.id.localeCompare(b.id);
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

async function setAllFlashcardsStatusInCategory(
  categoryId: string,
  status: 'draft' | 'published'
): Promise<number> {
  const snapshot = await db
    .collection(COLLECTIONS.FLASHCARDS)
    .where('categoryId', '==', categoryId)
    .get();

  if (snapshot.empty) {
    return 0;
  }

  let updatedCount = 0;

  for (let i = 0; i < snapshot.docs.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = snapshot.docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();
    let batchOps = 0;

    chunk.forEach((doc) => {
      if (doc.data().status !== status) {
        batch.update(doc.ref, { status });
        updatedCount += 1;
        batchOps += 1;
      }
    });

    if (batchOps > 0) {
      await batch.commit();
    }
  }

  return updatedCount;
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

    const categories = snapshot.docs
      .slice()
      .sort(compareCategoryDocsNewestFirst)
      .map((doc) => mapCategory(doc.id, doc.data()));

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

    const categories = snapshot.docs
      .slice()
      .sort(compareCategoryDocsNewestFirst)
      .map((doc) => mapCategory(doc.id, doc.data()));

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
      message: CATEGORY_BODY_ERROR,
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
      color: payload.color,
      status: 'draft',
      cardCount: 0,
      createdAt: now,
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

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const deckId = String(req.params.deckId);
  const categoryId = String(req.params.categoryId);
  const payload = parseUpdateCategoryBody(req.body);

  if (!payload) {
    res.status(400).json({
      error: 'Bad Request',
      message: CATEGORY_BODY_ERROR,
    });
    return;
  }

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

    const now = FieldValue.serverTimestamp();
    await categoryRef.update({
      title: payload.title,
      description: payload.description,
      color: payload.color,
      updatedAt: now,
    });
    await db.collection(COLLECTIONS.DECKS).doc(deckId).update({ updatedAt: now });

    const updated = await categoryRef.get();
    const category = mapCategory(updated.id, updated.data()!);

    res.status(200).json({ category });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to update category: ${message}`,
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
  await updateCategoryAndFlashcardsStatus(req, res, 'draft');
}

export async function publishCategory(req: Request, res: Response): Promise<void> {
  await updateCategoryAndFlashcardsStatus(req, res, 'published');
}

async function updateCategoryAndFlashcardsStatus(
  req: Request,
  res: Response,
  status: 'draft' | 'published'
): Promise<void> {
  const deckId = String(req.params.deckId);
  const categoryId = String(req.params.categoryId);
  const action = status === 'published' ? 'publish' : 'draft';

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

    const flashcardsUpdated = await setAllFlashcardsStatusInCategory(categoryId, status);
    const now = FieldValue.serverTimestamp();

    await categoryRef.update({ status, updatedAt: now });
    await db.collection(COLLECTIONS.DECKS).doc(deckId).update({ updatedAt: now });

    const updated = await categoryRef.get();
    const category = mapCategory(updated.id, updated.data()!);

    if (status === 'published') {
      const response: PublishCategoryResponse = {
        category,
        flashcardsPublished: flashcardsUpdated,
      };
      res.status(200).json(response);
      return;
    }

    const response: DraftCategoryResponse = {
      category,
      flashcardsDrafted: flashcardsUpdated,
    };
    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to ${action} category: ${message}`,
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

    const response: DeleteCategoryResponse = {
      message: 'Category deleted successfully',
      categoryId,
      flashcardsDeleted,
    };

    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Internal Server Error',
      message: `Failed to delete category: ${message}`,
    });
  }
}
