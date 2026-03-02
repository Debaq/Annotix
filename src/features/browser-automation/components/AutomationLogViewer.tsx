import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  logs: string[];
}

export function AutomationLogViewer({ logs }: Props) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs.length]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-zinc-900 px-3 py-1.5 flex items-center gap-2">
        <div className="flex gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
        </div>
        <span className="text-xs text-zinc-400">{t('automation.controlPanel.logs')}</span>
      </div>
      <ScrollArea className="h-32 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
        {logs.length === 0 ? (
          <span className="text-zinc-600">{t('automation.controlPanel.waitingLogs')}</span>
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
