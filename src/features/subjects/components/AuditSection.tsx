import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { auditService } from '../services/auditService';
import type { AuditEntry, AuditReport } from '../types';

interface Props {
  projectId: string;
}

/** Fecha corta y legible; el archivo guarda ISO 8601 completo. */
function cuando(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

/**
 * Estado del registro de auditoría del proyecto.
 *
 * La garantía de la cadena no vale de nada si sólo la puede comprobar el programa
 * por dentro: aquí se comprueba a la vista, y el archivo se puede verificar desde
 * fuera con cualquier herramienta (ver `docs/audit-log.md`).
 *
 * Es explícito sobre qué guarda —identificadores y autoría, no geometrías— porque
 * un registro que guarda cosas que el usuario no espera es un problema, no una
 * garantía.
 */
export function AuditSection({ projectId }: Props) {
  const { t } = useTranslation();
  const [report, setReport] = useState<AuditReport | null>(null);
  const [tail, setTail] = useState<AuditEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!projectId) return;
    auditService
      .verify(projectId)
      .then((r) => {
        setReport(r);
        setError(null);
      })
      .catch((e) => setError(String(e)));
  }, [projectId]);

  useEffect(cargar, [cargar]);

  const verificar = async () => {
    setBusy(true);
    try {
      const [r, t] = await Promise.all([
        auditService.verify(projectId),
        auditService.tail(projectId, 20),
      ]);
      setReport(r);
      setTail(t);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!report) return null;

  return (
    <section className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <h4 className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('subjects.audit.title')}
        </h4>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={verificar} disabled={busy}>
          {busy ? t('subjects.audit.verifying') : t('subjects.audit.verify')}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">{t('subjects.audit.what')}</p>

      {!report.exists ? (
        <p className="text-xs text-muted-foreground">{t('subjects.audit.empty')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className={report.valid ? 'text-emerald-600' : 'text-destructive'}>
              <i className={`fas ${report.valid ? 'fa-link' : 'fa-link-slash'} mr-1.5`} />
              {report.valid ? t('subjects.audit.valid') : t('subjects.audit.broken')}
            </span>
            <span className="text-muted-foreground">
              {t('subjects.audit.events', { count: report.nEvents })}
            </span>
            {report.actors.length > 0 && (
              <span className="text-muted-foreground">
                {t('subjects.audit.actors', { actors: report.actors.join(', ') })}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('subjects.audit.range', {
              from: cuando(report.firstAt),
              to: cuando(report.lastAt),
            })}
          </p>

          {report.truncatedTail && (
            <p className="text-[11px] text-amber-600">{t('subjects.audit.truncated')}</p>
          )}

          {!report.valid && (
            <ul className="space-y-0.5">
              {report.errors.slice(0, 5).map((e, i) => (
                <li key={i} className="text-[11px] text-destructive">
                  {e}
                </li>
              ))}
            </ul>
          )}

          {tail && tail.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border/60 px-2 py-1">
              {tail.map((e) => (
                <div key={`${e.seq}`} className="flex items-baseline gap-2 text-[11px]">
                  <span className="w-32 shrink-0 truncate text-muted-foreground">
                    {cuando(e.t_wall)}
                  </span>
                  <span className="flex-1 truncate font-mono">{e.event}</span>
                  <span className="shrink-0 text-muted-foreground">{e.actor}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </section>
  );
}
