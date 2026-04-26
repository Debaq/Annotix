// Diagnostics ring buffer + console/error capture for end-user troubleshooting.
// Surfaces frontend errors in Settings so users can copy-paste them when
// reporting issues (no devtools available in release Windows builds).

export type DiagLevel = 'error' | 'warn' | 'info';

export interface DiagEntry {
  ts: number;
  level: DiagLevel;
  source: string;
  message: string;
}

const MAX_ENTRIES = 500;
const STORAGE_KEY = 'annotix-diag-log';

let entries: DiagEntry[] = [];
const listeners = new Set<() => void>();
let initialized = false;

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) entries = parsed.slice(-MAX_ENTRIES);
  } catch {
    /* ignore */
  }
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-200)));
  } catch {
    /* ignore (quota) */
  }
}

function emit(): void {
  for (const fn of listeners) fn();
}

function fmtArg(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === 'string') return v;
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ''}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function appLog(level: DiagLevel, source: string, ...args: unknown[]): void {
  const message = args.map(fmtArg).join(' ');
  entries.push({ ts: Date.now(), level, source, message });
  if (entries.length > MAX_ENTRIES) entries = entries.slice(-MAX_ENTRIES);
  persist();
  emit();
}

export function getDiagEntries(): DiagEntry[] {
  return entries;
}

export function clearDiagLog(): void {
  entries = [];
  persist();
  emit();
}

export function subscribeDiag(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function formatDiagEntries(items: DiagEntry[] = entries): string {
  return items
    .map((e) => {
      const t = new Date(e.ts).toISOString();
      return `[${t}] [${e.level.toUpperCase()}] ${e.source}: ${e.message}`;
    })
    .join('\n');
}

export function initDiagnostics(): void {
  if (initialized) return;
  initialized = true;
  loadFromStorage();

  const origError = console.error;
  const origWarn = console.warn;

  console.error = (...args: unknown[]) => {
    appLog('error', 'console', ...args);
    origError.apply(console, args as []);
  };
  console.warn = (...args: unknown[]) => {
    appLog('warn', 'console', ...args);
    origWarn.apply(console, args as []);
  };

  window.addEventListener('error', (ev: ErrorEvent) => {
    appLog('error', 'window.onerror', ev.message, ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : '');
  });

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    appLog('error', 'unhandledrejection', ev.reason);
  });

  appLog('info', 'diagnostics', `Annotix diagnostics started — ${navigator.userAgent}`);
}
