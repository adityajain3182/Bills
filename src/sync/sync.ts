import { cloudEnabled, supabase } from './supabase';
import { db } from '../db/db';
import { getAuthUserEmail } from './auth';
import { setSyncRunner } from './scheduler';
import type { Expense, Group, GroupMember, Profile, Settlement } from '../types';
import { LOCAL_OWNER, colorForEmail, displayNameForEmail, normalizeEmail } from '../types';

// ---- Cloud row shapes ----------------------------------------------

interface CloudProfile {
  user_id: string;
  email: string;
  display_name: string;
  avatar_color: string;
  default_currency: string;
  created_at: string;
  updated_at: string;
}
interface CloudGroup {
  id: string;
  name: string;
  emoji: string;
  currency: string;
  owner_email: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
interface CloudGroupMember {
  group_id: string;
  email: string;
  display_name: string | null;
  added_by_email: string | null;
  added_at: string;
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
  paid_by: { email: string; amount: number }[];
  splits: { email: string; amount: number }[];
  split_method: string;
  split_config: unknown;
  category: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
interface CloudSettlement {
  id: string;
  group_id: string;
  from_email: string;
  to_email: string;
  amount: number;
  currency: string;
  date: number;
  note: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

const toMs = (iso: string | null | undefined): number | undefined =>
  iso ? new Date(iso).getTime() : undefined;
const toIso = (ms: number | undefined): string | null =>
  ms ? new Date(ms).toISOString() : null;

// ---- Status pub/sub ------------------------------------------------

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'running'; phase?: string }
  | { kind: 'ok'; at: number }
  | { kind: 'error'; message: string };

const listeners = new Set<(s: SyncStatus) => void>();
let status: SyncStatus = { kind: 'idle' };
function setStatus(next: SyncStatus) {
  status = next;
  for (const fn of listeners) fn(status);
}
export function subscribeSync(fn: (s: SyncStatus) => void): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}
export function getSyncStatus(): SyncStatus {
  return status;
}

// ---- Network helper ------------------------------------------------

const TIMEOUT_MS = 20_000;
function withTimeout<T>(p: PromiseLike<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? ([] as unknown as T)) as T;
}

// ---- Main entry -----------------------------------------------------

let syncing = false;
let queuedAgain = false;

export async function syncNow(): Promise<void> {
  if (!cloudEnabled || !supabase) return;
  const myEmail = getAuthUserEmail();
  if (!myEmail) return;
  if (syncing) {
    queuedAgain = true;
    return;
  }
  syncing = true;
  setStatus({ kind: 'running', phase: 'Preparing' });
  try {
    await ensureMyProfile(myEmail);
    setStatus({ kind: 'running', phase: 'Pushing' });
    await pushDirty(myEmail);
    setStatus({ kind: 'running', phase: 'Pulling' });
    await pullSince(myEmail);
    setStatus({ kind: 'ok', at: Date.now() });
  } catch (err) {
    console.warn('[sync] failed', err);
    setStatus({ kind: 'error', message: (err as Error).message });
  } finally {
    syncing = false;
    if (queuedAgain) {
      queuedAgain = false;
      // Re-run on the next tick to avoid recursive stack
      setTimeout(() => void syncNow(), 100);
    }
  }
}

// ---- Profile --------------------------------------------------------

async function ensureMyProfile(myEmail: string): Promise<void> {
  const prefs = await db.preferences.get('singleton');
  if (!supabase) return;
  await withTimeout(
    supabase
      .from('profiles')
      .upsert({
        // user_id is filled by Postgres via the on-signup trigger; we still
        // need to identify the row by user_id when updating. Use the auth user
        // id from the session.
        email: myEmail,
        display_name: prefs?.myDisplayName || displayNameForEmail(myEmail),
        avatar_color: prefs?.myAvatarColor || colorForEmail(myEmail),
        default_currency: prefs?.defaultCurrency || 'USD',
      })
      .then((r) => {
        // Profiles already get autoCreated on signup. We may not have INSERT
        // permission if the trigger hasn't fired yet — best effort.
        if (r.error && !r.error.message.toLowerCase().includes('duplicate')) {
          // Don't throw — sign-in still works without profile upsert
          console.warn('[sync] profile upsert', r.error.message);
        }
      }),
    'upsert profile',
  );
}

// ---- Push -----------------------------------------------------------

