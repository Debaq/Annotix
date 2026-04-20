import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TrainingLogViewerProps {
  logs: string[];
  fillHeight?: boolean;
  canSave?: boolean;
}

export function TrainingLogViewer({ logs, fillHeight, canSave }: TrainingLogViewerProps) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(logs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('clipboard copy failed:', e);
    }
  };

  const handleSave = async () => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filePath = await save({
        filters: [{ name: 'Log', extensions: ['log', 'txt'] }],
        defaultPath: `training_${ts}.log`,
      });
      if (!filePath) return;
      await writeTextFile(filePath, logs.join('\n'));
    } catch (e) {
      console.error('save log failed:', e);
    }
  };

  const disabled = logs.length === 0;

  return (
    <div className={`border rounded-lg overflow-hidden flex flex-col ${fillHeight ? 'flex-1 min-h-0' : ''}`}>
      <div className="bg-zinc-900 px-3 py-1.5 flex items-center gap-2 shrink-0">
        <div className="flex gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
        </div>
        <span className="text-xs text-zinc-400">{t('training.monitor.logs')}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            disabled={disabled}
            title={t('training.monitor.copyLogs')}
            className="text-xs text-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors flex items-center gap-1"
          >
            <i className={copied ? 'fas fa-check text-emerald-400' : 'far fa-copy'} />
            <span>{copied ? t('training.monitor.copied') : t('training.monitor.copyLogs')}</span>
          </button>
          {canSave && (
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled}
              title={t('training.monitor.saveLogs')}
              className="text-xs text-zinc-400 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors flex items-center gap-1"
            >
              <i className="fas fa-floppy-disk" />
              <span>{t('training.monitor.saveLogs')}</span>
            </button>
          )}
        </div>
      </div>
      <ScrollArea className={`${fillHeight ? 'flex-1 min-h-0' : 'h-40'} bg-zinc-950 p-3 font-mono text-xs text-zinc-300`}>
        {logs.length === 0 ? (
          <span className="text-zinc-600">{t('training.monitor.waitingLogs')}</span>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="leading-5 whitespace-pre-wrap">
              {log}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </ScrollArea>
    </div>
  );
}
