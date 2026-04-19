import { useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { useTranslation } from 'react-i18next';
import type {
  InferenceProgressEvent,
  InferenceResultEvent,
  InferenceErrorEvent,
  InferenceCompletedEvent,
} from '../types';

interface LogLine {
  ts: number;
  level: 'info' | 'ok' | 'warn' | 'err';
  text: string;
}

interface Props {
  open: boolean;
  total: number;
  fileNameById: Map<string, string>;
  onCancel?: () => void;
  onClose: () => void;
}

export function InferenceLogModal({ open, total, fileNameById, onCancel, onClose }: Props) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [current, setCurrent] = useState(0);
  const [done, setDone] = useState(false);
  const [totals, setTotals] = useState({ detections: 0, totalMs: 0, errors: 0 });
  const [copied, setCopied] = useState(false);
  const startRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileNameByIdRef = useRef(fileNameById);
  const tRef = useRef(t);
  fileNameByIdRef.current = fileNameById;
  tRef.current = t;

  useEffect(() => {
    if (!open) {
      setLines([]);
      setCurrent(0);
      setDone(false);
      setTotals({ detections: 0, totalMs: 0, errors: 0 });
      setCopied(false);
      startRef.current = null;
      return;
    }

    startRef.current = Date.now();
    const push = (level: LogLine['level'], text: string) =>
      setLines((prev) => [...prev, { ts: Date.now(), level, text }]);

    push('info', `▶ ${tRef.current('inference.log.start')} — ${total} ${tRef.current('inference.log.images')}`);

    const subs: Promise<UnlistenFn>[] = [];

    subs.push(
      listen<InferenceProgressEvent>('inference:progress', (e) => {
        setCurrent(e.payload.current);
      }),
    );

    subs.push(
      listen<InferenceResultEvent>('inference:result', (e) => {
        const p = e.payload;
        const name = fileNameByIdRef.current.get(p.imageId) ?? p.imageId.slice(0, 8);
        setCurrent(p.current);
        setTotals((prev) => ({
          ...prev,
          detections: prev.detections + p.predictionsCount,
          totalMs: prev.totalMs + p.inferenceTimeMs,
        }));
        push(
          'ok',
          `[${p.current}/${p.total}] ${name} — ${p.predictionsCount} det · ${p.inferenceTimeMs}ms`,
        );
      }),
    );

    subs.push(
      listen<InferenceErrorEvent>('inference:error', (e) => {
        const p = e.payload;
        const name = p.imageId ? (fileNameByIdRef.current.get(p.imageId) ?? p.imageId.slice(0, 8)) : '-';
        setTotals((prev) => ({ ...prev, errors: prev.errors + 1 }));
        push('err', `✖ ${name}: ${p.error}`);
      }),
    );

    subs.push(
      listen<InferenceCompletedEvent>('inference:completed', () => {
        const elapsed = startRef.current ? Date.now() - startRef.current : 0;
        push('info', `✔ ${tRef.current('inference.log.done')} — ${(elapsed / 1000).toFixed(1)}s`);
        setDone(true);
      }),
    );

    return () => {
      subs.forEach((p) => p.then((fn) => fn()).catch(() => {}));
    };
  }, [open, total]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  if (!open) return null;

  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const avgMs = current > 0 ? Math.round(totals.totalMs / current) : 0;
  const elapsedMs = startRef.current ? Date.now() - startRef.current : 0;
  const remaining = current > 0 && !done ? Math.max(0, Math.round((avgMs * (total - current)) / 1000)) : null;

  const colorFor = (lvl: LogLine['level']) =>
    lvl === 'ok' ? '#a3e635' : lvl === 'err' ? '#f87171' : lvl === 'warn' ? '#fbbf24' : '#94a3b8';

  const handleCopy = async () => {
    const text = lines.map((l) => l.text).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 92vw)',
          maxHeight: '80vh',
          background: '#0f172a',
          color: '#e2e8f0',
          borderRadius: 10,
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        <div
          style={{
            padding: '10px 14px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#1e293b',
          }}
        >
          <i className="fas fa-brain" style={{ color: '#a78bfa' }}></i>
          <span style={{ fontWeight: 600 }}>
            {t('inference.log.title')}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8' }}>
            {current}/{total} ({pct}%) · {totals.detections} det · ~{avgMs}ms/img
            {remaining !== null && ` · ETA ${remaining}s`}
          </span>
        </div>

        <div
          style={{
            height: 6,
            background: '#1e293b',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: done ? '#22c55e' : '#7c3aed',
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '10px 14px',
            fontSize: 12,
            lineHeight: 1.5,
            background: '#020617',
          }}
        >
          {lines.map((l, i) => (
            <div key={i} style={{ color: colorFor(l.level), whiteSpace: 'pre-wrap' }}>
              {l.text}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid #334155',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#1e293b',
            fontSize: 12,
            gap: 8,
          }}
        >
          <span style={{ color: '#94a3b8' }}>
            {t('inference.log.elapsed')}: {(elapsedMs / 1000).toFixed(1)}s
            {totals.errors > 0 && (
              <span style={{ color: '#f87171', marginLeft: 10 }}>
                · {totals.errors} {t('inference.log.errors')}
              </span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            {lines.length > 0 && (
              <button
                onClick={handleCopy}
                style={{
                  padding: '4px 14px',
                  background: copied ? '#0ea5e9' : '#334155',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <i className={`fas ${copied ? 'fa-check' : 'fa-copy'} mr-1`}></i>
                {copied
                  ? t('common.copied')
                  : t('common.copy')}
              </button>
            )}
            {done ? (
              <button
                onClick={onClose}
                style={{
                  padding: '4px 14px',
                  background: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {t('common.accept')}
              </button>
            ) : (
              onCancel && (
                <button
                  onClick={onCancel}
                  style={{
                    padding: '4px 14px',
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {t('common.cancel')}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
