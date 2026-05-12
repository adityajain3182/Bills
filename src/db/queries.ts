import { db, newId } from './db';
import type {
  Email,
  Expense,
  Group,
  GroupMember,
  PaidBy,
  Preferences,
  Profile,
  Settlement,
  SplitConfig,
  SplitMethod,
  SplitShare,
} from '../types';
import {
  AVATAR_COLORS,
  LOCAL_OWNER,
  colorForEmail,
  displayNameForEmail,
  normalizeEmail,
} from '../types';
import { scheduleSync } from '../sync/scheduler';

function stamp<T extends { updatedAt?: number; dirty?: 0 | 1 }>(row: T): T {
  row.updatedAt = Date.now();
  row.dirty = 1;
  return row;
}

// ---------- Groups ----------

export async function createGroup(input: {
  name: string;
  emoji: string;
  currency: string;
  members: GroupMember[]; // does NOT need to include "me"
}): Promise<Group> {
  const name = input.name.trim();
  if (!name) throw new Error('Group name required');
  const prefs = await db.preferences.get('singleton');
  if (!prefs) throw new Error('Preferences not initialised');

  // Always include the current user as a member
  const me: GroupMember = {
    email: prefs.myEmail,
    displayName: prefs.myDisplayName || displayNameForEmail(prefs.myEmail),
  };
  const seen = new Set<Email>();
  const members: GroupMember[] = [];
  for (const m of [me, ...input.members]) {
    const e = normalizeEmail(m.email);
    if (!e || seen.has(e)) continue;
    seen.add(e);
    members.push({ email: e, displayName: m.displayName?.trim() || undefined });
  }
  if (members.length < 1) throw new Error('At least one member required');

  const group: Group = stamp({
    id: newId(),
    name,
    emoji: input.emoji || '🧾',
    currency: input.currency || 'USD',
    ownerEmail: prefs.myEmail,
    members,
    archived: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
  await db.transaction('rw', [db.groups, db.expenses, db.settlements], async () => {
    const g = await db.groups.get(id);
    if (g) await db.groups.put(stamp({ ...g, deletedAt: now }));
    const expenses = await db.expenses.where('groupId').equals(id).toArray();
    for (const e of expenses) await db.expenses.put(stamp({ ...e, deletedAt: now }));
    const settlements = await db.settlements.where('groupId').equals(id).toArray();
    for (const s of settlements) await db.settlements.put(stamp({ ...s, deletedAt: now }));
  });
  scheduleSync();
}

export async function addMemberToGroup(
  groupId: string,
  email: string,
  displayName?: string,
): Promise<void> {
  const e = normalizeEmail(email);
  if (!e) throw new Error('Email required');
  const g = await db.groups.get(groupId);
  if (!g) throw new Error('Group not found');
  if (g.members.some((m) => m.email === e)) return; // already a member
  const next: GroupMember[] = [
    ...g.members,
    { email: e, displayName: displayName?.trim() || undefined },
  ];
  await db.groups.put(stamp({ ...g, members: next }));
  scheduleSync();
}

export async function removeMemberFromGroup(groupId: string, email: string): Promise<void> {
  const e = normalizeEmail(email);
  const g = await db.groups.get(groupId);
  if (!g) return;
  const next = g.members.filter((m) => m.email !== e);
  await db.groups.put(stamp({ ...g, members: next }));
  scheduleSync();
}

// ---------- Profiles (display cache) ----------

export async function upsertLocalProfile(p: Profile): Promise<void> {
  await db.profiles.put({ ...p, email: normalizeEmail(p.email) });
}

export async function ensureLocalProfileFor(email: Email, fallbackName?: string): Promise<Profile> {
  const e = normalizeEmail(email);
  const existing = await db.profiles.get(e);
  if (existing) return existing;
  const row: Profile = {
    email: e,
    displayName: fallbackName?.trim() || displayNameForEmail(e),
    avatarColor: colorForEmail(e),
  };
  await db.profiles.put(row);
  return row;
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

  // Normalize emails on payer/split rows
  const paidBy = input.paidBy.map((p) => ({ ...p, email: normalizeEmail(p.email) }));
  const splits = input.splits.map((s) => ({ ...s, email: normalizeEmail(s.email) }));

  const now = Date.now();
  const existing = input.id ? await db.expenses.get(input.id) : undefined;
  const expense: Expense = stamp({
    id: input.id ?? newId(),
    groupId: input.groupId,
    description: input.description.trim(),
    amount: input.amount,
    currency: input.currency,
    date: input.date,
    paidBy,
    splits,
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
  fromEmail: string;
  toEmail: string;
  amount: number;
  currency: string;
  date: number;
  note?: string;
}): Promise<Settlement> {
  const from = normalizeEmail(input.fromEmail);
  const to = normalizeEmail(input.toEmail);
  if (from === to) throw new Error('Payer and recipient must differ');
  if (input.amount <= 0) throw new Error('Amount must be positive');
  const s: Settlement = stamp({
    id: input.id ?? newId(),
    groupId: input.groupId,
    fromEmail: from,
    toEmail: to,
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

// ---------- Preferences / onboarding ----------

// Fields on Preferences that are mirrored to the cloud `profiles` row.
// Changing any of them should trigger a sync so the change propagates.
const PROFILE_FIELDS = new Set<keyof Preferences>([
  'myDisplayName',
  'myAvatarColor',
  'defaultCurrency',
]);

export async function updatePrefs(patch: Partial<Preferences>): Promise<void> {
  await db.preferences.update('singleton', patch);
  for (const k of Object.keys(patch) as (keyof Preferences)[]) {
    if (PROFILE_FIELDS.has(k)) {
      scheduleSync();
      return;
    }
  }
}

export async function setMyName(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name required');
  const prefs = await db.preferences.get('singleton');
  if (!prefs) throw new Error('Preferences not initialised');
  await db.preferences.update('singleton', {
    myDisplayName: trimmed,
    onboarded: 1,
    myAvatarColor: prefs.myAvatarColor || AVATAR_COLORS[0],
  });
  // Also update any local profile row keyed by the user's email
  const profile = await db.profiles.get(prefs.myEmail);
  await db.profiles.put({
    email: prefs.myEmail,
    displayName: trimmed,
    avatarColor: profile?.avatarColor ?? prefs.myAvatarColor ?? AVATAR_COLORS[0],
    userId: profile?.userId,
  });
  scheduleSync();
}

/**
 * Called from sync/auth.ts when the user signs in. Re-stamps every locally-
 * owned group (including the LOCAL_OWNER sentinel) with the user's real email
 * so the next push succeeds under RLS.
 */
export async function adoptLocalDataForEmail(email: Email): Promise<void> {
  const e = normalizeEmail(email);
  await db.preferences.update('singleton', { myEmail: e });
  const groups = await db.groups.toArray();
  const now = Date.now();
  const updated: Group[] = [];
  for (const g of groups) {
    let changed = false;
    let nextOwner = g.ownerEmail;
    if (g.ownerEmail === LOCAL_OWNER) {
      nextOwner = e;
      changed = true;
    }
    const nextMembers = g.members.map((m) =>
      m.email === LOCAL_OWNER ? { ...m, email: e } : m,
    );
    if (nextMembers.some((m, i) => m.email !== g.members[i]?.email)) changed = true;
    // Add me as a member if missing
    if (!nextMembers.some((m) => m.email === e)) {
      nextMembers.push({ email: e });
      changed = true;
    }
    if (changed) {
      updated.push({
        ...g,
        ownerEmail: nextOwner,
        members: nextMembers,
        updatedAt: now,
        dirty: 1,
      });
    }
  }
  if (updated.length) await db.groups.bulkPut(updated);

  // Same for expenses + settlements — replace LOCAL_OWNER in paidBy/splits.
  const expenses = await db.expenses.toArray();
  const expUpdates: Expense[] = [];
  for (const exp of expenses) {
    let changed = false;
    const paidBy = exp.paidBy.map((p) =>
      p.email === LOCAL_OWNER ? ((changed = true), { ...p, email: e }) : p,
    );
    const splits = exp.splits.map((s) =>
      s.email === LOCAL_OWNER ? ((changed = true), { ...s, email: e }) : s,
    );
    if (changed) {
      expUpdates.push({ ...exp, paidBy, splits, updatedAt: now, dirty: 1 });
    }
  }
  if (expUpdates.length) await db.expenses.bulkPut(expUpdates);

  const settlements = await db.settlements.toArray();
  const setUpdates: Settlement[] = [];
  for (const s of settlements) {
    let next = s;
    let changed = false;
    if (s.fromEmail === LOCAL_OWNER) {
      next = { ...next, fromEmail: e };
      changed = true;
    }
    if (s.toEmail === LOCAL_OWNER) {
      next = { ...next, toEmail: e };
      changed = true;
    }
    if (changed) setUpdates.push({ ...next, updatedAt: now, dirty: 1 });
  }
  if (setUpdates.length) await db.settlements.bulkPut(setUpdates);
}

// ---------- Export / Import / Clear ----------

export interface ExportPayload {
  version: 2;
  exportedAt: number;
  groups: Group[];
  expenses: Expense[];
  settlements: Settlement[];
  profiles: Profile[];
  preferences: Preferences | undefined;
}

export async function exportAll(): Promise<ExportPayload> {
  const [groups, expenses, settlements, profiles, preferences] = await Promise.all([
    db.groups.toArray(),
    db.expenses.toArray(),
    db.settlements.toArray(),
    db.profiles.toArray(),
    db.preferences.get('singleton'),
  ]);
  return { version: 2, exportedAt: Date.now(), groups, expenses, settlements, profiles, preferences };
}

export async function importAll(payload: ExportPayload): Promise<void> {
  if (payload.version !== 2) throw new Error('Unsupported export version');
  await db.transaction(
    'rw',
    [db.groups, db.expenses, db.settlements, db.profiles, db.preferences],
    async () => {
      await db.groups.clear();
      await db.expenses.clear();
      await db.settlements.clear();
      await db.profiles.clear();
      await db.groups.bulkPut(payload.groups);
      await db.expenses.bulkPut(payload.expenses);
      await db.settlements.bulkPut(payload.settlements);
      await db.profiles.bulkPut(payload.profiles);
      if (payload.preferences) await db.preferences.put(payload.preferences);
    },
  );
}

export async function clearAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.groups, db.expenses, db.settlements, db.profiles, db.preferences],
    async () => {
      await db.groups.clear();
      await db.expenses.clear();
      await db.settlements.clear();
      await db.profiles.clear();
      await db.preferences.clear();
    },
  );
}
