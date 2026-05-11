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
  | { kind: 'running'; phase?: string }
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

// Cap any single network request so a stalled connection on mobile data
// doesn't leave the UI stuck in "Syncing…" forever.
const NETWORK_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: PromiseLike<T>, label: string, ms = NETWORK_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function syncNow(): Promise<void> {
  if (!cloudEnabled || !supabase) return;
  const userId = getAuthUserId();
  if (!userId) return;
  if (syncing) return;
  syncing = true;
  setStatus({ kind: 'running' });
  try {
    setStatus({ kind: 'running', phase: 'Pushing' });
    await pushDirty(userId);
    setStatus({ kind: 'running', phase: 'Pulling' });
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

  // Collect all dirty rows in parallel (4 fast indexed Dexie reads)
  const [allDirtyGroups, allDirtyPeople, dirtyExpenses, dirtySettlements] =
    await Promise.all([
      db.groups.where('dirty').equals(1).toArray(),
      db.people.where('dirty').equals(1).toArray(),
      db.expenses.where('dirty').equals(1).toArray(),
      db.settlements.where('dirty').equals(1).toArray(),
    ]);

  // Push only groups we own — others were pulled and shouldn't be re-upserted
  // by us under our owner_id.
  const myGroups = allDirtyGroups.filter(
    (g) => !g.ownerId || g.ownerId === userId,
  );

  // People are a per-user global pool (the "Me" person has no group). Push
  // them all — RLS keys off groups.member_ids and linked_user_id.
  const dirtyPeople = allDirtyPeople;

  // Fast-path: nothing dirty anywhere → skip the network entirely
  if (
    !myGroups.length &&
    !dirtyPeople.length &&
    !dirtyExpenses.length &&
    !dirtySettlements.length
  ) {
    return;
  }

  // Groups must commit first (FK target for the rest)
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
    const { error } = await withTimeout(supabase.from('groups').upsert(rows), 'push groups');
    if (error) throw error;
  }

  // The remaining three tables have no inter-FK so they can go in parallel
  await Promise.all([
    dirtyPeople.length
      ? withTimeout(
          supabase
            .from('people')
            .upsert(
              dirtyPeople.map((p) => ({
                id: p.id,
                group_id: p.groupId ?? null,
                name: p.name,
                avatar_color: p.avatarColor,
                linked_user_id: p.linkedUserId ?? null,
                updated_at: toIso(p.updatedAt) ?? new Date().toISOString(),
                deleted_at: toIso(p.deletedAt),
              })),
            )
            .then((r) => {
              if (r.error) throw r.error;
            }),
          'push people',
        )
      : Promise.resolve(),
    dirtyExpenses.length
      ? withTimeout(
          supabase
            .from('expenses')
            .upsert(
              dirtyExpenses.map((e) => ({
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
              })),
            )
            .then((r) => {
              if (r.error) throw r.error;
            }),
          'push expenses',
        )
      : Promise.resolve(),
    dirtySettlements.length
      ? withTimeout(
          supabase
            .from('settlements')
            .upsert(
              dirtySettlements.map((s) => ({
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
              })),
            )
            .then((r) => {
              if (r.error) throw r.error;
            }),
          'push settlements',
        )
      : Promise.resolve(),
  ]);

  // Clear dirty flags in bulk per table (single write transaction, no per-row update)
  await db.transaction(
    'rw',
    [db.groups, db.people, db.expenses, db.settlements],
    async () => {
      if (myGroups.length) {
        await db.groups.bulkPut(
          myGroups.map((g) => ({ ...g, dirty: 0, ownerId: g.ownerId ?? userId })),
        );
      }
      if (dirtyPeople.length) {
        await db.people.bulkPut(dirtyPeople.map((p) => ({ ...p, dirty: 0 })));
      }
      if (dirtyExpenses.length) {
        await db.expenses.bulkPut(
          dirtyExpenses.map((e) => ({ ...e, dirty: 0, ownerId: e.ownerId ?? userId })),
        );
      }
      if (dirtySettlements.length) {
        await db.settlements.bulkPut(
          dirtySettlements.map((s) => ({ ...s, dirty: 0, ownerId: s.ownerId ?? userId })),
        );
      }
    },
  );
}

