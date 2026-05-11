# Tally — Bills

A mobile-first Progressive Web App for splitting expenses with friends and roommates. No accounts, no backend — everything is stored locally on your device via IndexedDB. Install it to your phone's home screen and use it offline.

> Built with Vite + React + TypeScript + Tailwind + Dexie + Zustand.

## Features

- **Groups** — create one for your trip, household, or anything. Emoji, currency, and member picker.
- **Expenses** — single or multiple payers; split equally, by exact amount, by percent, or by shares.
- **Penny-accurate splits** — money is stored as integer cents; remainders are distributed deterministically so amounts always reconcile.
- **Balances** — both raw "who owes whom" and a greedy, simplified view (minimizes settlement transactions).
- **Settle up** — partial or full settlements, pre-filled from the balances tab.
- **Activity feed** — chronological view of expenses + settlements, grouped by day.
- **Friends** — track everyone you split with across groups.
- **Export / Import** — back up your data as JSON; portable between devices.
- **Offline-first PWA** — installable to your home screen on iOS and Android, works with no network.
- **Optional cloud sync** — sign in with a magic link to sync across your devices and share groups with friends by email.

## Quick start

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
npm run test     # vitest unit tests
npm run build    # production build → dist/
npm run preview  # preview the build locally
```

## Project layout

```
src/
  components/      # Reusable UI (Button, Sheet, Avatar, AmountInput, ...)
  screens/         # Route-level screens
  db/              # Dexie schema + queries + reactive hooks
  store/           # Zustand UI store (toasts)
  lib/             # money / splits / simplify / balances / format (all unit-tested)
  styles/          # Tailwind entry
public/
  icons/           # PWA icons (192, 512, maskable 512, apple-touch)
```

## Money math — the part you should trust

All amounts are stored as integer **cents** internally. Conversion to decimal display happens only at render time, avoiding floating-point drift.

Equal splits use deterministic remainder distribution:

```ts
// $10.00 / 3 = $3.34 + $3.33 + $3.33   (not 3.33 × 3 = $9.99)
splitEqual(1000, 3) // [334, 333, 333]
```

Percent and share splits use the **largest-remainder method**: each share is floored to whole cents, then the leftover pennies are awarded to whichever recipients have the largest fractional remainder. This is deterministic and always reconciles exactly to the total.

Debt simplification (`lib/simplify.ts`) uses greedy creditor-debtor matching:

1. Compute net balance per person.
2. Sort creditors (positive) descending, debtors (negative) descending by magnitude.
3. Repeatedly settle min(creditor, debtor); emit one transaction; reduce both.
4. Stop when all balances hit zero.

This minimizes the number of payments needed (compared to the raw pairwise debts graph) while keeping the result net-equivalent.

## PWA install

### Android (Chrome, Edge, Brave)
Open the deployed URL in your browser → an "Install Tally" banner appears after your second visit → tap **Install**. Or use the browser's "Install app" / "Add to Home screen" menu item.

### iOS / iPadOS (Safari)
iOS does not show automatic install prompts. To install:
1. Open the deployed URL in **Safari** (not Chrome).
2. Tap the **Share** button at the bottom.
3. Scroll and tap **Add to Home Screen**.
4. Tap **Add** in the top right.

The app icon appears on your home screen; opening it launches Tally in standalone mode without browser chrome.

## Cloud sync (optional)

By default the app is fully local — your data only lives on this device. Enable optional cloud sync to share groups with friends and use the app on multiple devices.

### One-time Supabase setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com). Note the project URL and the **anon/public** key from **Project Settings → API**.
2. **Enable email auth**: **Authentication → Providers → Email** is enabled by default. Under **Authentication → URL Configuration**, set **Site URL** to your deployed app URL (e.g. `https://<user>.github.io/Bills/`) and add the same URL plus `http://localhost:5173/Bills/` to **Redirect URLs**.
3. **Run the schema**: open **SQL Editor**, paste `supabase/schema.sql` from this repo, run it. This creates the tables (`profiles`, `groups`, `group_members`, `expenses`, `settlements`), the row-level security policies, an `auth.users` trigger that auto-creates a profile on signup, and `updated_at` triggers. The script is destructive — it `DROP`s any old tables from previous schema versions before recreating. Safe to re-run.
4. **(Recommended) Add Google sign-in** so you aren't dependent on Supabase's email rate limit:
   - In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth 2.0 Client ID** (Web application). Add `https://<your-supabase-ref>.supabase.co/auth/v1/callback` as an authorized redirect URI.
   - In Supabase → **Authentication → Providers → Google**, paste the Client ID + Secret and enable it.
   - The "Continue with Google" button in the app now works — no email round-trip.
