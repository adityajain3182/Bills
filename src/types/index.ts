export type ID = string;
export type Email = string; // always stored lowercase

export type SplitMethod = 'equal' | 'exact' | 'percent' | 'shares';

// Sentinel "ownerEmail" used by groups created before the user signs in.
// On first sync after sign-in we rewrite these to the real email.
export const LOCAL_OWNER = 'local@local';

export interface SyncFields {
  updatedAt: number;
  deletedAt?: number;
  /** Local-only flag — true if row has unpushed changes. Not synced. */
  dirty?: 0 | 1;
}

export interface GroupMember {
  email: Email;
  /** Snapshot of the name at invite time, before the invitee signs in. */
  displayName?: string;
}

export interface Group extends SyncFields {
  id: ID;
  name: string;
  emoji: string;
  currency: string;
  /** Email of the user who owns this group. Owners are the only writers. */
  ownerEmail: Email;
  members: GroupMember[];
  archived: 0 | 1;
  createdAt: number;
}

export interface PaidBy {
  email: Email;
  amount: number; // cents
}
export interface SplitShare {
  email: Email;
  amount: number; // cents
}

export interface EqualConfig {
  includedEmails: Email[];
}
export interface ExactConfig {
  amounts: Record<Email, number>;
}
export interface PercentConfig {
  percents: Record<Email, number>;
}
export interface SharesConfig {
  shares: Record<Email, number>;
}
export type SplitConfig = EqualConfig | ExactConfig | PercentConfig | SharesConfig;

export interface Expense extends SyncFields {
  id: ID;
  groupId: ID;
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
  createdAt: number;
}

export interface Settlement extends SyncFields {
  id: ID;
  groupId: ID;
  fromEmail: Email;
  toEmail: Email;
  amount: number;
  currency: string;
  date: number;
  note?: string;
  createdAt: number;
}

/** Cached profile row, populated from the cloud. Renders names + colors. */
export interface Profile {
  email: Email;
  displayName: string;
  avatarColor: string;
  userId?: string;
}

export interface Preferences {
  id: 'singleton';
  /** Either the user's real email (post sign-in) or LOCAL_OWNER pre sign-in. */
  myEmail: Email;
  myDisplayName: string;
  myAvatarColor: string;
  defaultCurrency: string;
  onboarded: 0 | 1;
  installPromptDismissed: 0 | 1;
  visitCount: number;
  lastSyncedAt: number;
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

export function normalizeEmail(email: string): Email {
  return email.trim().toLowerCase();
}
export function isValidEmail(email: string): boolean {
  // intentionally permissive — UI validation, not security
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
export function colorForEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
export function displayNameForEmail(email: string): string {
  return email.split('@')[0] ?? email;
}
