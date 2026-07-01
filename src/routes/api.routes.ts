import { Router } from 'express';
import {
  createCategory,
  deleteCategory,
  draftCategories,
  draftCategory,
  listAdminCategoriesByDeck,
  listPublishedCategoriesByDeck,
  publishCategories,
} from '../controllers/categories.controller';
import { createDeck, deleteDeck, draftDeck, listAdminDecks, listPublishedDecks, publishDeck, updateDeck } from '../controllers/decks.controller';
import {
  createFlashcard,
  deleteFlashcard,
  draftFlashcards,
  draftFlashcardsByCategory,
  listAdminFlashcardsByCategory,
  listAdminFlashcardsByDeck,
  listPublishedFlashcardsByCategory,
  listPublishedFlashcardsByDeck,
  publishFlashcards,
  publishFlashcardsByCategory,
} from '../controllers/flashcards.controller';
import { checkAuth } from '../middlewares/authMiddleware';

const router = Router();

router.get('/decks', listPublishedDecks);
router.get('/decks/:deckId/categories', listPublishedCategoriesByDeck);
router.get('/decks/:deckId/categories/:categoryId/flashcards', listPublishedFlashcardsByCategory);
router.get('/decks/:deckId/flashcards', listPublishedFlashcardsByDeck);

router.post('/admin/decks', checkAuth('admin'), createDeck);
router.get('/admin/decks', checkAuth('admin'), listAdminDecks);
router.post('/admin/flashcards', checkAuth('admin'), createFlashcard);
router.delete('/admin/flashcards/:id', checkAuth('admin'), deleteFlashcard);

router.post('/admin/decks/:deckId/categories', checkAuth('admin'), createCategory);
router.get('/admin/decks/:deckId/categories', checkAuth('admin'), listAdminCategoriesByDeck);
router.put('/admin/decks/:deckId/categories/publish', checkAuth('admin'), publishCategories);
router.put('/admin/decks/:deckId/categories/draft', checkAuth('admin'), draftCategories);
router.put('/admin/decks/:deckId/categories/:categoryId/draft', checkAuth('admin'), draftCategory);
router.delete('/admin/decks/:deckId/categories/:categoryId', checkAuth('admin'), deleteCategory);

router.get('/admin/decks/:deckId/flashcards', checkAuth('admin'), listAdminFlashcardsByDeck);
router.get(
  '/admin/decks/:deckId/categories/:categoryId/flashcards',
  checkAuth('admin'),
  listAdminFlashcardsByCategory
);
router.put('/admin/decks/:deckId/flashcards/publish', checkAuth('admin'), publishFlashcards);
router.put('/admin/decks/:deckId/flashcards/draft', checkAuth('admin'), draftFlashcards);
router.put(
  '/admin/decks/:deckId/categories/:categoryId/flashcards/publish',
  checkAuth('admin'),
  publishFlashcardsByCategory
);
router.put(
  '/admin/decks/:deckId/categories/:categoryId/flashcards/draft',
  checkAuth('admin'),
  draftFlashcardsByCategory
);

router.put('/admin/decks/:id/publish', checkAuth('admin'), publishDeck);
router.put('/admin/decks/:id/draft', checkAuth('admin'), draftDeck);
router.put('/admin/decks/:id', checkAuth('admin'), updateDeck);
router.delete('/admin/decks/:id', checkAuth('admin'), deleteDeck);

export default router;
