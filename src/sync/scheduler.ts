// Lightweight debouncer that triggers a sync after mutations.
// We import this from queries.ts but resolve the sync function lazily to
// avoid an import cycle with sync.ts.

let timer: ReturnType<typeof setTimeout> | null = null;
let runner: (() => Promise<void>) | null = null;

export function setSyncRunner(fn: (() => Promise<void>) | null) {
  runner = fn;
}

export function scheduleSync(delayMs = 600) {
  if (!runner) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const r = runner;
    if (r) void r().catch((err) => console.warn('[sync] failed', err));
  }, delayMs);
}

export function flushSync(): Promise<void> | undefined {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return runner?.();
}
