import { supabase, cloudEnabled } from './supabase';
import { db } from '../db/db';
import { getAuthUserId } from './auth';
import { setSyncRunner } from './scheduler';
import type { Expense, Group, Person, Settlement } from '../types';

// Row shapes we send to / receive from Postgres. Field names are snake_case
// at the SQL boundary; we translate to/from the TS camelCase in this module.

interface CloudGroup {
  id: string;
  name: string;
  emoji: string;
  currency: string;
  member_ids: string[];
  archived: boolean;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
interface CloudPerson {
  id: string;
  group_id: string;
  name: string;
  avatar_color: string;
  linked_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
interface CloudExpense {
  id: string;
  group_id: string;
  description: string;
  amount: number;
  currency: string;
  date: number;
  paid_by: unknown;
  splits: unknown;
  split_method: string;
  split_config: unknown;
  category: string;
  notes: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
interface CloudSettlement {
  id: string;
  group_id: string;
  from_person_id: string;
  to_person_id: string;
  amount: number;
  currency: string;
  date: number;
  note: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const toMs = (iso: string | null | undefined): number | undefined =>
  iso ? new Date(iso).getTime() : undefined;
const toIso = (ms: number | undefined): string | null =>
  ms ? new Date(ms).toISOString() : null;

// ---- Status (so the UI can show "Syncing…" / "Up to date") ----------

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'ok'; at: number }
  | { kind: 'error'; message: string };

const statusListeners = new Set<(s: SyncStatus) => void>();
let status: SyncStatus = { kind: 'idle' };
function setStatus(next: SyncStatus) {
  status = next;
  for (const fn of statusListeners) fn(status);
}
export function subscribeSync(fn: (s: SyncStatus) => void): () => void {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}
export function getSyncStatus(): SyncStatus {
  return status;
}

// ---- Core push/pull -------------------------------------------------

let syncing = false;

export async function syncNow(): Promise<void> {
  if (!cloudEnabled || !supabase) return;
  const userId = getAuthUserId();
  if (!userId) return;
  if (syncing) return;
  syncing = true;
  setStatus({ kind: 'running' });
  try {
    await pushDirty(userId);
    await pullSince();
    setStatus({ kind: 'ok', at: Date.now() });
  } catch (err) {
    console.warn('[sync] error', err);
    setStatus({ kind: 'error', message: (err as Error).message });
  } finally {
    syncing = false;
  }
}

async function pushDirty(userId: string): Promise<void> {
  if (!supabase) return;

  // Groups first (FK target). Push only those we own — others were pulled.
  const dirtyGroups = await db.groups.where('dirty').equals(1).toArray();
  const myGroups = dirtyGroups.filter(
    (g) => !g.ownerId || g.ownerId === userId,
  );
  if (myGroups.length) {
    const rows = myGroups.map((g) => ({
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      currency: g.currency,
      member_ids: g.memberIds,
      archived: !!g.archived,
      owner_id: g.ownerId ?? userId,
      updated_at: toIso(g.updatedAt) ?? new Date().toISOString(),
      deleted_at: toIso(g.deletedAt),
    }));
    const { error } = await supabase.from('groups').upsert(rows);
    if (error) throw error;
  }

  // People (group-scoped)
  const dirtyPeople = (await db.people.where('dirty').equals(1).toArray()).filter(
    (p) => p.groupId,
  );
  if (dirtyPeople.length) {
    const rows = dirtyPeople.map((p) => ({
      id: p.id,
      group_id: p.groupId!,
      name: p.name,
      avatar_color: p.avatarColor,
      linked_user_id: p.linkedUserId ?? null,
      updated_at: toIso(p.updatedAt) ?? new Date().toISOString(),
      deleted_at: toIso(p.deletedAt),
    }));
    const { error } = await supabase.from('people').upsert(rows);
    if (error) throw error;
  }

  // Expenses
  const dirtyExpenses = await db.expenses.where('dirty').equals(1).toArray();
  if (dirtyExpenses.length) {
    const rows = dirtyExpenses.map((e) => ({
      id: e.id,
      group_id: e.groupId,
      description: e.description,
      amount: e.amount,
      currency: e.currency,
      date: e.date,
      paid_by: e.paidBy,
      splits: e.splits,
      split_method: e.splitMethod,
      split_config: e.splitConfig,
      category: e.category,
      notes: e.notes ?? null,
      owner_id: e.ownerId ?? userId,
      updated_at: toIso(e.updatedAt) ?? new Date().toISOString(),
      deleted_at: toIso(e.deletedAt),
    }));
    const { error } = await supabase.from('expenses').upsert(rows);
    if (error) throw error;
  }

  // Settlements
  const dirtySettlements = await db.settlements.where('dirty').equals(1).toArray();
  if (dirtySettlements.length) {
    const rows = dirtySettlements.map((s) => ({
      id: s.id,
      group_id: s.groupId,
      from_person_id: s.fromPersonId,
      to_person_id: s.toPersonId,
      amount: s.amount,
      currency: s.currency,
      date: s.date,
      note: s.note ?? null,
      owner_id: s.ownerId ?? userId,
      updated_at: toIso(s.updatedAt) ?? new Date().toISOString(),
      deleted_at: toIso(s.deletedAt),
    }));
    const { error } = await supabase.from('settlements').upsert(rows);
    if (error) throw error;
  }

  // Clear dirty flags on successfully-pushed rows
  await db.transaction(
    'rw',
    [db.groups, db.people, db.expenses, db.settlements],
    async () => {
      for (const row of myGroups) {
        await db.groups.update(row.id, { dirty: 0, ownerId: row.ownerId ?? userId });
      }
      for (const row of dirtyPeople) {
        await db.people.update(row.id, { dirty: 0 });
      }
      for (const row of dirtyExpenses) {
        await db.expenses.update(row.id, { dirty: 0, ownerId: row.ownerId ?? userId });
      }
      for (const row of dirtySettlements) {
        await db.settlements.update(row.id, { dirty: 0, ownerId: row.ownerId ?? userId });
      }
    },
  );
}

async function pullSince(): Promise<void> {
  if (!supabase) return;
  const prefs = await db.preferences.get('singleton');
  const since = prefs?.lastPulledAt ?? 0;
  // We back the watermark off by a generous buffer to tolerate clock skew.
  const sinceIso = new Date(since - 60_000).toISOString();
  const startedAt = Date.now();

  const [groups, people, expenses, settlements] = await Promise.all([
    supabase
      .from('groups')
      .select('*')
      .gt('updated_at', sinceIso)
      .then(unwrap<CloudGroup[]>),
    supabase
      .from('people')
      .select('*')
      .gt('updated_at', sinceIso)
      .then(unwrap<CloudPerson[]>),
    supabase
      .from('expenses')
      .select('*')
      .gt('updated_at', sinceIso)
      .then(unwrap<CloudExpense[]>),
    supabase
      .from('settlements')
      .select('*')
      .gt('updated_at', sinceIso)
      .then(unwrap<CloudSettlement[]>),
  ]);

  await db.transaction(
    'rw',
    [db.groups, db.people, db.expenses, db.settlements],
    async () => {
      for (const g of groups) await mergeGroup(g);
      for (const p of people) await mergePerson(p);
      for (const e of expenses) await mergeExpense(e);
      for (const s of settlements) await mergeSettlement(s);
    },
  );

  await db.preferences.update('singleton', { lastPulledAt: startedAt });
}

function unwrap<T>(res: { data: T | null; error: Error | null }): T {
  if (res.error) throw res.error;
  return (res.data ?? ([] as unknown as T)) as T;
}

// LWW merge: keep whichever side has the later updated_at. We compare in ms.
async function mergeGroup(g: CloudGroup): Promise<void> {
  const local = await db.groups.get(g.id);
  const remoteUpdated = new Date(g.updated_at).getTime();
  if (local?.dirty && (local.updatedAt ?? 0) >= remoteUpdated) return;
  const row: Group = {
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    currency: g.currency,
    memberIds: g.member_ids ?? [],
    archived: g.archived ? 1 : 0,
    createdAt: toMs(g.created_at) ?? Date.now(),
    updatedAt: remoteUpdated,
    deletedAt: toMs(g.deleted_at),
    ownerId: g.owner_id,
    dirty: 0,
  };
  await db.groups.put(row);
}

async function mergePerson(p: CloudPerson): Promise<void> {
  const local = await db.people.get(p.id);
  const remoteUpdated = new Date(p.updated_at).getTime();
  if (local?.dirty && (local.updatedAt ?? 0) >= remoteUpdated) return;
  const row: Person = {
    id: p.id,
    name: p.name,
    avatarColor: p.avatar_color,
    createdAt: toMs(p.created_at) ?? Date.now(),
    updatedAt: remoteUpdated,
    deletedAt: toMs(p.deleted_at),
    groupId: p.group_id,
    linkedUserId: p.linked_user_id ?? undefined,
    dirty: 0,
  };
  await db.people.put(row);
}

async function mergeExpense(e: CloudExpense): Promise<void> {
  const local = await db.expenses.get(e.id);
  const remoteUpdated = new Date(e.updated_at).getTime();
  if (local?.dirty && (local.updatedAt ?? 0) >= remoteUpdated) return;
  const row: Expense = {
    id: e.id,
    groupId: e.group_id,
    description: e.description,
    amount: Number(e.amount),
    currency: e.currency,
    date: Number(e.date),
    paidBy: (e.paid_by as Expense['paidBy']) ?? [],
    splits: (e.splits as Expense['splits']) ?? [],
    splitMethod: e.split_method as Expense['splitMethod'],
    splitConfig: (e.split_config as Expense['splitConfig']) ?? { includedIds: [] },
    category: e.category,
    notes: e.notes ?? undefined,
    createdAt: toMs(e.created_at) ?? Date.now(),
    updatedAt: remoteUpdated,
    deletedAt: toMs(e.deleted_at),
    ownerId: e.owner_id,
    dirty: 0,
  };
  await db.expenses.put(row);
}

async function mergeSettlement(s: CloudSettlement): Promise<void> {
  const local = await db.settlements.get(s.id);
  const remoteUpdated = new Date(s.updated_at).getTime();
  if (local?.dirty && (local.updatedAt ?? 0) >= remoteUpdated) return;
  const row: Settlement = {
    id: s.id,
    groupId: s.group_id,
    fromPersonId: s.from_person_id,
    toPersonId: s.to_person_id,
    amount: Number(s.amount),
    currency: s.currency,
    date: Number(s.date),
    note: s.note ?? undefined,
    createdAt: toMs(s.created_at) ?? Date.now(),
    updatedAt: remoteUpdated,
    deletedAt: toMs(s.deleted_at),
    ownerId: s.owner_id,
    dirty: 0,
  };
  await db.settlements.put(row);
}

// ---- Invites --------------------------------------------------------

export interface PendingInvite {
  id: string;
  groupId: string;
  groupName: string;
  invitedEmail: string;
  invitedBy: string;
  createdAt: string;
}

export async function listMyPendingInvites(): Promise<PendingInvite[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('invites')
    .select('id, group_id, invited_email, invited_by, created_at, groups(name)')
    .is('accepted_at', null);
  if (error) throw error;
  type Row = {
    id: string;
    group_id: string;
    invited_email: string;
    invited_by: string;
    created_at: string;
    groups: { name: string } | null;
  };
  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    groupId: r.group_id,
    groupName: r.groups?.name ?? '(unknown)',
    invitedEmail: r.invited_email,
    invitedBy: r.invited_by,
    createdAt: r.created_at,
  }));
}

export async function inviteToGroup(groupId: string, email: string): Promise<void> {
  if (!supabase) throw new Error('Cloud sync not configured');
  const { error } = await supabase
    .from('invites')
    .insert({ group_id: groupId, invited_email: email.trim().toLowerCase() });
  if (error) throw error;
}

export async function acceptInvite(invite: PendingInvite): Promise<void> {
  if (!supabase) throw new Error('Cloud sync not configured');
  const userId = getAuthUserId();
  if (!userId) throw new Error('Sign in first');
  // group_members insert is allowed by RLS when accepting your own invite
  const insert = await supabase
    .from('group_members')
    .insert({ group_id: invite.groupId, user_id: userId });
  if (insert.error) throw insert.error;
  const upd = await supabase
    .from('invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', invite.id);
  if (upd.error) throw upd.error;
  await syncNow();
}

// Boot: wire the scheduler so any mutation triggers a sync
setSyncRunner(syncNow);
