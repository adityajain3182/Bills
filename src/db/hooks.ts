import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Expense, Group, Person, Preferences, Settlement } from '../types';

// Defensive: a corrupt or partially-migrated row may be missing memberIds.
// Coerce to an empty array so the UI never crashes — the user can fix the
// group from the detail screen.
function normalizeGroup(g: Group | undefined): Group | undefined {
  if (!g) return g;
  if (!Array.isArray(g.memberIds)) return { ...g, memberIds: [] };
  return g;
}

export function usePrefs(): Preferences | undefined {
  return useLiveQuery(() => db.preferences.get('singleton'));
}

export function usePeople(): Person[] | undefined {
  return useLiveQuery(() => db.people.orderBy('name').toArray());
}

export function usePerson(id: string | undefined): Person | undefined {
  return useLiveQuery(async () => (id ? db.people.get(id) : undefined), [id]);
}

export function useGroups(includeArchived = false): Group[] | undefined {
  return useLiveQuery(async () => {
    const all = (await db.groups.orderBy('createdAt').reverse().toArray()).map(
      (g) => normalizeGroup(g)!,
    );
    return includeArchived ? all : all.filter((g) => !g.archived);
  }, [includeArchived]);
}

export function useGroup(id: string | undefined): Group | undefined {
  return useLiveQuery(
    async () => (id ? normalizeGroup(await db.groups.get(id)) : undefined),
    [id],
  );
}

export function useGroupExpenses(groupId: string | undefined): Expense[] | undefined {
  return useLiveQuery(async () => {
    if (!groupId) return [];
    return db.expenses.where('groupId').equals(groupId).reverse().sortBy('date');
  }, [groupId]);
}

export function useGroupSettlements(groupId: string | undefined): Settlement[] | undefined {
  return useLiveQuery(async () => {
    if (!groupId) return [];
    return db.settlements.where('groupId').equals(groupId).reverse().sortBy('date');
  }, [groupId]);
}

export function useAllExpenses(): Expense[] | undefined {
  return useLiveQuery(() => db.expenses.toArray());
}

export function useAllSettlements(): Settlement[] | undefined {
  return useLiveQuery(() => db.settlements.toArray());
}
