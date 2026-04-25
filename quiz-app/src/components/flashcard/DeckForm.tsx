/**
 * DeckForm — create or edit a Deck.
 *
 * Props:
 *  - examId: pre-fills the exam association (read-only)
 *  - deck: if provided, the form is in edit mode
 *  - onSave: called with the saved Deck
 *  - onCancel: called when the user cancels
 */

import { useState } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { Deck } from '../../types/index';

interface DeckFormProps {
  examId: string;
  deck?: Deck;
  onSave: (deck: Deck) => void;
  onCancel: () => void;
}

export function DeckForm({ examId, deck, onSave, onCancel }: DeckFormProps) {
  const [name, setName] = useState(deck?.name ?? '');
  const [nameError, setNameError] = useState('');

  function validate(): boolean {
    if (!name.trim()) {
      setNameError('Deck name is required.');
      return false;
    }
    setNameError('');
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const saved: Deck = {
      id: deck?.id ?? crypto.randomUUID(),
      name: name.trim(),
      examIds: deck?.examIds ?? [examId],
      createdAt: deck?.createdAt ?? new Date().toISOString(),
    };

    onSave(saved);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {deck ? 'Edit Deck' : 'New Deck'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Deck name */}
          <div>
            <label htmlFor="deck-name" className="block text-sm mb-1">
              Deck Name <span aria-hidden="true" className="text-red-400">*</span>
            </label>
            <input
              id="deck-name"
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value);
                if (nameError) setNameError('');
              }}
              placeholder="e.g. AWS SAA-C03 Core Concepts"
              aria-required="true"
              aria-describedby={nameError ? 'deck-name-error' : undefined}
              className={`w-full rounded-lg border px-3 py-2 text-sm bg-gray-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 ${
                nameError
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-700 focus:ring-gray-500'
              }`}
            />
            {nameError && (
              <p id="deck-name-error" role="alert" className="mt-1 text-xs text-red-400">
                {nameError}
              </p>
            )}
          </div>

          {/* Exam association — read-only */}
          <div>
            <label className="block text-sm mb-1 text-gray-400">Exam</label>
            <input
              type="text"
              value={examId}
              readOnly
              aria-label="Exam association (read-only)"
              className="w-full rounded-lg border border-gray-700 px-3 py-2 text-sm bg-gray-800 text-gray-500 cursor-not-allowed"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {deck ? 'Save Changes' : 'Create Deck'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default DeckForm;
