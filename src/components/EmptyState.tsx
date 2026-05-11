import { type ReactNode } from 'react';

export function EmptyState({
  emoji,
  title,
  description,
  action,
}: {
  emoji: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="text-6xl mb-4" aria-hidden>
        {emoji}
      </div>
      <h2 className="font-display text-2xl font-semibold mb-2">{title}</h2>
      {description && (
        <p className="text-ink-muted text-sm max-w-[18rem]">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
