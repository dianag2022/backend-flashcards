import { Router } from 'express';
import {
  createCategory,
  deleteCategory,
  draftCategories,
  draftCategory,
  listAdminCategoriesByDeck,
  listPublishedCategoriesByDeck,
  publishCategories,
  publishCategory,
  updateCategory,
} from '../controllers/categories.controller';
import { createDeck, deleteDeck, draftDeck, listAdminDecks, listPublishedDecks, publishDeck, reorderDecks, updateDeck } from '../controllers/decks.controller';
import {
  createGlossaryTerm,
  deleteGlossaryTerm,
  listAdminGlossary,
  listPublishedGlossary,
  updateGlossaryTerm,
} from '../controllers/glossary.controller';
import { sendAdminNotification } from '../controllers/notifications.controller';
import { uploadAdminFile } from '../controllers/uploads.controller';
import {
  createFlashcard,
  deleteFlashcard,
  updateFlashcard,
  draftFlashcards,
  draftFlashcardsByCategory,
  listAdminFlashcardsByCategory,
  listAdminFlashcardsByDeck,
  listPublishedFlashcardsByCategory,
  listPublishedFlashcardsByDeck,
  publishFlashcards,
  publishFlashcardsByCategory,
} from '../controllers/flashcards.controller';
import {
  listReinforcementCardsByCategory,
  listReinforcementCardsByDeck,
  recordCardAnswer,
  resetProgressByCategory,
  resetProgressByDeck,
} from '../controllers/progress.controller';
import { checkAuth } from '../middlewares/authMiddleware';
import { uploadSingleImage } from '../middlewares/uploadMiddleware';

const router = Router();

router.get('/glossary', listPublishedGlossary);
router.get('/decks', listPublishedDecks);
router.get('/decks/:deckId/categories', listPublishedCategoriesByDeck);
router.get('/decks/:deckId/categories/:categoryId/flashcards', listPublishedFlashcardsByCategory);
router.get('/decks/:deckId/flashcards', listPublishedFlashcardsByDeck);

router.post('/progress/cards/:cardId', checkAuth(), recordCardAnswer);
router.get(
  '/progress/decks/:deckId/categories/:categoryId/reinforcement',
  checkAuth(),
  listReinforcementCardsByCategory
);
router.get('/progress/decks/:deckId/reinforcement', checkAuth(), listReinforcementCardsByDeck);
router.delete(
  '/progress/decks/:deckId/categories/:categoryId',
  checkAuth(),
  resetProgressByCategory
);
router.delete('/progress/decks/:deckId', checkAuth(), resetProgressByDeck);

router.post('/admin/uploads', checkAuth('admin'), uploadSingleImage(), uploadAdminFile);
router.post('/admin/notifications', checkAuth('admin'), sendAdminNotification);
router.get('/admin/glossary', checkAuth('admin'), listAdminGlossary);
router.post('/admin/glossary', checkAuth('admin'), createGlossaryTerm);
router.put('/admin/glossary/:id', checkAuth('admin'), updateGlossaryTerm);
router.delete('/admin/glossary/:id', checkAuth('admin'), deleteGlossaryTerm);

router.post('/admin/decks', checkAuth('admin'), createDeck);
router.get('/admin/decks', checkAuth('admin'), listAdminDecks);
router.post('/admin/flashcards', checkAuth('admin'), createFlashcard);
router.put('/admin/flashcards/:id', checkAuth('admin'), updateFlashcard);
router.delete('/admin/flashcards/:id', checkAuth('admin'), deleteFlashcard);

router.post('/admin/decks/:deckId/categories', checkAuth('admin'), createCategory);
router.get('/admin/decks/:deckId/categories', checkAuth('admin'), listAdminCategoriesByDeck);
router.put('/admin/decks/:deckId/categories/publish', checkAuth('admin'), publishCategories);
router.put('/admin/decks/:deckId/categories/draft', checkAuth('admin'), draftCategories);
router.put('/admin/decks/:deckId/categories/:categoryId/publish', checkAuth('admin'), publishCategory);
router.put('/admin/decks/:deckId/categories/:categoryId/draft', checkAuth('admin'), draftCategory);
router.put('/admin/decks/:deckId/categories/:categoryId', checkAuth('admin'), updateCategory);
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

router.put('/admin/decks/reorder', checkAuth('admin'), reorderDecks);
router.put('/admin/decks/:id/publish', checkAuth('admin'), publishDeck);
router.put('/admin/decks/:id/draft', checkAuth('admin'), draftDeck);
router.put('/admin/decks/:id', checkAuth('admin'), updateDeck);
router.delete('/admin/decks/:id', checkAuth('admin'), deleteDeck);

export default router;
