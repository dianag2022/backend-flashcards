import { Router } from 'express';
import { createDeck, listPublishedDecks, publishDeck } from '../controllers/decks.controller';
import {
  createFlashcard,
  listPublishedFlashcardsByDeck,
} from '../controllers/flashcards.controller';
import { checkAuth } from '../middlewares/authMiddleware';

const router = Router();

router.get('/decks', listPublishedDecks);
router.get('/decks/:deckId/flashcards', listPublishedFlashcardsByDeck);

router.post('/admin/decks', checkAuth('admin'), createDeck);
router.post('/admin/flashcards', checkAuth('admin'), createFlashcard);
router.put('/admin/decks/:id/publish', checkAuth('admin'), publishDeck);

export default router;
