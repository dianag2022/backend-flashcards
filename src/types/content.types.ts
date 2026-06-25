export type ContentStatus = 'draft' | 'published';

export interface Deck {
  id: string;
  title: string;
  description: string;
  status: ContentStatus;
  cardCount: number;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  deckId: string;
  front: string;
  back: string;
  status: ContentStatus;
  createdAt: string;
}

export interface CreateDeckBody {
  title: string;
  description: string;
}

export interface CreateFlashcardBody {
  deckId: string;
  front: string;
  back: string;
}

export interface UpdateFlashcardsStatusBody {
  flashcardIds: string[];
}

export interface DraftDeckResponse {
  deck: Deck;
  flashcardsDrafted: number;
}
