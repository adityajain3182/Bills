/**
 * Deterministic in-app back navigation. Instead of `history.back()` (which
 * retraces the user's chronological path and can loop), every route has a
 * single logical parent. The Header back button navigates to that parent
 * directly, so the user always walks up the app's tree.
 *
 *   /groups                        → root
 *   /groups/:id                    → /groups
 *   /groups/:id/add                → /groups/:id
 *   /groups/:id/edit/:expenseId    → /groups/:id
 *   /groups/:id/settle             → /groups/:id
 *   /friends                       → root
 *   /activity                      → root
 *   /settings                      → root
 */
export function parentRouteFor(pathname: string): string | null {
  // Strip any trailing slash so /groups/abc/ matches /groups/abc.
  const path = pathname.replace(/\/+$/, '');

  // /groups/:id/add | /edit/:eid | /settle  → /groups/:id
  const childMatch = path.match(/^\/groups\/([^/]+)\/(add|edit|settle)(\/.+)?$/);
  if (childMatch) return `/groups/${childMatch[1]}`;

  // /groups/:id → /groups
  if (/^\/groups\/[^/]+$/.test(path)) return '/groups';

  // Root tabs and unknown paths have no parent.
  return null;
}
