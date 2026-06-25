import { Router } from 'express';
import { createDeck, draftDeck, listPublishedDecks, publishDeck } from '../controllers/decks.controller';
import {
  createFlashcard,
  draftFlashcards,
  listAdminFlashcardsByDeck,
  listPublishedFlashcardsByDeck,
  publishFlashcards,
} from '../controllers/flashcards.controller';
import { checkAuth } from '../middlewares/authMiddleware';

const router = Router();

router.get('/decks', listPublishedDecks);
router.get('/decks/:deckId/flashcards', listPublishedFlashcardsByDeck);

router.post('/admin/decks', checkAuth('admin'), createDeck);
router.post('/admin/flashcards', checkAuth('admin'), createFlashcard);
router.get('/admin/decks/:deckId/flashcards', checkAuth('admin'), listAdminFlashcardsByDeck);
router.put('/admin/decks/:deckId/flashcards/publish', checkAuth('admin'), publishFlashcards);
router.put('/admin/decks/:deckId/flashcards/draft', checkAuth('admin'), draftFlashcards);
router.put('/admin/decks/:id/publish', checkAuth('admin'), publishDeck);
router.put('/admin/decks/:id/draft', checkAuth('admin'), draftDeck);

export default router;
