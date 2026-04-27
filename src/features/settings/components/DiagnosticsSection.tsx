import { useEffect, useState, useSyncExternalStore, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/hooks/use-toast';
import {
  clearDiagLog,
  formatDiagEntries,
  getDiagEntries,
  subscribeDiag,
  type DiagLevel,
} from '@/lib/diagnosticsLog';

type LogFileEntry = {
  name: string;
  bytes: number;
  modifiedMs: number;
};

type LogDirInfo = {
  path: string;
  exists: boolean;
  fileCount: number;
  totalBytes: number;
  totalHuman: string;
  files: LogFileEntry[];
};

function humanBytes(b: number): string {
  if (b >= 1024 * 1024 * 1024) return `${(b / (1024 ** 3)).toFixed(1)} GB`;
  if (b >= 1024 * 1024) return `${(b / (1024 ** 2)).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

const LEVEL_FILTERS: Array<{ id: 'all' | DiagLevel; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'error', label: 'Errors' },
  { id: 'warn', label: 'Warnings' },
  { id: 'info', label: 'Info' },
];

const LEVEL_COLOR: Record<DiagLevel, string> = {
  error: 'text-red-500',
  warn: 'text-yellow-500',
  info: 'text-blue-400',
};

export function DiagnosticsSection() {
  const { t } = useTranslation();
  const entries = useSyncExternalStore(subscribeDiag, getDiagEntries, getDiagEntries);
  const [filter, setFilter] = useState<'all' | DiagLevel>('all');
  const [autoScroll, setAutoScroll] = useState(true);

  const filtered = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.level === filter)),
    [entries, filter],
  );

  useEffect(() => {
    if (!autoScroll) return;
    const el = document.getElementById('annotix-diag-pre');
    if (el) el.scrollTop = el.scrollHeight;
  }, [filtered, autoScroll]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(formatDiagEntries(filtered));
      toast({ title: t('settings.diagnostics.copied'), duration: 2500 });
    } catch (e) {
      toast({ title: String(e), variant: 'destructive' });
    }
  };

  const [logInfo, setLogInfo] = useState<LogDirInfo | null>(null);

  const refreshLogInfo = useCallback(async () => {
    try {
      const info = await invoke<LogDirInfo>('get_log_dir_info');
      setLogInfo(info);
    } catch (e) {
      console.error('get_log_dir_info', e);
    }
  }, []);

  useEffect(() => {
    refreshLogInfo();
  }, [refreshLogInfo]);

  const openLogFolder = async () => {
    try {
      await invoke('open_log_dir');
      refreshLogInfo();
    } catch (e) {
      toast({ title: String(e), variant: 'destructive' });
    }
  };

  const copyLogPath = async () => {
    if (!logInfo) return;
    try {
      await navigator.clipboard.writeText(logInfo.path);
      toast({ title: t('settings.diagnostics.logFiles.pathCopied'), duration: 2500 });
    } catch (e) {
      toast({ title: String(e), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
        <div>
          <h3 className="text-sm font-semibold">{t('settings.diagnostics.logFiles.title')}</h3>
          <p className="text-xs text-muted-foreground">
            {t('settings.diagnostics.logFiles.description')}
          </p>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-2">
            <span className="font-medium text-muted-foreground shrink-0">
              {t('settings.diagnostics.logFiles.path')}:
            </span>
            <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono">
              {logInfo?.path ?? '...'}
            </code>
          </div>
          {logInfo && (
            <div className="text-muted-foreground">
              {t('settings.diagnostics.logFiles.totalLabel')}: {logInfo.fileCount} ·{' '}
              {logInfo.totalHuman}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="default" onClick={openLogFolder} disabled={!logInfo}>
            <i className="fas fa-folder-open mr-2" />
            {t('settings.diagnostics.logFiles.openFolder')}
          </Button>
          <Button size="sm" variant="outline" onClick={copyLogPath} disabled={!logInfo}>
            <i className="fas fa-copy mr-2" />
            {t('settings.diagnostics.logFiles.copyPath')}
          </Button>
          <Button size="sm" variant="ghost" onClick={refreshLogInfo}>
            <i className="fas fa-sync mr-2" />
            ↻
          </Button>
        </div>
        {logInfo && logInfo.files.length > 0 ? (
          <ul className="max-h-40 overflow-auto rounded border bg-background text-xs font-mono">
            {logInfo.files.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between border-b px-2 py-1 last:border-0"
              >
                <span className="truncate">{f.name}</span>
                <span className="ml-2 shrink-0 text-muted-foreground">
                  {humanBytes(f.bytes)} ·{' '}
                  {new Date(f.modifiedMs).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          logInfo && (
            <div className="text-xs text-muted-foreground italic">
              {t('settings.diagnostics.logFiles.noFiles')}
            </div>
          )
        )}
      </section>

      <p className="text-sm text-muted-foreground">{t('settings.diagnostics.description')}</p>

      <div className="flex flex-wrap items-center gap-2">
        {LEVEL_FILTERS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filter === f.id ? 'default' : 'outline'}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            {f.id !== 'all' && (
              <span className="ml-1 text-xs opacity-70">
                {entries.filter((e) => e.level === f.id).length}
              </span>
            )}
          </Button>
        ))}
        <div className="ml-auto flex gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            {t('settings.diagnostics.autoScroll')}
          </label>
          <Button size="sm" variant="outline" onClick={copyAll} disabled={filtered.length === 0}>
            <i className="fas fa-copy mr-2" />
            {t('settings.diagnostics.copy')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={clearDiagLog}
            disabled={entries.length === 0}
          >
            <i className="fas fa-trash mr-2" />
            {t('settings.diagnostics.clear')}
          </Button>
        </div>
      </div>

      <pre
        id="annotix-diag-pre"
        className="select-text text-xs font-mono bg-black/80 text-gray-200 rounded-lg p-3 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words"
      >
        {filtered.length === 0
          ? t('settings.diagnostics.empty')
          : filtered.map((e, i) => {
              const ts = new Date(e.ts).toLocaleTimeString();
              return (
                <div key={i}>
                  <span className="text-gray-500">{ts}</span>{' '}
                  <span className={`font-bold ${LEVEL_COLOR[e.level]}`}>
                    [{e.level.toUpperCase()}]
                  </span>{' '}
                  <span className="text-purple-400">{e.source}</span>
                  {': '}
                  <span>{e.message}</span>
                </div>
              );
            })}
      </pre>
    </div>
  );
}
