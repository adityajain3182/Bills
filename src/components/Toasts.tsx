import { useUI } from '../store/ui';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 px-4 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-full px-4 py-2 text-sm shadow-card animate-pop ${
            t.tone === 'error'
              ? 'bg-warmred text-cream'
              : t.tone === 'success'
                ? 'bg-forest text-cream'
                : 'bg-ink text-cream'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
