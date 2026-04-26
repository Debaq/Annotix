import { useEffect, useState, useSyncExternalStore, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/hooks/use-toast';
import {
  clearDiagLog,
  formatDiagEntries,
  getDiagEntries,
  subscribeDiag,
  type DiagLevel,
} from '@/lib/diagnosticsLog';

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

  return (
    <div className="space-y-4">
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
