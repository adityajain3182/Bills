import { db, newId } from './db';
import type {
  Person,
  Group,
  Expense,
  Settlement,
  Preferences,
  PaidBy,
  SplitShare,
  SplitMethod,
  SplitConfig,
} from '../types';
import { AVATAR_COLORS } from '../types';
import { scheduleSync } from '../sync/scheduler';

// Every mutation goes through stamp() so the sync engine has a reliable
// updatedAt + dirty flag to work from.
function stamp<T extends { updatedAt?: number; dirty?: 0 | 1 }>(row: T): T {
  row.updatedAt = Date.now();
  row.dirty = 1;
  return row;
}

// ---------- People ----------

export async function createPerson(
  name: string,
  color?: string,
  groupId?: string,
): Promise<Person> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name required');
  const person: Person = stamp({
    id: newId(),
    name: trimmed,
    avatarColor: color ?? AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    groupId,
  });
  await db.people.put(person);
  scheduleSync();
  return person;
}

export async function renamePerson(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name required');
  const existing = await db.people.get(id);
  if (!existing) return;
  await db.people.put(stamp({ ...existing, name: trimmed }));
  scheduleSync();
}

export async function deletePerson(id: string): Promise<void> {
  const groups = await db.groups.toArray();
  const inGroup = groups.some((g) => !g.deletedAt && g.memberIds.includes(id));
  if (inGroup) throw new Error('Person is in a group. Remove them from groups first.');
  const expenses = await db.expenses.toArray();
  const inExpense = expenses.some(
    (e) =>
      !e.deletedAt &&
      (e.paidBy.some((p) => p.personId === id) ||
        e.splits.some((s) => s.personId === id)),
  );
  if (inExpense) throw new Error('Person has expense history.');
  const existing = await db.people.get(id);
  if (!existing) return;
  await db.people.put(stamp({ ...existing, deletedAt: Date.now() }));
  scheduleSync();
}

// ---------- Groups ----------

export async function createGroup(input: {
  name: string;
  emoji: string;
  currency: string;
  memberIds: string[];
}): Promise<Group> {
  const name = input.name.trim();
  if (!name) throw new Error('Group name required');
  if (!input.memberIds.length) throw new Error('At least one member required');
  const group: Group = stamp({
    id: newId(),
    name,
    emoji: input.emoji || '🧾',
    currency: input.currency || 'USD',
    memberIds: [...new Set(input.memberIds)],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archived: 0,
  });
  await db.groups.put(group);
  scheduleSync();
  return group;
}

export async function updateGroup(id: string, patch: Partial<Group>): Promise<void> {
  const existing = await db.groups.get(id);
  if (!existing) return;
  await db.groups.put(stamp({ ...existing, ...patch }));
  scheduleSync();
}

export async function archiveGroup(id: string, archived: boolean): Promise<void> {
  const existing = await db.groups.get(id);
  if (!existing) return;
  await db.groups.put(stamp({ ...existing, archived: archived ? 1 : 0 }));
  scheduleSync();
}

export async function deleteGroup(id: string): Promise<void> {
  const now = Date.now();
  await db.transaction(
    'rw',
    [db.groups, db.expenses, db.settlements, db.people],
    async () => {
      const g = await db.groups.get(id);
      if (g) await db.groups.put(stamp({ ...g, deletedAt: now }));
      const expenses = await db.expenses.where('groupId').equals(id).toArray();
      for (const e of expenses) {
        await db.expenses.put(stamp({ ...e, deletedAt: now }));
      }
      const settlements = await db.settlements.where('groupId').equals(id).toArray();
      for (const s of settlements) {
        await db.settlements.put(stamp({ ...s, deletedAt: now }));
      }
      const people = await db.people.where('groupId').equals(id).toArray();
      for (const p of people) {
        await db.people.put(stamp({ ...p, deletedAt: now }));
      }
    },
  );
  scheduleSync();
}

// ---------- Expenses ----------

export interface SaveExpenseInput {
  id?: string;
  groupId: string;
  description: string;
  amount: number;
  currency: string;
  date: number;
  paidBy: PaidBy[];
  splits: SplitShare[];
  splitMethod: SplitMethod;
  splitConfig: SplitConfig;
  category: string;
  notes?: string;
}

