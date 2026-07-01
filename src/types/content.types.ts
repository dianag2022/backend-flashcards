export type ContentStatus = 'draft' | 'published';

export interface Deck {
  id: string;
  title: string;
  description: string;
  status: ContentStatus;
  cardCount: number;
  updatedAt: string;
}

export interface Category {
  id: string;
  deckId: string;
  title: string;
  description: string;
  status: ContentStatus;
  cardCount: number;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  deckId: string;
  categoryId: string;
  front: string;
  back: string;
  status: ContentStatus;
  createdAt: string;
}

export interface CreateDeckBody {
  title: string;
  description: string;
}

export interface UpdateDeckBody {
  title: string;
  description: string;
}

export interface CreateCategoryBody {
  title: string;
  description: string;
}

export interface CreateFlashcardBody {
  deckId: string;
  categoryId: string;
  front: string;
  back: string;
}

export interface UpdateFlashcardsStatusBody {
  flashcardIds: string[];
}

export interface UpdateCategoriesStatusBody {
  categoryIds: string[];
}

export interface DraftDeckResponse {
  deck: Deck;
  categoriesDrafted: number;
  flashcardsDrafted: number;
}

export interface DeleteDeckResponse {
  message: string;
  deckId: string;
  categoriesDeleted: number;
  flashcardsDeleted: number;
}

export interface DeleteCategoryResponse {
  message: string;
  categoryId: string;
  flashcardsDeleted: number;
}

export interface DeleteFlashcardResponse {
  message: string;
  flashcardId: string;
}

export interface DraftCategoryResponse {
  category: Category;
  flashcardsDrafted: number;
}
