import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: boolean;
  right?: ReactNode;
}

export function Header({ title, subtitle, back, right }: Props) {
  const navigate = useNavigate();
  return (
    <header
      className="sticky top-0 z-30 bg-cream/95 backdrop-blur border-b border-line/60"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="flex items-center gap-2 px-4 h-14">
        {back && (
          <button
            onClick={() => navigate(-1)}
            className="-ml-2 h-10 w-10 rounded-full hover:bg-cream flex items-center justify-center text-ink"
            aria-label="Back"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-display text-lg font-semibold truncate">{title}</div>
          {subtitle && (
            <div className="text-xs text-ink-muted truncate -mt-0.5">{subtitle}</div>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}
