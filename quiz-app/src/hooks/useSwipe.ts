import { useEffect, useRef } from 'react';

interface UseSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}

export function useSwipe(
  ref: React.RefObject<HTMLElement | null>,
  options: UseSwipeOptions,
): void {
  const startX = useRef(0);
  const { onSwipeLeft, onSwipeRight, threshold = 50 } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handlePointerDown = (e: PointerEvent) => {
      startX.current = e.clientX;
    };

    const handlePointerUp = (e: PointerEvent) => {
      const delta = e.clientX - startX.current;
      if (Math.abs(delta) >= threshold) {
        if (delta < 0) onSwipeLeft?.();
        else onSwipeRight?.();
      }
    };

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointerup', handlePointerUp);
    return () => {
      el.removeEventListener('pointerdown', handlePointerDown);
      el.removeEventListener('pointerup', handlePointerUp);
    };
  }, [ref, onSwipeLeft, onSwipeRight, threshold]);
}
