import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** Show as full-height sheet (taller) */
  large?: boolean;
  /** Optional footer pinned to bottom */
  footer?: ReactNode;
}

export function Sheet({ open, onClose, title, children, large, footer }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTarget = panelRef.current?.querySelector<HTMLElement>(
      'input, button, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    focusTarget?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-ink/40 animate-fadeIn"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        className={`relative w-full max-w-[480px] bg-surface rounded-t-sheet shadow-sheet animate-sheetIn flex flex-col ${
          large ? 'h-[92vh]' : 'max-h-[88vh]'
        }`}
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1.5 w-10 rounded-full bg-line" />
        </div>
        {title && (
          <div className="px-5 pt-2 pb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-9 w-9 rounded-full hover:bg-cream flex items-center justify-center text-ink-muted"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="px-5 pt-3 pb-4 border-t border-line/60">{footer}</div>}
      </div>
    </div>
  );
}
