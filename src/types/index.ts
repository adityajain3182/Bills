export type ID = string;

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares';

export interface Person {
  id: ID;
  name: string;
  avatarColor: string;
  createdAt: number;
}

export interface Group {
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
  amounts: Record<ID, number>;
}
export interface PercentConfig {
  percents: Record<ID, number>;
}
export interface SharesConfig {
  shares: Record<ID, number>;
}

export type SplitConfig = EqualConfig | ExactConfig | PercentConfig | SharesConfig;

export interface Expense {
  id: ID;
  groupId: ID;
  description: string;
  amount: number; // cents
  currency: string;
  date: number; // epoch ms
  paidBy: PaidBy[];
  splits: SplitShare[];
  splitMethod: SplitMethod;
  splitConfig: SplitConfig;
  category: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Settlement {
  id: ID;
  groupId: ID;
  fromPersonId: ID;
  toPersonId: ID;
  amount: number;
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
  /** When true (default), the Balances tab shows the minimized set of
   *  transactions via greedy creditor↔debtor matching. When false, it shows
   *  the raw "who owes whom" pairwise debts straight from the expense log. */
  simplifyDebts: 0 | 1;
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
