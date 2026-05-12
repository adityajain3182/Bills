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
  }
}

export const db = new BillsDB();

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
