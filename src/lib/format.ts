import {
  format,
  isToday,
  isYesterday,
  isThisWeek,
  isThisYear,
  startOfDay,
} from 'date-fns';

export function relativeDayLabel(date: number | Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (isThisWeek(date)) return format(date, 'EEEE');
  if (isThisYear(date)) return format(date, 'MMM d');
  return format(date, 'MMM d, yyyy');
}

export function dayKey(date: number | Date): number {
  return startOfDay(date).getTime();
}

export function groupByDay<T>(
  items: T[],
  pickDate: (item: T) => number,
): { key: number; label: string; items: T[] }[] {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const key = dayKey(pickDate(item));
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, items]) => ({ key, label: relativeDayLabel(key), items }));
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts.length || !parts[0]) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