5. **(Optional) Custom SMTP** for higher email rate limits — Supabase's built-in mailer is capped at a few per hour. **Authentication → Emails → SMTP Settings** lets you plug in SendGrid / Resend / Postmark / your own mail server.
6. **Local dev**: copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. Restart `npm run dev`.
7. **Production**: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as **GitHub Actions repo secrets** (Repo → Settings → Secrets and variables → Actions). The deploy workflow passes them at build time. If you don't set them, the deployed app silently falls back to local-only mode.

### How sync works (v2 — email-based)

- **Members are emails.** When you create a group or add someone to it, you enter their email. That email is the identifier used end-to-end — no separate "person" entity, no claim flow, no drift between devices.
- Each cloud row has `updated_at` and `deleted_at`. Local mutations bump `updatedAt` and mark the row dirty. On mutation (debounced) and on tab focus, the client pushes dirty rows then pulls anything newer. Conflict resolution is last-write-wins per row.
- Deletes are soft so they propagate.
- **Inviting a friend**: as the group owner, tap **Group → Add member** and enter their email. The app pushes the membership immediately and sends them a sign-in link. The moment they sign in with that email (on any device), they see the group with all its expenses and settlements.
- Offline edits buffer locally and push the next time you have network + focus the app.

### Privacy

- Emails and display names are only visible to users who share a group with you (enforced by Row Level Security).
- Magic-link or Google auth — no passwords stored. Sessions live in `localStorage` and refresh automatically.
- Sign out from **Settings → Cloud sync → Sign out**; your local data stays.

### Upgrading from v1

The v2 schema is a clean rewrite. To upgrade an existing Supabase project, just re-run `supabase/schema.sql` — it drops the old `people` / `invites` / etc. tables and recreates the new ones. **Your existing cloud data will be erased**; export from one of your devices first via **Settings → Export to JSON** if you want a backup. Local IndexedDB on each device is also wiped on first launch of the new build (Dexie v3 migration); sign in afterwards to repopulate from cloud.

## Deploy to GitHub Pages

The repo includes `.github/workflows/deploy.yml` which builds and publishes the `dist/` folder to GitHub Pages on every push to `main`.

1. In your repo settings, go to **Settings → Pages** and set the source to **GitHub Actions**.
2. Push to `main`. The workflow runs, generates `dist/`, and deploys.
3. Visit `https://<your-username>.github.io/<repo-name>/`.

The workflow sets `VITE_BASE_PATH` from the repo name automatically, so the app's asset paths and PWA scope match the GitHub Pages subpath. For a custom domain, set `VITE_BASE_PATH=/` instead by editing `.github/workflows/deploy.yml`.

The build step also copies `dist/index.html` to `dist/404.html` so client-side routes (e.g. `/groups/abc`) work when refreshing or sharing deep links on GitHub Pages.

## Local development tips

- **Reset everything**: open DevTools → Application → IndexedDB → delete `bills-db`, then reload. Or use **Settings → Clear all data** inside the app.
- **iOS testing**: the install prompt only fires in real Safari, not iOS Chrome. To dev-test offline, build, run `npm run preview`, then point your iPhone to your laptop's IP on the same WiFi.
- **Service worker updates**: `registerType: 'autoUpdate'` means a refreshed tab picks up new versions; no manual cache busting needed.

## Tests

Unit tests cover the money math (splits, percentage/share remainders, simplify, balances). Run them with:

```bash
npm test
```

There are currently 27 tests across 4 files. The CI workflow runs them on every push and blocks deploy on failure.

## License

MIT — do whatever, no warranty.
