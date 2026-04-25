import * as React from 'react';
import { Button } from './button';
import { cn } from '../../lib/utils';

export interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'default';
}

export function Modal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
}: ModalProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();

  // Auto-focus the cancel button when the modal opens
  React.useEffect(() => {
    if (isOpen) {
      cancelRef.current?.focus();
    }
  }, [isOpen]);

  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCancel();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
      aria-hidden="true"
    >
      {/* Dialog box — stop propagation so clicks inside don't close */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md mx-4 rounded-xl bg-gray-900 border border-gray-700 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id={titleId}
          className="text-base font-semibold text-gray-100 mb-2"
        >
          {title}
        </h2>

        <p className="text-sm text-gray-400 mb-6 leading-relaxed">{message}</p>

        <div className="flex justify-end gap-3">
          <Button
            ref={cancelRef}
            variant="outline"
            size="sm"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>

          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-600',
              'h-8 px-3',
              variant === 'danger'
                ? 'bg-red-700 text-white hover:bg-red-600'
                : 'bg-gray-800 text-gray-100 hover:bg-gray-700'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
