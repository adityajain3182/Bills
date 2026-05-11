import Dexie, { type Table } from 'dexie';
import type { Group, Expense, Settlement, Preferences, Profile } from '../types';

export class BillsDB extends Dexie {
  groups!: Table<Group, string>;
  expenses!: Table<Expense, string>;
  settlements!: Table<Settlement, string>;
  profiles!: Table<Profile, string>;
  preferences!: Table<Preferences, 'singleton'>;

  constructor() {
    super('bills-db');

    // Legacy versions retained for upgrade path; v3 drops the old `people`
    // table and re-models groups around email-based members.
    this.version(1).stores({
      people: 'id, name, createdAt',
      groups: 'id, name, archived, createdAt',
      expenses: 'id, groupId, date, createdAt, [groupId+date]',
      settlements: 'id, groupId, fromPersonId, toPersonId, date, [groupId+date]',
      preferences: 'id',
    });
    this.version(2).stores({
      people: 'id, name, groupId, createdAt, updatedAt, dirty',
      groups: 'id, name, archived, createdAt, updatedAt, dirty',
      expenses: 'id, groupId, date, createdAt, updatedAt, dirty, [groupId+date]',
      settlements:
        'id, groupId, fromPersonId, toPersonId, date, createdAt, updatedAt, dirty, [groupId+date]',
      preferences: 'id',
    });

    // v3 — the email-based rewrite. We don't migrate v2 rows; the upgrade
    // wipes everything. Cloud and local both start from scratch.
    this.version(3)
      .stores({
        people: null, // drop
        groups: 'id, ownerEmail, archived, createdAt, updatedAt, dirty',
        expenses: 'id, groupId, date, createdAt, updatedAt, dirty, [groupId+date]',
        settlements:
          'id, groupId, fromEmail, toEmail, date, createdAt, updatedAt, dirty, [groupId+date]',
        profiles: 'email, userId, updatedAt',
        preferences: 'id',
      })
      .upgrade(async (tx) => {
        await tx.table('groups').clear();
        await tx.table('expenses').clear();
        await tx.table('settlements').clear();
        // Reset preferences too — the previous singleton has fields we no
        // longer use (mePersonId, authUserId, lastPulledAt).
        await tx.table('preferences').clear();
      });
  }
}

export const db = new BillsDB();

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
