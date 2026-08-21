import { Flashcard } from './content.types';

export type CardAnswerResult = 'correct' | 'incorrect';

export interface UserCardProgress {
  cardId: string;
  deckId: string;
  categoryId: string;
  lastResult: CardAnswerResult;
  correctStreak: number;
  lastAttemptAt: string;
  mastered: boolean;
}

export interface RecordCardAnswerBody {
  result: CardAnswerResult;
}

export interface UserCardProgressResponse {
  progress: UserCardProgress;
}

export interface ReinforcementCard {
  flashcard: Flashcard;
  progress: UserCardProgress;
}

export interface ReinforcementCardsResponse {
  cards: ReinforcementCard[];
}

export interface ResetProgressResponse {
  message: string;
  deckId: string;
  categoryId?: string;
  progressDeleted: number;
}