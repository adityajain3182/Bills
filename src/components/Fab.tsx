import { type ReactNode } from 'react';

export function Fab({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="fixed z-40 right-5 h-14 w-14 rounded-full bg-coral text-cream shadow-fab active:scale-95 transition flex items-center justify-center"
      style={{ bottom: 'calc(72px + var(--safe-bottom) + 16px)' }}
    >
      {children ?? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      )}
    </button>
  );
}