export async function saveExpense(input: SaveExpenseInput): Promise<Expense> {
  if (!input.description.trim()) throw new Error('Description required');
  if (input.amount <= 0) throw new Error('Amount must be positive');
  if (!input.paidBy.length) throw new Error('At least one payer required');
  const paidTotal = input.paidBy.reduce((a, b) => a + b.amount, 0);
  if (paidTotal !== input.amount) throw new Error('Paid amounts must equal total');
  const splitTotal = input.splits.reduce((a, b) => a + b.amount, 0);
  if (splitTotal !== input.amount) throw new Error('Splits must sum to total');

  const now = Date.now();
  const existing = input.id ? await db.expenses.get(input.id) : undefined;
  const expense: Expense = stamp({
    id: input.id ?? newId(),
    groupId: input.groupId,
    description: input.description.trim(),
    amount: input.amount,
    currency: input.currency,
    date: input.date,
    paidBy: input.paidBy,
    splits: input.splits,
    splitMethod: input.splitMethod,
    splitConfig: input.splitConfig,
    category: input.category || 'general',
    notes: input.notes?.trim() || undefined,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
  await db.expenses.put(expense);
  scheduleSync();
  return expense;
}

export async function deleteExpense(id: string): Promise<void> {
  const existing = await db.expenses.get(id);
  if (!existing) return;
  await db.expenses.put(stamp({ ...existing, deletedAt: Date.now() }));
  scheduleSync();
}

// ---------- Settlements ----------

export async function saveSettlement(input: {
  id?: string;
  groupId: string;
  fromPersonId: string;
  toPersonId: string;
  amount: number;
  currency: string;
  date: number;
  note?: string;
}): Promise<Settlement> {
  if (input.fromPersonId === input.toPersonId) throw new Error('Payer and recipient must differ');
  if (input.amount <= 0) throw new Error('Amount must be positive');
  const s: Settlement = stamp({
    id: input.id ?? newId(),
    groupId: input.groupId,
    fromPersonId: input.fromPersonId,
    toPersonId: input.toPersonId,
    amount: input.amount,
    currency: input.currency,
    date: input.date,
    note: input.note?.trim() || undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  await db.settlements.put(s);
  scheduleSync();
  return s;
}

export async function deleteSettlement(id: string): Promise<void> {
  const existing = await db.settlements.get(id);
  if (!existing) return;
  await db.settlements.put(stamp({ ...existing, deletedAt: Date.now() }));
  scheduleSync();
}

// ---------- Preferences ----------

export async function updatePrefs(patch: Partial<Preferences>): Promise<void> {
  await db.preferences.update('singleton', patch);
}

export async function setMePerson(name: string): Promise<Person> {
  const existing = await db.preferences.get('singleton');
  if (existing?.mePersonId) {
    const me = await db.people.get(existing.mePersonId);
    if (me) {
      await renamePerson(me.id, name);
      return { ...me, name: name.trim() };
    }
  }
  const me = await createPerson(name, AVATAR_COLORS[0]);
  await db.preferences.update('singleton', { mePersonId: me.id, onboarded: 1 });
  return me;
}

// ---------- Export / Import ----------

export interface ExportPayload {
  version: 1;
  exportedAt: number;
  people: Person[];
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  preferences: Preferences | undefined;
}

export async function exportAll(): Promise<ExportPayload> {
  const [people, groups, expenses, settlements, preferences] = await Promise.all([
    db.people.toArray(),
    db.groups.toArray(),
    db.expenses.toArray(),
    db.settlements.toArray(),
    db.preferences.get('singleton'),
  ]);
  return {
    version: 1,
    exportedAt: Date.now(),
    people,
    groups,
    expenses,
    settlements,
    preferences,
  };
}

export async function importAll(payload: ExportPayload): Promise<void> {
  if (payload.version !== 1) throw new Error('Unsupported export version');
  await db.transaction(
    'rw',
    [db.people, db.groups, db.expenses, db.settlements, db.preferences],
    async () => {
      await db.people.clear();
      await db.groups.clear();
      await db.expenses.clear();
      await db.settlements.clear();
      await db.people.bulkPut(payload.people);
      await db.groups.bulkPut(payload.groups);
      await db.expenses.bulkPut(payload.expenses);
      await db.settlements.bulkPut(payload.settlements);
      if (payload.preferences) await db.preferences.put(payload.preferences);
    },
  );
}

export async function clearAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.people, db.groups, db.expenses, db.settlements, db.preferences],
    async () => {
      await db.people.clear();
      await db.groups.clear();
      await db.expenses.clear();
      await db.settlements.clear();
      await db.preferences.clear();
    },
  );
}
