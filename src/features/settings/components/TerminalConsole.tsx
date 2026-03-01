import { useEffect, useRef } from 'react';

interface Props {
  logs: string[];
  maxHeight?: string;
}

export function TerminalConsole({ logs, maxHeight = "200px" }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div 
      ref={scrollRef}
      className="mt-3 rounded-lg bg-black/90 p-3 font-mono text-[10px] leading-relaxed text-green-400 overflow-y-auto border border-white/10"
      style={{ maxHeight }}
    >
      {logs.map((log, i) => {
        const isErr = log.startsWith('ERR:');
        return (
          <div key={i} className={isErr ? 'text-red-400' : ''}>
            <span className="opacity-50 mr-2">[{i + 1}]</span>
            {isErr ? log.substring(4) : log}
          </div>
        );
      })}
    </div>
  );
}