async function pushDirty(myEmail: string): Promise<void> {
  if (!supabase) return;

  // Pull all dirty rows in parallel
  const [dirtyGroups, dirtyExpenses, dirtySettlements] = await Promise.all([
    db.groups.where('dirty').equals(1).toArray(),
    db.expenses.where('dirty').equals(1).toArray(),
    db.settlements.where('dirty').equals(1).toArray(),
  ]);

  // Only push groups that I own. Groups owned by someone else are still
  // dirty locally if I added an expense or settlement — those go via the
  // expenses/settlements push instead. The group row itself is read-only
  // to non-owners.
  const myGroups = dirtyGroups.filter(
    (g) => g.ownerEmail === myEmail || g.ownerEmail === LOCAL_OWNER,
  );

  if (!myGroups.length && !dirtyExpenses.length && !dirtySettlements.length) {
    // For shared groups we may still have dirty rows belonging to other
    // owners' groups (e.g. an expense we created) — those went through the
    // expenses/settlements arrays above. Nothing else to do.
    return;
  }

  // 1) Push my groups (FK target for everything else)
  if (myGroups.length) {
    const rows = myGroups.map((g) => ({
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      currency: g.currency,
      owner_email: myEmail,
      archived: !!g.archived,
      updated_at: toIso(g.updatedAt) ?? new Date().toISOString(),
      deleted_at: toIso(g.deletedAt),
    }));
    const r = await withTimeout(supabase.from('groups').upsert(rows), 'push groups');
    if (r.error) throw new Error(`groups: ${r.error.message}`);

    // Push members for my groups (full replace per group is simplest and
    // matches user intent — they edited the member list locally).
    for (const g of myGroups) {
      const members = g.members.map((m) => ({
        group_id: g.id,
        email: normalizeEmail(m.email),
        display_name: m.displayName ?? null,
        added_by_email: myEmail,
      }));
      if (members.length) {
        const mr = await withTimeout(
          supabase.from('group_members').upsert(members, { onConflict: 'group_id,email' }),
          'push members',
        );
        if (mr.error) throw new Error(`group_members: ${mr.error.message}`);
      }
    }
  }

  // 2) Push expenses + settlements in parallel
  await Promise.all([
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
                paid_by: e.paidBy.map((p) => ({ email: normalizeEmail(p.email), amount: p.amount })),
                splits: e.splits.map((s) => ({ email: normalizeEmail(s.email), amount: s.amount })),
                split_method: e.splitMethod,
                split_config: e.splitConfig,
                category: e.category,
                notes: e.notes ?? null,
                updated_at: toIso(e.updatedAt) ?? new Date().toISOString(),
                deleted_at: toIso(e.deletedAt),
              })),
            )
            .then((r) => {
              if (r.error) throw new Error(`expenses: ${r.error.message}`);
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
                from_email: normalizeEmail(s.fromEmail),
                to_email: normalizeEmail(s.toEmail),
                amount: s.amount,
                currency: s.currency,
                date: s.date,
                note: s.note ?? null,
                updated_at: toIso(s.updatedAt) ?? new Date().toISOString(),
                deleted_at: toIso(s.deletedAt),
              })),
            )
            .then((r) => {
              if (r.error) throw new Error(`settlements: ${r.error.message}`);
            }),
          'push settlements',
        )
      : Promise.resolve(),
  ]);

  // 3) Clear dirty flags
  await db.transaction('rw', [db.groups, db.expenses, db.settlements], async () => {
    if (myGroups.length) {
      await db.groups.bulkPut(
        myGroups.map((g) => ({ ...g, ownerEmail: myEmail, dirty: 0 as const })),
      );
    }
    if (dirtyExpenses.length) {
      await db.expenses.bulkPut(dirtyExpenses.map((e) => ({ ...e, dirty: 0 as const })));
    }
    if (dirtySettlements.length) {
      await db.settlements.bulkPut(dirtySettlements.map((s) => ({ ...s, dirty: 0 as const })));
    }
  });
}

// ---- Pull -----------------------------------------------------------

async function pullSince(_myEmail: string): Promise<void> {
  if (!supabase) return;
  const prefs = await db.preferences.get('singleton');
  const since = (prefs?.lastSyncedAt ?? 0) - 60_000; // skew buffer
  const sinceIso = new Date(since).toISOString();
  const startedAt = Date.now();
  const LIMIT = 1000;

  const fetchTable = <T>(table: string) =>
    withTimeout(
      supabase!
        .from(table)
        .select('*')
        .gt('updated_at', sinceIso)
        .order('updated_at', { ascending: true })
        .limit(LIMIT)
        .then(unwrap<T[]>),
      `pull ${table}`,
    );

  const [groups, members, expenses, settlements] = await Promise.all([
    fetchTable<CloudGroup>('groups'),
    fetchTable<CloudGroupMember>('group_members'),
    fetchTable<CloudExpense>('expenses'),
    fetchTable<CloudSettlement>('settlements'),
  ]);

  // Need to fetch every member row for any visible group, not just members
  // newer than `since`, because the group's members live in the same Dexie
  // row as the group. Easiest: fetch members for each group we just pulled
  // OR have locally.
  const groupIds = new Set<string>(groups.map((g) => g.id));
  for (const g of await db.groups.toArray()) {
    if (!g.deletedAt) groupIds.add(g.id);
  }
  let allMembers: CloudGroupMember[] = members;
  if (groupIds.size) {
    const r = await withTimeout(
      supabase
        .from('group_members')
        .select('*')
        .in('group_id', [...groupIds])
        .then(unwrap<CloudGroupMember[]>),
      'pull members full',
    );
    allMembers = r;
  }

  // Collect every email we need a profile for
  const emails = new Set<string>();
  for (const m of allMembers) emails.add(normalizeEmail(m.email));
  for (const e of expenses) {
    for (const p of e.paid_by) emails.add(normalizeEmail(p.email));
    for (const s of e.splits) emails.add(normalizeEmail(s.email));
  }
  for (const s of settlements) {
    emails.add(normalizeEmail(s.from_email));
    emails.add(normalizeEmail(s.to_email));
  }
  let profiles: CloudProfile[] = [];
  if (emails.size) {
    const r = await withTimeout(
      supabase
        .from('profiles')
        .select('*')
        .in('email', [...emails])
        .then(unwrap<CloudProfile[]>),
      'pull profiles',
    );
    profiles = r;
  }

  await mergeBulk(groups, allMembers, expenses, settlements, profiles);
  await db.preferences.update('singleton', { lastSyncedAt: startedAt });
}

