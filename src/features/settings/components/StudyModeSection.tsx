import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { studyLog, type StudyStatus } from '../../study/studyLog';
import { open } from '@tauri-apps/plugin-dialog';

/** `session_id`: alfanumérico, guion y guion bajo, 3–32 caracteres. */
const SESSION_ID_RE = /^[A-Za-z0-9_-]{3,32}$/;

export function StudyModeSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<StudyStatus | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [condition, setCondition] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    studyLog
      .getStatus()
      .then((s) => {
        setStatus(s);
        setSessionId(s.sessionId);
        setCondition(s.condition);
      })
      .catch(() => {});
  }, []);

  const apply = async (enabled: boolean) => {
    setError(null);
    setNotice(null);
    if (enabled && !SESSION_ID_RE.test(sessionId.trim())) {
      setError(t('settings.study.errors.sessionId'));
      return;
    }
    if (condition.trim().length > 32) {
      setError(t('settings.study.errors.condition'));
      return;
    }
    setBusy(true);
    try {
      setStatus(await studyLog.setConfig(enabled, sessionId.trim(), condition.trim()));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const exportLogs = async () => {
    setError(null);
    setNotice(null);
    const id = (status?.sessionId || sessionId).trim();
    if (!id) {
      setError(t('settings.study.errors.sessionId'));
      return;
    }
    try {
      const dest = await open({ directory: true, multiple: false, title: t('settings.study.exportTitle') });
      if (typeof dest !== 'string') return;
      const res = await studyLog.exportSession(id, dest);
      setNotice(t('settings.study.exported', { count: res.files.length, dir: res.destDir }));
    } catch (e) {
      setError(String(e));
    }
  };

  if (!status) {
    return <div className="text-muted-foreground text-sm">{t('common.loading')}</div>;
  }

  const enabled = status.enabled;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] p-5">
        <h3 className="text-sm font-semibold text-[var(--annotix-dark)] mb-1 flex items-center gap-2">
          <i className="fas fa-flask text-[var(--annotix-primary)]" />
          {t('settings.study.title')}
        </h3>

        <div className="space-y-4 mt-4">
          {/* Interruptor */}
          <label className="flex items-center justify-between">
            <div className="pr-4">
              <div className="text-sm font-medium text-[var(--annotix-dark)]">
                {t('settings.study.enable')}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t('settings.study.disclaimer')}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => apply(!enabled)}
              aria-pressed={enabled}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
                enabled ? 'bg-[var(--annotix-primary)]' : 'bg-gray-300'
              } ${busy ? 'opacity-50' : ''}`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
                }`}
              />
            </button>
          </label>

          {error && (
            <div className="text-xs text-red-600 flex items-center gap-1.5">
              <i className="fas fa-circle-exclamation" />
              {error}
            </div>
          )}

          {/* session_id */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-[var(--annotix-dark)]">
                {t('settings.study.sessionId')}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('settings.study.sessionIdHint')}
              </div>
            </div>
            <input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              onBlur={() => enabled && apply(true)}
              disabled={enabled}
              placeholder="p01-cond-a"
              className="w-48 h-8 px-2 rounded border border-[var(--annotix-border)] text-sm disabled:opacity-60"
            />
          </div>

          {/* condition */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-[var(--annotix-dark)]">
                {t('settings.study.condition')}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('settings.study.conditionHint')}
              </div>
            </div>
            <input
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              disabled={enabled}
              maxLength={32}
              className="w-48 h-8 px-2 rounded border border-[var(--annotix-border)] text-sm disabled:opacity-60"
            />
          </div>

          {/* Exportar */}
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-[var(--annotix-border)]">
            <div>
              <div className="text-sm font-medium text-[var(--annotix-dark)]">
                {t('settings.study.export')}
              </div>
              <div className="text-xs text-muted-foreground break-all">{status.logsDir}</div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => studyLog.openLogsDir().catch((e) => setError(String(e)))}
                className="h-8 px-3 rounded border border-[var(--annotix-border)] text-sm hover:bg-[var(--annotix-gray-light)]"
              >
                <i className="fas fa-folder-open mr-1.5" />
                {t('settings.study.openFolder')}
              </button>
              <button
                type="button"
                onClick={exportLogs}
                className="h-8 px-3 rounded bg-[var(--annotix-primary)] text-white text-sm hover:opacity-90"
              >
                {t('settings.study.export')}
              </button>
            </div>
          </div>

          {notice && <div className="text-xs text-green-700">{notice}</div>}

          {status.active && (
            <div className="text-xs text-muted-foreground">
              {t('settings.study.active', { count: status.seq })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
