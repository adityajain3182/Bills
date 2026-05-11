import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import type { Expense, Group, Preferences, Profile, Settlement } from '../types';

const alive = <T extends { deletedAt?: number }>(rows: T[]): T[] =>
  rows.filter((r) => !r.deletedAt);

export function usePrefs(): Preferences | undefined {
  return useLiveQuery(() => db.preferences.get('singleton'));
}

export function useGroups(includeArchived = false): Group[] | undefined {
  return useLiveQuery(async () => {
    const all = alive(await db.groups.orderBy('createdAt').reverse().toArray());
    return includeArchived ? all : all.filter((g) => !g.archived);
  }, [includeArchived]);
}

export function useGroup(id: string | undefined): Group | undefined {
  return useLiveQuery(async () => {
    if (!id) return undefined;
    const row = await db.groups.get(id);
    return row && !row.deletedAt ? row : undefined;
  }, [id]);
}

export function useGroupExpenses(groupId: string | undefined): Expense[] | undefined {
  return useLiveQuery(async () => {
    if (!groupId) return [];
    return alive(await db.expenses.where('groupId').equals(groupId).reverse().sortBy('date'));
  }, [groupId]);
}

export function useGroupSettlements(groupId: string | undefined): Settlement[] | undefined {
  return useLiveQuery(async () => {
    if (!groupId) return [];
    return alive(await db.settlements.where('groupId').equals(groupId).reverse().sortBy('date'));
  }, [groupId]);
}

export function useAllExpenses(): Expense[] | undefined {
  return useLiveQuery(async () => alive(await db.expenses.toArray()));
}

export function useAllSettlements(): Settlement[] | undefined {
  return useLiveQuery(async () => alive(await db.settlements.toArray()));
}

export function useProfiles(): Profile[] | undefined {
  return useLiveQuery(() => db.profiles.toArray());
}

export function useProfile(email: string | undefined): Profile | undefined {
  return useLiveQuery(async () => (email ? db.profiles.get(email.toLowerCase()) : undefined), [email]);
}
