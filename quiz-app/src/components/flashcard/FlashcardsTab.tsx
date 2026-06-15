import { useState, useEffect, useMemo } from 'react';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { ArrowLeft, PlayCircle, Plus, Trash2, CheckCircle, BookOpen, Star, Target } from 'lucide-react';
import type { LegacyQuestion, Deck, Flashcard, QuestionStudyState } from '../../types/index';
import { StorageService } from '../../services/storage';
import { isDue, sortByDueFirst } from '../../services/spacedRepetition';
import {
  getExamStudyState,
  rateQuestion,
  toggleStar,
  countStudyState,
  indexByQuestionId,
  migrateAutoDecksForExam,
  getPracticeIncorrectIds,
} from '../../services/studyState';
import { FlashcardViewer } from './FlashcardViewer';
import { QuestionSearchPanel } from './QuestionSearchPanel';

const ALL_QUESTIONS_DECK_ID = '__all_questions__';
// Virtual study-state views (filtered over the exam bank, not stored decks).
const KNOWN_VIEW_ID = '__view_known__';
const LEARNING_VIEW_ID = '__view_learning__';
const STARRED_VIEW_ID = '__view_starred__';
const INCORRECT_VIEW_ID = '__view_incorrect__';
type ViewId = typeof ALL_QUESTIONS_DECK_ID | typeof KNOWN_VIEW_ID | typeof LEARNING_VIEW_ID | typeof STARRED_VIEW_ID | typeof INCORRECT_VIEW_ID;

export interface FlashcardsTabProps {
  examId: string;
  legacyQuestions: LegacyQuestion[];
  shuffleLegacy: () => void;
}

