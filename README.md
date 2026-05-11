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
