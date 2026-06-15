/**
 * Centralized toast system (SPEC §6 — "consistent toasts").
 *
 * Replaces the ad-hoc per-component `setTimeout` toasts (FlashcardViewer,
 * QuestionSearchPanel, SettingsPanel). Wrap the app in <ToastProvider> and call
 * `useToast().toast(message, variant?)` anywhere below it.
 */

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastVariant = 'default' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'bg-gray-800 border-gray-600 text-gray-100',
  success: 'bg-green-900/40 border-green-600 text-green-200',
  error: 'bg-red-900/40 border-red-600 text-red-200',
};

const DURATION_MS = 2500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((message: string, variant: ToastVariant = 'default') => {
    const id = nextId.current++;
    setToasts(prev => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            className={`pointer-events-auto px-4 py-2 rounded-lg border text-sm shadow-lg ${VARIANT_CLASSES[t.variant]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- provider + hook colocated by design
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
