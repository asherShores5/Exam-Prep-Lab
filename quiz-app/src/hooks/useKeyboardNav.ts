/**
 * useKeyboardNav — global keyboard shortcuts for study flows (SPEC §3.8).
 *
 * Handlers are optional; only the keys you wire up are active:
 *   - number keys 1–9      → onSelectOption(index)  (0-based)
 *   - ArrowLeft            → onPrev
 *   - ArrowRight           → onNext
 *   - Space / Enter        → onPrimary  (reveal / advance / submit)
 *
 * Ignores keystrokes while the user is typing in an input/textarea/select or a
 * contentEditable element, so it never hijacks form entry.
 */

import { useEffect } from 'react';

export interface KeyboardNavHandlers {
  onSelectOption?: (index: number) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onPrimary?: () => void;
  /** When false, the listener is detached (e.g. on results screens). */
  enabled?: boolean;
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function useKeyboardNav({
  onSelectOption,
  onPrev,
  onNext,
  onPrimary,
  enabled = true,
}: KeyboardNavHandlers): void {
  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (onSelectOption && e.key >= '1' && e.key <= '9') {
        onSelectOption(Number(e.key) - 1);
        e.preventDefault();
        return;
      }
      if (onPrev && e.key === 'ArrowLeft') { onPrev(); e.preventDefault(); return; }
      if (onNext && e.key === 'ArrowRight') { onNext(); e.preventDefault(); return; }
      if (onPrimary && (e.key === ' ' || e.key === 'Enter')) { onPrimary(); e.preventDefault(); return; }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSelectOption, onPrev, onNext, onPrimary, enabled]);
}
