/**
 * Skeleton — pulse placeholder for loading states (SPEC §6).
 */

import { cn } from '../../lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-gray-800', className)} aria-hidden="true" />;
}

/** A card-shaped skeleton standing in for a loading question/card. */
export function QuestionSkeleton() {
  return (
    <div
      className="rounded-xl border border-gray-800 bg-gray-900/30 p-6 space-y-4"
      role="status"
      aria-label="Loading questions"
    >
      <Skeleton className="h-5 w-3/4" />
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
