import { useRef, useState, type ReactNode, type PointerEvent } from 'react';

interface Props {
  children: ReactNode;
  onDelete?: () => void;
  deleteLabel?: string;
}

const ACTION_WIDTH = 88;

export function SwipeRow({ children, onDelete, deleteLabel = 'Delete' }: Props) {
  const startX = useRef<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!onDelete) return;
    startX.current = e.clientX;
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    const base = open ? -ACTION_WIDTH : 0;
    const next = Math.min(0, Math.max(-ACTION_WIDTH * 1.2, base + dx));
    setOffset(next);
  };
  const onUp = () => {
    if (startX.current === null) return;
    if (offset < -ACTION_WIDTH / 2) {
      setOpen(true);
      setOffset(-ACTION_WIDTH);
    } else {
      setOpen(false);
      setOffset(0);
    }
    startX.current = null;
  };

  return (
    <div className="relative overflow-hidden rounded-card">
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-warmred text-cream font-medium text-sm"
          style={{ width: ACTION_WIDTH }}
        >
          {deleteLabel}
        </button>
      )}
      <div
        className="swipe-row relative"
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX.current === null ? 'transform 200ms ease-out' : 'none',
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {children}
      </div>
    </div>
  );
}
