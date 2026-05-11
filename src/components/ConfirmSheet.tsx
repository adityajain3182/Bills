import { type ReactNode } from 'react';
import { Sheet } from './Sheet';
import { Button } from './Button';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
}: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {description && <p className="text-ink-muted text-sm pb-5">{description}</p>}
      <div className="flex gap-3 pb-2">
        <Button variant="secondary" full onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'danger' : 'primary'}
          full
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
