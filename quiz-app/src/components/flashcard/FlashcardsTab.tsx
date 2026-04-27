import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { ArrowLeft, PlayCircle, Plus, Trash2 } from 'lucide-react';
import type { LegacyQuestion, Deck, Flashcard } from '../../types/index';
import { StorageService } from '../../services/storage';
import { isDue, sortByDueFirst } from '../../services/spacedRepetition';
import { FlashcardViewer } from './FlashcardViewer';
import { QuestionSearchPanel } from './QuestionSearchPanel';

const ALL_QUESTIONS_DECK_ID = '__all_questions__';

export interface FlashcardsTabProps {
  examId: string;
  legacyQuestions: LegacyQuestion[];
  shuffleLegacy: () => void;
}

export const FlashcardsTab = ({ examId, legacyQuestions, shuffleLegacy }: FlashcardsTabProps) => {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
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
    setDecks(allDecks);
    setFlashcards(allCards);
    setSelectedDeckId(null);
    setDeckView('manage');
    setManageView('decks');
    setShowNewDeckForm(false);
  }, [examId]);

  const selectedDeck = decks.find(d => d.id === selectedDeckId) ?? null;

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

  // ── Card CRUD ─────────────────────────────────────────────────────────────

  function handleCardAdded(card: Flashcard) {
    const allCards = StorageService.getFlashcards();
    StorageService.saveFlashcards([...allCards, card]);
    setFlashcards(prev => [...prev, card]);
  }

  // ── Auto-decks: "Known" and "Still Learning" ──────────────────────────────

  const KNOWN_DECK_PREFIX = '__known__';
  const LEARNING_DECK_PREFIX = '__learning__';
  const knownDeckId = `${KNOWN_DECK_PREFIX}${examId}`;
  const learningDeckId = `${LEARNING_DECK_PREFIX}${examId}`;

  function getOrCreateAutoDeck(id: string, name: string): Deck {
    const allDecks = StorageService.getDecks();
    let deck = allDecks.find(d => d.id === id);
    if (!deck) {
      deck = { id, name, examIds: [examId], createdAt: new Date().toISOString() };
      StorageService.saveDecks([...allDecks, deck]);
      setDecks(prev => [...prev, deck!]);
    }
    return deck;
  }

  function handleCardRated(question: LegacyQuestion, known: boolean) {
    const targetDeckId = known ? knownDeckId : learningDeckId;
    const otherDeckId = known ? learningDeckId : knownDeckId;
    const targetName = known ? '✓ Known' : '📖 Still Learning';

    getOrCreateAutoDeck(targetDeckId, targetName);

    const allCards = StorageService.getFlashcards();

    // Remove from the other auto-deck if present
    const filtered = allCards.filter(
      c => !(c.front === question.question && c.deckId === otherDeckId)
    );

    // Check if already in target deck
    const alreadyInTarget = filtered.some(
      c => c.front === question.question && c.deckId === targetDeckId
    );

    let updatedCards = filtered;
    if (!alreadyInTarget) {
      const correctText = question.correctAnswers.map(i => question.options[i]).join(' / ');
      const newCard: Flashcard = {
        id: crypto.randomUUID(),
        deckId: targetDeckId,
        front: question.question,
        back: correctText,
        masteryLevel: known ? 1 : 0,
        lastReviewedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      updatedCards = [...filtered, newCard];
    }

    StorageService.saveFlashcards(updatedCards);
    setFlashcards(updatedCards);
  }

  // ── Save card to deck ─────────────────────────────────────────────────────
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

  // ── Convert Flashcard[] → LegacyQuestion[] for FlashcardViewer ───────────
  function toViewerQuestions(cards: Flashcard[]): LegacyQuestion[] {
    const bankMap = new Map(legacyQuestions.map(q => [q.question, q]));
    return cards.map(c => {
      const bankQ = bankMap.get(c.front);
      return {
        question: c.front,
        options: bankQ ? bankQ.options : [c.back],
        correctAnswers: bankQ ? bankQ.correctAnswers : [0],
        explanation: bankQ?.explanation ?? '',
        domain: bankQ?.domain,
      };
    });
  }

  // ── Review view ───────────────────────────────────────────────────────────

  if (deckView === 'review' && (selectedDeck || selectedDeckId === ALL_QUESTIONS_DECK_ID || selectedDeckId === knownDeckId || selectedDeckId === learningDeckId)) {
    const isAllQuestionsDeck = selectedDeckId === ALL_QUESTIONS_DECK_ID;
    const isAutoDeck = selectedDeckId === knownDeckId || selectedDeckId === learningDeckId;
    const reviewCards = isAllQuestionsDeck ? [] : flashcards.filter(f => f.deckId === selectedDeckId);
    const sortedCards = isAutoDeck ? reviewCards : sortByDueFirst(reviewCards);
    const viewerQuestions = isAllQuestionsDeck ? legacyQuestions : toViewerQuestions(sortedCards);
    const reviewDeckName = isAllQuestionsDeck ? 'All Exam Questions'
      : selectedDeckId === knownDeckId ? '✓ Known'
      : selectedDeckId === learningDeckId ? '📖 Still Learning'
      : selectedDeck!.name;
    const reviewDeckId = isAllQuestionsDeck ? 'legacy' : selectedDeckId!;

    // Build flashcard map for mastery tracking — for custom and auto decks
    const flashcardMap = isAllQuestionsDeck
      ? undefined
      : new Map<string, { id: string; masteryLevel: number }>(
          sortedCards.map(c => [c.front, { id: c.id, masteryLevel: c.masteryLevel }])
        );

    function handleUpdateMastery(flashcardId: string, known: boolean) {
      const allCards = StorageService.getFlashcards();
      const card = allCards.find(c => c.id === flashcardId);
      if (!card) return;
      
      const updated = allCards.map(c => 
        c.id === flashcardId 
          ? { 
              ...c, 
              masteryLevel: known ? c.masteryLevel + 1 : 0,
              lastReviewedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : c
      );
      StorageService.saveFlashcards(updated);
      setFlashcards(updated);
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
            shuffleQuestions={isAllQuestionsDeck ? shuffleLegacy : () => {}}
            decks={decks}
            onSaveCardToDeck={handleSaveCardToDeck}
            onCreateDeck={createDeck}
            flashcardMap={flashcardMap}
            onUpdateMastery={isAllQuestionsDeck ? undefined : handleUpdateMastery}
            deckId={reviewDeckId}
            onCardRated={handleCardRated}
          />
        ) : (
          <div className="py-10 text-center text-gray-500 text-sm">
            This deck has no cards yet. Use "Add from Exam Bank" to populate it.
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">{decks.length} deck{decks.length !== 1 ? 's' : ''}</span>
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
            {/* Virtual "All Exam Questions" deck — always shown at the top */}
            {legacyQuestions.length > 0 && (
              <li className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-200">All Exam Questions</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {legacyQuestions.length} card{legacyQuestions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setSelectedDeckId(ALL_QUESTIONS_DECK_ID); setDeckView('review'); }}
                      className="text-xs h-7 px-2"
                      aria-label="Start review for All Exam Questions"
                    >
                      <PlayCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                      Review
                    </Button>
                  </div>
                </div>
              </li>
            )}

            {/* Auto-decks: Known and Still Learning */}
            {[
              { id: knownDeckId, name: '✓ Known', color: 'text-green-400' },
              { id: learningDeckId, name: '📖 Still Learning', color: 'text-yellow-400' },
            ].map(autoDeck => {
              const count = flashcards.filter(f => f.deckId === autoDeck.id).length;
              if (count === 0) return null;
              return (
                <li key={autoDeck.id} className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className={`text-sm font-medium ${autoDeck.color}`}>{autoDeck.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {count} card{count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setSelectedDeckId(autoDeck.id); setDeckView('review'); }}
                        className="text-xs h-7 px-2"
                        aria-label={`Start review for ${autoDeck.name}`}
                      >
                        <PlayCircle className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                        Review
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}

            {/* Custom decks */}
            {decks.filter(d => d.id !== knownDeckId && d.id !== learningDeckId).map(deck => {
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
