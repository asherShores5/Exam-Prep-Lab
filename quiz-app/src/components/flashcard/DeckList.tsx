/**
 * DeckList — displays all decks for the current exam with select, edit, and
 * delete actions. Delete is confirmed via a Modal with variant="danger".
 */

import { useState } from 'react';
import { Button } from '../ui/button';
import { Modal } from '../ui/Modal';
import { Pencil, Trash2, ChevronRight } from 'lucide-react';
import type { Deck, Flashcard } from '../../types/index';

interface DeckListProps {
  decks: Deck[];
  flashcards: Flashcard[];
  selectedDeckId: string | null;
  onSelect: (id: string) => void;
  onEdit: (deck: Deck) => void;
  onDelete: (id: string) => void;
}

export function DeckList({
  decks,
  flashcards,
  selectedDeckId,
  onSelect,
  onEdit,
  onDelete,
}: DeckListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const pendingDeck = decks.find(d => d.id === pendingDeleteId);

  function cardCount(deckId: string): number {
    return flashcards.filter(f => f.deckId === deckId).length;
  }

  function handleConfirmDelete() {
    if (pendingDeleteId) {
      onDelete(pendingDeleteId);
      setPendingDeleteId(null);
    }
  }

  if (decks.length === 0) {
    return (
      <div className="py-10 text-center text-gray-500 text-sm">
        No decks yet. Create one to get started.
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2" role="list" aria-label="Flashcard decks">
        {decks.map(deck => {
          const count = cardCount(deck.id);
          const isSelected = deck.id === selectedDeckId;

          return (
            <li key={deck.id}>
              <div
                className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors cursor-pointer ${
                  isSelected
                    ? 'border-blue-500 bg-blue-900/20'
                    : 'border-gray-700 hover:border-gray-600 bg-gray-900/40'
                }`}
                onClick={() => onSelect(deck.id)}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`Select deck: ${deck.name}`}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(deck.id);
                  }
                }}
              >
                {/* Left: name + card count */}
                <div className="flex items-center gap-3 min-w-0">
                  <ChevronRight
                    className={`w-4 h-4 shrink-0 transition-transform ${
                      isSelected ? 'text-blue-400 rotate-90' : 'text-gray-600'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{deck.name}</p>
                    <p className="text-xs text-gray-500">
                      {count} {count === 1 ? 'card' : 'cards'}
                    </p>
                  </div>
                </div>

                {/* Right: edit + delete */}
                <div
                  className="flex items-center gap-1 shrink-0 ml-2"
                  onClick={e => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit deck: ${deck.name}`}
                    onClick={() => onEdit(deck)}
                    className="h-8 w-8 p-0"
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete deck: ${deck.name}`}
                    onClick={() => setPendingDeleteId(deck.id)}
                    className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={pendingDeleteId !== null}
        title="Delete Deck"
        message={
          pendingDeck
            ? `Delete "${pendingDeck.name}" and all its flashcards? This cannot be undone.`
            : 'Delete this deck and all its flashcards? This cannot be undone.'
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}

export default DeckList;
