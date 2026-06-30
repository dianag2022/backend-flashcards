import { Response } from 'express';
import { db } from '../config/firebase';
import { COLLECTIONS } from '../constants/collections';

export async function getDeckOrRespond(deckId: string, res: Response): Promise<boolean> {
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

export async function getCategoryOrRespond(
  categoryId: string,
  res: Response
): Promise<FirebaseFirestore.DocumentSnapshot | null> {
  const category = await db.collection(COLLECTIONS.CATEGORIES).doc(categoryId).get();

  if (!category.exists) {
    res.status(404).json({
      error: 'Not Found',
      message: `Category not found: ${categoryId}`,
    });
    return null;
  }

  return category;
}