export const FlashcardsTab = ({ examId, legacyQuestions, shuffleLegacy }: FlashcardsTabProps) => {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [studyState, setStudyState] = useState<QuestionStudyState[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [deckView, setDeckView] = useState<'manage' | 'review'>('manage');
  const [manageView, setManageView] = useState<'decks' | 'search'>('decks');

  const [showNewDeckForm, setShowNewDeckForm] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [renameDeckName, setRenameDeckName] = useState('');
  const [pendingDeleteDeckId, setPendingDeleteDeckId] = useState<string | null>(null);

  useEffect(() => {
    const allDecks = StorageService.getDecks().filter(d => d.examIds.includes(examId));
    const allCards = StorageService.getFlashcards();

    // One-time migration: fold legacy __known__/__learning__ auto-deck cards for
    // this exam into per-question study state, then drop those cards.
    const existingState = StorageService.getStudyState();
    const { merged, consumedCardIds, migratedCount } = migrateAutoDecksForExam(
      examId, legacyQuestions, allCards, existingState,
    );
    let cards = allCards;
    if (migratedCount > 0 || consumedCardIds.length > 0) {
      StorageService.saveStudyState(merged);
      cards = allCards.filter(c => !consumedCardIds.includes(c.id));
      StorageService.saveFlashcards(cards);
    }

    setDecks(allDecks);
    setFlashcards(cards);
    setStudyState(getExamStudyState(examId));
    setSelectedDeckId(null);
    setDeckView('manage');
    setManageView('decks');
    setShowNewDeckForm(false);
  }, [examId, legacyQuestions]);

  const selectedDeck = decks.find(d => d.id === selectedDeckId) ?? null;

  // Study-state counts for the view chips.
  const counts = useMemo(
    () => countStudyState(
      legacyQuestions.map(q => q.id).filter((id): id is number => typeof id === 'number'),
      studyState,
    ),
    [legacyQuestions, studyState],
  );

  // Practice-Incorrect source: still-learning ∪ missed-in-quiz-history (§3.2).
  // Restricted to ids present in the current bank.
  const practiceIncorrectIds = useMemo(() => {
    const bankIds = new Set(
      legacyQuestions.map(q => q.id).filter((id): id is number => typeof id === 'number'),
    );
    return new Set(getPracticeIncorrectIds(examId).filter(id => bankIds.has(id)));
    // studyState is included so the view refreshes after ratings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, legacyQuestions, studyState]);

  // ── Deck CRUD ─────────────────────────────────────────────────────────────

  function createDeck(name: string): Deck {
    const deck: Deck = {
      id: crypto.randomUUID(),
      name,
      examIds: [examId],
      createdAt: new Date().toISOString(),
    };
    const allDecks = StorageService.getDecks();
    StorageService.saveDecks([...allDecks, deck]);
    setDecks(prev => [...prev, deck]);
    return deck;
  }

  function handleCreateDeck() {
    const name = newDeckName.trim();
    if (!name) return;
    createDeck(name);
    setNewDeckName('');
    setShowNewDeckForm(false);
  }

  function handleRenameDeck(deckId: string) {
    const name = renameDeckName.trim();
    if (!name) return;
    const allDecks = StorageService.getDecks();
    const updated = allDecks.map(d => d.id === deckId ? { ...d, name } : d);
    StorageService.saveDecks(updated);
    setDecks(updated.filter(d => d.examIds.includes(examId)));
    setRenamingDeckId(null);
  }

  function handleDeleteDeck(deckId: string) {
    const allDecks = StorageService.getDecks().filter(d => d.id !== deckId);
    const allCards = StorageService.getFlashcards().filter(f => f.deckId !== deckId);
    StorageService.saveDecks(allDecks);
    StorageService.saveFlashcards(allCards);
    setDecks(allDecks.filter(d => d.examIds.includes(examId)));
    setFlashcards(allCards);
    if (selectedDeckId === deckId) { setSelectedDeckId(null); setDeckView('manage'); }
    setPendingDeleteDeckId(null);
  }

  // ── Card CRUD (custom decks only) ─────────────────────────────────────────

  function handleCardAdded(card: Flashcard) {
    const allCards = StorageService.getFlashcards();
    StorageService.saveFlashcards([...allCards, card]);
    setFlashcards(prev => [...prev, card]);
  }

  function handleSaveCardToDeck(question: LegacyQuestion, deckId: string): boolean {
    const alreadyExists = flashcards.some(f => f.front === question.question && f.deckId === deckId);
    if (alreadyExists) return false;
    const correctText = question.correctAnswers.map(i => question.options[i]).join(' / ');
    const card: Flashcard = {
      id: crypto.randomUUID(),
      deckId,
      front: question.question,
      back: correctText,
      masteryLevel: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    handleCardAdded(card);
    return true;
  }

  // ── Study-state writes (rating + star) ────────────────────────────────────

  function handleCardRated(question: LegacyQuestion, known: boolean) {
    if (typeof question.id !== 'number') return; // study state keys on id
    rateQuestion(examId, question.id, known);
    setStudyState(getExamStudyState(examId));
  }

  function handleToggleStar(question: LegacyQuestion) {
    if (typeof question.id !== 'number') return;
    toggleStar(examId, question.id);
    setStudyState(getExamStudyState(examId));
  }

  // ── Convert custom-deck Flashcard[] → LegacyQuestion[] for FlashcardViewer ──
  function toViewerQuestions(cards: Flashcard[]): LegacyQuestion[] {
    const bankMap = new Map(legacyQuestions.map(q => [q.question, q]));
    return cards.map(c => {
      const bankQ = bankMap.get(c.front);
      return {
        id: bankQ?.id,
        question: c.front,
        options: bankQ ? bankQ.options : [c.back],
        correctAnswers: bankQ ? bankQ.correctAnswers : [0],
        explanation: bankQ?.explanation ?? '',
        domain: bankQ?.domain,
      };
    });
  }

  // ── Build the question list for a study-state view ─────────────────────────
  function questionsForView(view: ViewId): LegacyQuestion[] {
    if (view === ALL_QUESTIONS_DECK_ID) return legacyQuestions;
    const byId = indexByQuestionId(studyState);
    return legacyQuestions.filter(q => {
      if (typeof q.id !== 'number') return false;
      const rec = byId.get(q.id);
      if (view === STARRED_VIEW_ID) return !!rec?.starred;
      if (view === KNOWN_VIEW_ID) return rec?.status === 'known';
      if (view === LEARNING_VIEW_ID) return rec?.status === 'still-learning';
      if (view === INCORRECT_VIEW_ID) return practiceIncorrectIds.has(q.id);
      return false;
    });
  }

  const isViewId = (id: string | null): id is ViewId =>
    id === ALL_QUESTIONS_DECK_ID || id === KNOWN_VIEW_ID || id === LEARNING_VIEW_ID || id === STARRED_VIEW_ID || id === INCORRECT_VIEW_ID;

  // ── Review view ───────────────────────────────────────────────────────────

  if (deckView === 'review' && (selectedDeck || isViewId(selectedDeckId))) {
    const viewId = isViewId(selectedDeckId) ? selectedDeckId : null;

    let viewerQuestions: LegacyQuestion[];
    let reviewDeckName: string;
    let reviewDeckId: string;
    let starredSet: Set<number> | undefined;

    if (viewId) {
      viewerQuestions = questionsForView(viewId);
      reviewDeckName = viewId === ALL_QUESTIONS_DECK_ID ? 'All Exam Questions'
        : viewId === KNOWN_VIEW_ID ? '✓ Known'
        : viewId === LEARNING_VIEW_ID ? '📖 Still Learning'
        : viewId === INCORRECT_VIEW_ID ? '🎯 Practice Incorrect'
        : '⭐ Starred';
      reviewDeckId = 'legacy';
      const byId = indexByQuestionId(studyState);
      starredSet = new Set(viewerQuestions.filter(q => byId.get(q.id as number)?.starred).map(q => q.id as number));
    } else {
      const reviewCards = sortByDueFirst(flashcards.filter(f => f.deckId === selectedDeckId));
      viewerQuestions = toViewerQuestions(reviewCards);
      reviewDeckName = selectedDeck!.name;
      reviewDeckId = selectedDeckId!;
      const byId = indexByQuestionId(studyState);
      starredSet = new Set(viewerQuestions.filter(q => typeof q.id === 'number' && byId.get(q.id)?.starred).map(q => q.id as number));
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDeckView('manage')} aria-label="Back to deck management">
            <ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" />
            Back
          </Button>
          <span className="text-sm text-gray-400">
            Reviewing: <strong className="text-gray-200">{reviewDeckName}</strong>
          </span>
        </div>
        {viewerQuestions.length > 0 ? (
          <FlashcardViewer
            questions={viewerQuestions}
            shuffleQuestions={viewId === ALL_QUESTIONS_DECK_ID ? shuffleLegacy : () => {}}
            decks={decks}
            onSaveCardToDeck={handleSaveCardToDeck}
            onCreateDeck={createDeck}
            deckId={reviewDeckId}
            onCardRated={handleCardRated}
            onToggleStar={handleToggleStar}
            starredIds={starredSet}
          />
        ) : (
          <div className="py-10 text-center text-gray-500 text-sm">
            No questions in this view yet. Rate or star questions while studying to populate it.
          </div>
        )}
      </div>
    );
  }

  // ── Manage view ───────────────────────────────────────────────────────────

  const manageNavBtn = (view: 'decks' | 'search', label: string) => (
    <button
      onClick={() => setManageView(view)}
      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
        manageView === view ? 'bg-gray-700 text-gray-100' : 'text-gray-400 hover:text-gray-200'
      }`}
    >
      {label}
    </button>
  );

  const startReview = (id: ViewId) => { setSelectedDeckId(id); setDeckView('review'); };

  const customDecks = decks; // auto-decks no longer stored; all stored decks are custom

  return (
    <div className="space-y-4">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 border-b border-gray-800 pb-2">
        {manageNavBtn('decks', 'My Decks')}
        {manageNavBtn('search', 'Add from Exam Bank')}
      </div>

      {/* ── Decks view ── */}
      {manageView === 'decks' && (
        <div className="space-y-3">
          {/* Study-state views (filtered over the exam bank) */}
          <ul className="space-y-2" role="list">
            {legacyQuestions.length > 0 && (
              <li className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-200">All Exam Questions</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {legacyQuestions.length} card{legacyQuestions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => startReview(ALL_QUESTIONS_DECK_ID)}
                    className="text-xs h-7 px-2 shrink-0"
                    aria-label="Start review for All Exam Questions"
                  >
                    <PlayCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                    Review
                  </Button>
                </div>
              </li>
            )}

            {([
              { id: INCORRECT_VIEW_ID, name: 'Practice Incorrect', icon: <Target className="w-3.5 h-3.5" />, color: 'text-red-400', count: practiceIncorrectIds.size },
              { id: KNOWN_VIEW_ID, name: 'Known', icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'text-green-400', count: counts.known },
              { id: LEARNING_VIEW_ID, name: 'Still Learning', icon: <BookOpen className="w-3.5 h-3.5" />, color: 'text-yellow-400', count: counts.stillLearning },
              { id: STARRED_VIEW_ID, name: 'Starred', icon: <Star className="w-3.5 h-3.5" />, color: 'text-amber-400', count: counts.starred },
            ] as const).map(view => (
              <li key={view.id} className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className={`text-sm font-medium flex items-center gap-1.5 ${view.color}`}>
                      {view.icon}{view.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {view.count} question{view.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button
                    size="sm" variant="outline"
                    onClick={() => startReview(view.id)}
                    disabled={view.count === 0}
                    className="text-xs h-7 px-2 shrink-0"
                    aria-label={`Start review for ${view.name}`}
                  >
                    <PlayCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                    Review
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {/* Custom decks */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-gray-400">
              {customDecks.length} custom deck{customDecks.length !== 1 ? 's' : ''}
            </span>
            {!showNewDeckForm && (
              <Button size="sm" onClick={() => setShowNewDeckForm(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                New Deck
              </Button>
            )}
          </div>

          {showNewDeckForm && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newDeckName}
                onChange={e => setNewDeckName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateDeck();
                  if (e.key === 'Escape') { setShowNewDeckForm(false); setNewDeckName(''); }
                }}
                placeholder="Deck name…"
                className="flex-1 text-sm rounded border border-gray-700 bg-gray-800 text-gray-200 px-3 py-1.5 focus:outline-none focus:border-blue-500"
                autoFocus
                aria-label="New deck name"
              />
              <Button size="sm" disabled={!newDeckName.trim()} onClick={handleCreateDeck}>Create</Button>
              <Button size="sm" variant="outline" onClick={() => { setShowNewDeckForm(false); setNewDeckName(''); }}>Cancel</Button>
            </div>
          )}

          <ul className="space-y-2" role="list">
            {customDecks.map(deck => {
              const count = flashcards.filter(f => f.deckId === deck.id).length;
              const dueCount = flashcards.filter(f => f.deckId === deck.id && isDue(f)).length;
              const isRenaming = renamingDeckId === deck.id;
              return (
                <li key={deck.id} className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3">
                  {isRenaming ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={renameDeckName}
                        onChange={e => setRenameDeckName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleRenameDeck(deck.id);
                          if (e.key === 'Escape') setRenamingDeckId(null);
                        }}
                        className="flex-1 text-sm rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1 focus:outline-none focus:border-blue-500"
                        autoFocus
                        aria-label="Rename deck"
                      />
                      <Button size="sm" disabled={!renameDeckName.trim()} onClick={() => handleRenameDeck(deck.id)} className="text-xs h-7 px-2">Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setRenamingDeckId(null)} className="text-xs h-7 px-2">Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-200">{deck.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {count} card{count !== 1 ? 's' : ''}
                          {dueCount > 0 && (
                            <> · <span className="text-xs text-orange-400">{dueCount} due</span></>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {count > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setSelectedDeckId(deck.id); setDeckView('review'); }}
                            className="text-xs h-7 px-2"
                            aria-label={`Start review for ${deck.name}`}
                          >
                            <PlayCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                            Review
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setRenamingDeckId(deck.id); setRenameDeckName(deck.name); }}
                          className="text-xs h-7 px-2 text-gray-400 hover:text-gray-200"
                          aria-label={`Rename ${deck.name}`}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setPendingDeleteDeckId(deck.id)}
                          className="text-xs h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          aria-label={`Delete ${deck.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Add from Exam Bank view ── */}
      {manageView === 'search' && (
        <QuestionSearchPanel
          examId={examId}
          questions={legacyQuestions}
          decks={decks}
          flashcards={flashcards}
          onCardAdded={handleCardAdded}
          onCreateDeck={createDeck}
        />
      )}

      {/* Deck delete confirmation */}
      <Modal
        isOpen={pendingDeleteDeckId !== null}
        title="Delete Deck"
        message="Delete this deck and all its cards? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => pendingDeleteDeckId && handleDeleteDeck(pendingDeleteDeckId)}
        onCancel={() => setPendingDeleteDeckId(null)}
      />
    </div>
  );
};
