export type ID = string;

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares';

// Common sync fields stamped on every synced row.
export interface SyncFields {
  updatedAt: number;
  deletedAt?: number;
  /** Local-only flag — true if row has unpushed changes. Not synced. */
  dirty?: 0 | 1;
  /** Group this row belongs to (so we know which group's sync to use). */
  groupId?: ID;
  /** Auth user who created the row, when known. */
  ownerId?: string;
  /** If this person row represents a real auth user. */
  linkedUserId?: string;
}

export interface Person extends SyncFields {
  id: ID;
  name: string;
  avatarColor: string;
  createdAt: number;
  groupId?: ID; // people are scoped to a group when synced
}

export interface Group extends SyncFields {
  id: ID;
  name: string;
  emoji: string;
  currency: string;
  memberIds: ID[];
  createdAt: number;
  archived: 0 | 1; // Dexie indexes booleans poorly — use 0/1
}

export interface PaidBy {
  personId: ID;
  amount: number; // cents
}

export interface SplitShare {
  personId: ID;
  amount: number; // cents
}

export interface EqualConfig {
  includedIds: ID[];
}
export interface ExactConfig {
  amounts: Record<ID, number>; // cents
}
export interface PercentConfig {
  percents: Record<ID, number>; // 0..100 (one decimal allowed)
}
export interface SharesConfig {
  shares: Record<ID, number>; // integer >= 0
}

export type SplitConfig = EqualConfig | ExactConfig | PercentConfig | SharesConfig;

export interface Expense extends SyncFields {
  id: ID;
  groupId: ID;
  description: string;
  amount: number; // cents
  currency: string;
  date: number; // epoch ms (start of day)
  paidBy: PaidBy[];
  splits: SplitShare[];
  splitMethod: SplitMethod;
  splitConfig: SplitConfig;
  category: string;
  notes?: string;
  createdAt: number;
}

export interface Settlement extends SyncFields {
  id: ID;
  groupId: ID;
  fromPersonId: ID;
  toPersonId: ID;
  amount: number; // cents
  currency: string;
  date: number;
  note?: string;
  createdAt: number;
}

export interface Preferences {
  id: 'singleton';
  defaultCurrency: string;
  mePersonId: ID | null;
  onboarded: 0 | 1;
  installPromptDismissed: 0 | 1;
  visitCount: number;
  /** Last successful pull timestamp (ms). Used as the high-watermark. */
  lastPulledAt?: number;
  /** Auth user id, when signed in. */
  authUserId?: string | null;
}

export const CATEGORIES = [
  { id: 'general', label: 'General', emoji: '🧾' },
  { id: 'food', label: 'Food & Drink', emoji: '🍽️' },
  { id: 'groceries', label: 'Groceries', emoji: '🛒' },
  { id: 'rent', label: 'Rent', emoji: '🏠' },
  { id: 'utilities', label: 'Utilities', emoji: '💡' },
  { id: 'transport', label: 'Transport', emoji: '🚗' },
  { id: 'travel', label: 'Travel', emoji: '✈️' },
  { id: 'entertainment', label: 'Entertainment', emoji: '🎉' },
  { id: 'health', label: 'Health', emoji: '💊' },
  { id: 'gift', label: 'Gift', emoji: '🎁' },
  { id: 'other', label: 'Other', emoji: '✨' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const GROUP_EMOJIS = [
  '🏠', '🏖️', '✈️', '🍕', '🎉', '🎬', '⛺', '🚗',
  '🛒', '🍻', '🏔️', '🌮', '☕', '🎓', '💼', '🐶',
];

export const AVATAR_COLORS = [
  '#e8765a', '#1f3a2e', '#d4a05a', '#5a8fa3', '#a35a8f',
  '#7a9a4f', '#c44536', '#3d6a55', '#8a6b3d', '#5a6a9a',
];
