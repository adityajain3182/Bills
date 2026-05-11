import { type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-forest text-cream hover:bg-forest-600 active:scale-[0.98] disabled:opacity-50',
  secondary:
    'bg-surface text-forest border border-forest/15 hover:bg-cream active:scale-[0.98]',
  ghost: 'text-ink-muted hover:text-ink hover:bg-cream active:scale-[0.98]',
  danger:
    'bg-warmred text-cream hover:bg-warmred/90 active:scale-[0.98] disabled:opacity-50',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-xl gap-1.5',
  md: 'h-11 px-5 text-base rounded-xl gap-2',
  lg: 'h-14 px-6 text-base rounded-2xl gap-2 font-semibold',
};

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center font-medium transition select-none ${
        variants[variant]
      } ${sizes[size]} ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
}
