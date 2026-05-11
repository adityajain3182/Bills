import Dexie, { type Table } from 'dexie';
import type {
  Person,
  Group,
  Expense,
  Settlement,
  Preferences,
} from '../types';

export class BillsDB extends Dexie {
  people!: Table<Person, string>;
  groups!: Table<Group, string>;
  expenses!: Table<Expense, string>;
  settlements!: Table<Settlement, string>;
  preferences!: Table<Preferences, 'singleton'>;

  constructor() {
    super('bills-db');
    this.version(1).stores({
      people: 'id, name, createdAt',
      groups: 'id, name, archived, createdAt',
      expenses: 'id, groupId, date, createdAt, [groupId+date]',
      settlements: 'id, groupId, fromPersonId, toPersonId, date, [groupId+date]',
      preferences: 'id',
    });
  }
}

export const db = new BillsDB();

export const newId = (): string =>
  // RFC4122-ish — sufficient for client-side IDs
  (globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
