import { useState, useMemo } from 'react';
import { Search, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import type { LegacyQuestion, Deck, Flashcard } from '../../types/index';

export interface QuestionSearchPanelProps {
  examId: string;
  questions: LegacyQuestion[];
  decks: Deck[];
  flashcards: Flashcard[];
  onCardAdded: (card: Flashcard) => void;
  onCreateDeck: (name: string) => Deck;
}

export const QuestionSearchPanel = ({
  examId: _examId,
  questions,
  decks,
  flashcards,
  onCardAdded,
  onCreateDeck,
}: QuestionSearchPanelProps) => {
  const [query, setQuery] = useState('');
  const [addedToast, setAddedToast] = useState<string | null>(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [showNewDeckFor, setShowNewDeckFor] = useState<number | null>(null);
  const [targetDeckId, setTargetDeckId] = useState<string>('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return questions
      .map((question, idx) => ({ question, idx }))
      .filter(({ question }) =>
        words.every(w => question.question.toLowerCase().includes(w))
      )
      .slice(0, 20);
  }, [query, questions]);

  const addedQuestions = useMemo(() => {
    const map = new Map<string, string[]>();
    flashcards.forEach(f => {
      // Skip legacy/synthetic flashcards that don't belong to user-created decks
      if (f.deckId.startsWith('legacy-') || f.deckId === '__all_questions__') return;
      const deckName = decks.find(d => d.id === f.deckId)?.name;
      if (!deckName) return; // skip if deck not found (orphaned flashcard)
      const existing = map.get(f.front) ?? [];
      existing.push(deckName);
      map.set(f.front, existing);
    });
    return map;
  }, [flashcards, decks]);

  function showToast(msg: string) {
    setAddedToast(msg);
    setTimeout(() => setAddedToast(null), 2500);
  }

  function addToDeck(question: LegacyQuestion, deckId: string) {
    const deck = decks.find(d => d.id === deckId);
    if (!deck) return;
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
    onCardAdded(card);
    showToast(`Added to "${deck.name}"`);
  }

  function handleCreateDeckAndAdd(question: LegacyQuestion) {
    const name = newDeckName.trim();
    if (!name) return;
    const deck = onCreateDeck(name);
    setNewDeckName('');
    setShowNewDeckFor(null);
    addToDeck(question, deck.id);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search exam questions to add to a deck…"
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          aria-label="Search exam questions"
        />
      </div>

      {addedToast && (
        <div role="status" aria-live="polite" className="px-3 py-2 rounded-lg bg-green-900/30 border border-green-700 text-green-200 text-xs text-center">
          {addedToast}
        </div>
      )}

      {query.trim() && results.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">No questions match your search.</p>
      )}

      {results.length > 0 && (
        <ul className="space-y-2" role="list">
          {results.map(({ question, idx }) => {
            const inDecks = addedQuestions.get(question.question) ?? [];
            const alreadyInTarget = targetDeckId
              ? flashcards.some(f => f.front === question.question && f.deckId === targetDeckId)
              : false;
            const isExpanded = showNewDeckFor === idx;
            return (
              <li key={idx} className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3 space-y-2">
                <p className="text-sm text-gray-200 leading-snug">{question.question}</p>
                {question.domain && (
                  <span className="inline-block text-xs text-gray-500 bg-gray-800 rounded px-2 py-0.5">
                    {question.domain}
                  </span>
                )}
                {inDecks.length > 0 && (
                  <p className="text-xs text-green-500">In: {inDecks.join(', ')}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {decks.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={targetDeckId}
                        onChange={e => setTargetDeckId(e.target.value)}
                        className="text-xs rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1 focus:outline-none focus:border-blue-500"
                        aria-label="Select deck"
                      >
                        <option value="">Pick a deck…</option>
                        {decks.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <Button size="sm" disabled={!targetDeckId || alreadyInTarget} onClick={() => addToDeck(question, targetDeckId)} className="text-xs h-7 px-2">
                        {alreadyInTarget ? 'Already added' : 'Add'}
                      </Button>
                    </div>
                  )}
                  <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => setShowNewDeckFor(isExpanded ? null : idx)}>
                    <Plus className="w-3 h-3 mr-1" />
                    New Deck
                  </Button>
                </div>
                {isExpanded && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={newDeckName}
                      onChange={e => setNewDeckName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateDeckAndAdd(question); }}
                      placeholder="Deck name…"
                      className="flex-1 text-xs rounded border border-gray-700 bg-gray-800 text-gray-200 px-2 py-1 focus:outline-none focus:border-blue-500"
                      autoFocus
                      aria-label="New deck name"
                    />
                    <Button size="sm" disabled={!newDeckName.trim()} onClick={() => handleCreateDeckAndAdd(question)} className="text-xs h-7 px-2">
                      Create & Add
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!query.trim() && (
        <p className="text-xs text-gray-600 text-center py-2">
          Type to search through {questions.length} questions in this exam.
        </p>
      )}
    </div>
  );
};