async function mergeBulk(
  groups: CloudGroup[],
  members: CloudGroupMember[],
  expenses: CloudExpense[],
  settlements: CloudSettlement[],
  profiles: CloudProfile[],
): Promise<void> {
  // Index members by group_id for join
  const membersByGroup = new Map<string, GroupMember[]>();
  for (const m of members) {
    if (m.deleted_at) continue;
    const arr = membersByGroup.get(m.group_id) ?? [];
    arr.push({ email: normalizeEmail(m.email), displayName: m.display_name ?? undefined });
    membersByGroup.set(m.group_id, arr);
  }

  await db.transaction(
    'rw',
    [db.groups, db.expenses, db.settlements, db.profiles],
    async () => {
      // Profiles — straight bulkPut
      if (profiles.length) {
        const rows: Profile[] = profiles.map((p) => ({
          email: normalizeEmail(p.email),
          displayName: p.display_name || displayNameForEmail(p.email),
          avatarColor: p.avatar_color || colorForEmail(p.email),
          userId: p.user_id,
        }));
        await db.profiles.bulkPut(rows);
      }

      // Groups (LWW); attach members from the join
      if (groups.length) {
        const ids = groups.map((g) => g.id);
        const locals = await db.groups.bulkGet(ids);
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
            ownerEmail: normalizeEmail(g.owner_email),
            archived: g.archived ? 1 : 0,
            members: membersByGroup.get(g.id) ?? local?.members ?? [],
            createdAt: toMs(g.created_at) ?? Date.now(),
            updatedAt: remoteUpdated,
            deletedAt: toMs(g.deleted_at),
            dirty: 0,
          });
        });
        if (merged.length) await db.groups.bulkPut(merged);
      }

      // Update members on locally-existing groups too (for member changes
      // pulled without the group itself bumping updated_at — rare, but)
      const localGroupsToTouch = await db.groups.bulkGet([...membersByGroup.keys()]);
      const memberOnly: Group[] = [];
      localGroupsToTouch.forEach((g) => {
        if (!g) return;
        const nextMembers = membersByGroup.get(g.id);
        if (!nextMembers) return;
        const same =
          nextMembers.length === g.members.length &&
          nextMembers.every((m, i) => g.members[i]?.email === m.email);
        if (!same) {
          memberOnly.push({ ...g, members: nextMembers });
        }
      });
      if (memberOnly.length) await db.groups.bulkPut(memberOnly);

      // Expenses (LWW)
      if (expenses.length) {
        const ids = expenses.map((e) => e.id);
        const locals = await db.expenses.bulkGet(ids);
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
            paidBy: (e.paid_by ?? []).map((p) => ({
              email: normalizeEmail(p.email),
              amount: p.amount,
            })),
            splits: (e.splits ?? []).map((s) => ({
              email: normalizeEmail(s.email),
              amount: s.amount,
            })),
            splitMethod: e.split_method as Expense['splitMethod'],
            splitConfig: (e.split_config as Expense['splitConfig']) ?? { includedEmails: [] },
            category: e.category,
            notes: e.notes ?? undefined,
            createdAt: toMs(e.created_at) ?? Date.now(),
            updatedAt: remoteUpdated,
            deletedAt: toMs(e.deleted_at),
            dirty: 0,
          });
        });
        if (merged.length) await db.expenses.bulkPut(merged);
      }

      // Settlements (LWW)
      if (settlements.length) {
        const ids = settlements.map((s) => s.id);
        const locals = await db.settlements.bulkGet(ids);
        const merged: Settlement[] = [];
        settlements.forEach((s, i) => {
          const local = locals[i];
          const remoteUpdated = new Date(s.updated_at).getTime();
          if (local?.dirty && (local.updatedAt ?? 0) >= remoteUpdated) return;
          merged.push({
            id: s.id,
            groupId: s.group_id,
            fromEmail: normalizeEmail(s.from_email),
            toEmail: normalizeEmail(s.to_email),
            amount: Number(s.amount),
            currency: s.currency,
            date: Number(s.date),
            note: s.note ?? undefined,
            createdAt: toMs(s.created_at) ?? Date.now(),
            updatedAt: remoteUpdated,
            deletedAt: toMs(s.deleted_at),
            dirty: 0,
          });
        });
        if (merged.length) await db.settlements.bulkPut(merged);
      }
    },
  );
}

// Wire the mutation-triggered sync
setSyncRunner(syncNow);
