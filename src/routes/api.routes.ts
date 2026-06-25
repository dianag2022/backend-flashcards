import { Router } from 'express';
import { createDeck, deleteDeck, draftDeck, listPublishedDecks, publishDeck } from '../controllers/decks.controller';
import {
  createFlashcard,
  deleteFlashcard,
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
router.delete('/admin/flashcards/:id', checkAuth('admin'), deleteFlashcard);
router.get('/admin/decks/:deckId/flashcards', checkAuth('admin'), listAdminFlashcardsByDeck);
router.put('/admin/decks/:deckId/flashcards/publish', checkAuth('admin'), publishFlashcards);
router.put('/admin/decks/:deckId/flashcards/draft', checkAuth('admin'), draftFlashcards);
router.put('/admin/decks/:id/publish', checkAuth('admin'), publishDeck);
router.put('/admin/decks/:id/draft', checkAuth('admin'), draftDeck);
router.delete('/admin/decks/:id', checkAuth('admin'), deleteDeck);

export default router;
