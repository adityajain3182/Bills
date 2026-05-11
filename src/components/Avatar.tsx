import { initialsOf } from '../lib/format';

interface Props {
  name: string;
  color: string;
  size?: number;
  ring?: boolean;
}

export function Avatar({ name, color, size = 36, ring }: Props) {
  return (
    <div
      className={`inline-flex items-center justify-center font-medium text-cream shrink-0 ${
        ring ? 'ring-2 ring-surface' : ''
      }`}
      style={{
        width: size,
        height: size,
        background: color,
        borderRadius: '50%',
        fontSize: size * 0.4,
      }}
      aria-hidden
    >
      {initialsOf(name)}
    </div>
  );
}

export function AvatarStack({
  people,
  max = 4,
  size = 28,
}: {
  people: { name: string; avatarColor: string }[];
  max?: number;
  size?: number;
}) {
  const visible = people.slice(0, max);
  const remaining = people.length - visible.length;
  return (
    <div className="flex">
      {visible.map((p, i) => (
        <div key={i} className={i ? '-ml-2' : ''}>
          <Avatar name={p.name} color={p.avatarColor} size={size} ring />
        </div>
      ))}
      {remaining > 0 && (
        <div
          className="-ml-2 inline-flex items-center justify-center bg-line text-ink-muted font-medium ring-2 ring-surface"
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            fontSize: size * 0.36,
          }}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
