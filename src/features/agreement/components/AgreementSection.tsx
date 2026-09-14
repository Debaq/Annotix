import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/features/core/store/uiStore';
import { agreementService } from '../services/agreementService';
import type { AgreementReport, Discrepancy } from '../types';

interface Props {
  projectId: string;
}

/** Tres decimales: el cuarto no lo sostiene ningún corpus de este tamaño. */
function n3(v: number): string {
  return v.toFixed(3);
}

/**
 * Acuerdo entre evaluadores y cola de discrepancias.
 *
 * Sólo aparece cuando hay algo que comparar. El valor va **siempre con su
 * intervalo**: un κ de 0.7 sobre doce muestras y uno sobre mil dicen cosas
 * distintas, y sin el intervalo los dos se leen igual.
 *
 * Cuando no se puede calcular, se dice por qué. Un acuerdo ausente y un acuerdo
 * de cero no son lo mismo, y enseñar «0.00» donde no hay dato sería mentir.
 */
export function AgreementSection({ projectId }: Props) {
  const { t } = useTranslation();
  const setCurrentImageId = useUIStore((s) => s.setCurrentImageId);
  const [report, setReport] = useState<AgreementReport | null>(null);
  const [cola, setCola] = useState<Discrepancy[]>([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => {
    if (!projectId) return;
    setCargando(true);
    Promise.all([
      agreementService.getCorpusAgreement(projectId),
      agreementService.getDiscrepancyQueue(projectId, 20),
    ])
      .then(([r, c]) => {
        setReport(r);
        setCola(c);
      })
      .catch(() => setReport(null))
      .finally(() => setCargando(false));
  }, [projectId]);

  useEffect(cargar, [cargar]);

  // Un proyecto de una sola lectura no tiene nada que ver aquí.
  if (!report || (report.nItems === 0 && cola.length === 0 && !report.note)) return null;

  const stat = t(`agreement.statistic.${report.statistic}`, {
    defaultValue: report.statistic,
  });

  return (
    <section className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <h4 className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('agreement.title')}
        </h4>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={cargar} disabled={cargando}>
          {cargando ? t('agreement.calculating') : t('agreement.recalculate')}
        </Button>
      </div>

      {report.value === null ? (
        <p className="text-xs text-muted-foreground">{report.note}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-mono font-semibold">{n3(report.value)}</span>
            <span className="text-xs text-muted-foreground">{stat}</span>
            {report.ciLow !== null && report.ciHigh !== null && (
              <span className="text-[11px] text-muted-foreground font-mono">
                {t('agreement.ci', { low: n3(report.ciLow), high: n3(report.ciHigh) })}
              </span>
            )}
          </div>

          {report.reading && (
            <p className="text-[11px] text-muted-foreground">
              {t(`agreement.reading.${report.reading}`, { defaultValue: report.reading })}
            </p>
          )}

          {report.blandAltman && (
            <p className="text-[11px] text-muted-foreground">
              {t('agreement.blandAltman', {
                bias: n3(report.blandAltman.sesgo),
                low: n3(report.blandAltman.limiteInferior),
                high: n3(report.blandAltman.limiteSuperior),
              })}
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            {t('agreement.basis', { items: report.nItems, raters: report.nRaters })}
          </p>
        </>
      )}

      {cola.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('agreement.queue')}
          </p>
          <div className="max-h-48 overflow-y-auto rounded-md border border-border/60">
            {cola.map((d) => (
              <button
                key={d.imageId}
                className="flex w-full items-baseline gap-2 px-2 py-1 text-left text-[11px] hover:bg-muted/50"
                onClick={() => setCurrentImageId(d.imageId)}
                title={d.raters.join(' · ')}
              >
                <span className="w-10 shrink-0 font-mono text-amber-600">
                  {n3(d.disagreement)}
                </span>
                <span className="flex-1 truncate">{d.imageName}</span>
                {d.onlyOne > 0 && (
                  <span className="shrink-0 text-muted-foreground">
                    {t('agreement.onlyOne', { count: d.onlyOne })}
                  </span>
                )}
                {d.classConflicts > 0 && (
                  <span className="shrink-0 text-destructive">
                    {t('agreement.classConflicts', { count: d.classConflicts })}
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">{t('agreement.queueHelp')}</p>
        </div>
      )}
    </section>
  );
}
