import Dexie, { type Table } from 'dexie';
import type { Person, Group, Expense, Settlement, Preferences } from '../types';

export class BillsDB extends Dexie {
  people!: Table<Person, string>;
  groups!: Table<Group, string>;
  expenses!: Table<Expense, string>;
  settlements!: Table<Settlement, string>;
  preferences!: Table<Preferences, 'singleton'>;

  constructor() {
    super('bills-db');
    // v1 was the original local-only schema.
    this.version(1).stores({
      people: 'id, name, createdAt',
      groups: 'id, name, archived, createdAt',
      expenses: 'id, groupId, date, createdAt, [groupId+date]',
      settlements: 'id, groupId, fromPersonId, toPersonId, date, [groupId+date]',
      preferences: 'id',
    });
    // v2 added sync indexes for the (now-removed) Supabase integration.
    this.version(2).stores({
      people: 'id, name, groupId, createdAt, updatedAt, dirty',
      groups: 'id, name, archived, createdAt, updatedAt, dirty',
      expenses: 'id, groupId, date, createdAt, updatedAt, dirty, [groupId+date]',
      settlements:
        'id, groupId, fromPersonId, toPersonId, date, createdAt, updatedAt, dirty, [groupId+date]',
      preferences: 'id',
    });
    // v3 — back to local-only. Drop the sync indexes (the underlying fields
    // can stay on existing rows; they're harmless) and clean up any cloud
    // bookkeeping in preferences.
    this.version(3)
      .stores({
        people: 'id, name, createdAt',
        groups: 'id, name, archived, createdAt',
        expenses: 'id, groupId, date, createdAt, [groupId+date]',
        settlements: 'id, groupId, fromPersonId, toPersonId, date, [groupId+date]',
        preferences: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('preferences')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            delete row.lastPulledAt;
            delete row.authUserId;
          });
      });

    // v4 — reset for the offline-only rewrite. Some prior builds wrote
    // groups in an email-based shape (`members: [{email, …}]`, no
    // `memberIds`) which crashes the current code that expects
    // `memberIds: string[]`. Detect that shape and wipe affected tables
    // so the user starts from a clean slate. Pure v1/v2 rows pass
    // through untouched.
    this.version(4)
      .stores({
        people: 'id, name, createdAt',
        groups: 'id, name, archived, createdAt',
        expenses: 'id, groupId, date, createdAt, [groupId+date]',
        settlements: 'id, groupId, fromPersonId, toPersonId, date, [groupId+date]',
        preferences: 'id',
      })
      .upgrade(async (tx) => {
        // Strip any leftover cloud bookkeeping from preferences (handles
        // the case where the v3 upgrade was skipped because the user came
        // from an off-trunk schema).
        await tx
          .table('preferences')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            delete row.lastPulledAt;
            delete row.authUserId;
            delete row.myEmail;
            delete row.myDisplayName;
            delete row.myAvatarColor;
          });

        const groups = await tx.table('groups').toArray();
        const hasEmailShape = groups.some(
          (g: Record<string, unknown>) =>
            'members' in g || !Array.isArray(g.memberIds),
        );
        if (hasEmailShape) {
          await tx.table('groups').clear();
          await tx.table('expenses').clear();
          await tx.table('settlements').clear();
          await tx.table('people').clear();
          // Also clear mePersonId so onboarding kicks in cleanly.
          await tx
            .table('preferences')
            .toCollection()
            .modify((row: Record<string, unknown>) => {
              row.mePersonId = null;
              row.onboarded = 0;
            });
        }
      });

    // v5 — introduce the simplifyDebts preference. Existing users default
    // to enabled (1) so behaviour doesn't change for anyone who'd already
    // been using the (then-implicit) simplified view.
    this.version(5).upgrade(async (tx) => {
      await tx
        .table('preferences')
        .toCollection()
        .modify((row: Record<string, unknown>) => {
          if (row.simplifyDebts !== 0 && row.simplifyDebts !== 1) {
            row.simplifyDebts = 1;
          }
        });
    });
  }
}

export const db = new BillsDB();

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