async function pullSince(): Promise<void> {
  if (!supabase) return;
  const prefs = await db.preferences.get('singleton');
  const since = prefs?.lastPulledAt ?? 0;
  // Back the watermark off by a generous buffer to tolerate clock skew.
  const sinceIso = new Date(since - 60_000).toISOString();
  const startedAt = Date.now();

  // For a periodic sync we expect nothing changed — cap the response size
  // so a misbehaving query can't dump the whole table over a slow link.
  const PULL_LIMIT = 1000;
  const fetchTable = <T>(table: string) =>
    withTimeout(
      supabase!
        .from(table)
        .select('*')
        .gt('updated_at', sinceIso)
        .order('updated_at', { ascending: true })
        .limit(PULL_LIMIT)
        .then(unwrap<T[]>),
      `pull ${table}`,
    );

  const [groups, people, expenses, settlements] = await Promise.all([
    fetchTable<CloudGroup>('groups'),
    fetchTable<CloudPerson>('people'),
    fetchTable<CloudExpense>('expenses'),
    fetchTable<CloudSettlement>('settlements'),
  ]);

  const hasWork =
    groups.length || people.length || expenses.length || settlements.length;

  if (hasWork) {
    setStatus({ kind: 'running', phase: 'Saving' });
    await mergeBulk(groups, people, expenses, settlements);
  }

  await db.preferences.update('singleton', { lastPulledAt: startedAt });
}

function unwrap<T>(res: { data: T | null; error: Error | null }): T {
  if (res.error) throw res.error;
  return (res.data ?? ([] as unknown as T)) as T;
}

// Bulk LWW merge — read all locals in one bulkGet per table, decide in memory,
// then bulkPut. Avoids the get-then-put-per-row pattern that hurts on mobile
// IndexedDB.
async function mergeBulk(
  groups: CloudGroup[],
  people: CloudPerson[],
  expenses: CloudExpense[],
  settlements: CloudSettlement[],
): Promise<void> {
  await db.transaction(
    'rw',
    [db.groups, db.people, db.expenses, db.settlements],
    async () => {
      if (groups.length) {
        const locals = await db.groups.bulkGet(groups.map((g) => g.id));
        const merged: Group[] = [];
        groups.forEach((g, i) => {
          const local = locals[i];
          const remoteUpdated = new Date(g.updated_at).getTime();
          if (local?.dirty && (local.updatedAt ?? 0) >= remoteUpdated) return;
          merged.push({
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
          });
        });
        if (merged.length) await db.groups.bulkPut(merged);
      }

      if (people.length) {
        const locals = await db.people.bulkGet(people.map((p) => p.id));
        const merged: Person[] = [];
        people.forEach((p, i) => {
          const local = locals[i];
          const remoteUpdated = new Date(p.updated_at).getTime();
          if (local?.dirty && (local.updatedAt ?? 0) >= remoteUpdated) return;
          merged.push({
            id: p.id,
            name: p.name,
            avatarColor: p.avatar_color,
            createdAt: toMs(p.created_at) ?? Date.now(),
            updatedAt: remoteUpdated,
            deletedAt: toMs(p.deleted_at),
            groupId: p.group_id,
            linkedUserId: p.linked_user_id ?? undefined,
            dirty: 0,
          });
        });
        if (merged.length) await db.people.bulkPut(merged);
      }

      if (expenses.length) {
        const locals = await db.expenses.bulkGet(expenses.map((e) => e.id));
        const merged: Expense[] = [];
        expenses.forEach((e, i) => {
          const local = locals[i];
          const remoteUpdated = new Date(e.updated_at).getTime();
          if (local?.dirty && (local.updatedAt ?? 0) >= remoteUpdated) return;
          merged.push({
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
          });
        });
        if (merged.length) await db.expenses.bulkPut(merged);
      }

      if (settlements.length) {
        const locals = await db.settlements.bulkGet(settlements.map((s) => s.id));
        const merged: Settlement[] = [];
        settlements.forEach((s, i) => {
          const local = locals[i];
          const remoteUpdated = new Date(s.updated_at).getTime();
          if (local?.dirty && (local.updatedAt ?? 0) >= remoteUpdated) return;
          merged.push({
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
          });
        });
        if (merged.length) await db.settlements.bulkPut(merged);
      }
    },
  );
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

/** Mark every local row as dirty and reset the pull watermark, then sync.
 *  Useful when something went wrong and you want to force a complete reupload
 *  and redownload without losing local-only data. */
export async function forceFullResync(): Promise<void> {
  const now = Date.now();
  await db.transaction(
    'rw',
    [db.groups, db.people, db.expenses, db.settlements, db.preferences],
    async () => {
      const dirtyAll = async <T extends { dirty?: 0 | 1; updatedAt?: number }>(
        table: { toArray: () => Promise<T[]>; bulkPut: (rows: T[]) => Promise<unknown> },
      ) => {
        const rows = await table.toArray();
        if (rows.length) {
          await table.bulkPut(rows.map((r) => ({ ...r, dirty: 1, updatedAt: now })));
        }
      };
      await dirtyAll(db.groups);
      await dirtyAll(db.people);
      await dirtyAll(db.expenses);
      await dirtyAll(db.settlements);
      await db.preferences.update('singleton', { lastPulledAt: 0 });
    },
  );
  await syncNow();
}

// Boot: wire the scheduler so any mutation triggers a sync
setSyncRunner(syncNow);
