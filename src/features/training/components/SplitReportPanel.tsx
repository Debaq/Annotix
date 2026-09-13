import { useTranslation } from 'react-i18next';
import type { SplitReport } from '../types';

interface Props {
  report: SplitReport;
}

function Fila({ etiqueta, c }: { etiqueta: string; c: { train: number; val: number; test: number } }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-xs py-0.5">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className="font-mono text-right">{c.train}</span>
      <span className="font-mono text-right">{c.val}</span>
      <span className="font-mono text-right">{c.test || '—'}</span>
    </div>
  );
}

/**
 * Cómo se repartió el corpus con el que se entrenó.
 *
 * Los avisos van arriba y no al final a propósito: el que dice que una clase no
 * quedó en test es el que cambia cómo se lee todo lo demás, y al final nadie lo
 * ve. El número de grupos acompaña siempre al de imágenes porque 400 imágenes de
 * dos pacientes no son cuatrocientos casos.
 */
export function SplitReportPanel({ report }: Props) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{t('training.splitReport.title')}</h4>

      {report.warnings.length > 0 && (
        <ul className="space-y-1">
          {report.warnings.map((w, i) => (
            <li
              key={`${w.code}-${w.class ?? i}`}
              className="text-xs flex items-start gap-1.5 text-amber-600"
            >
              <i className="fas fa-triangle-exclamation text-[10px] mt-0.5 shrink-0" />
              <span>{t(`training.splitReport.warnings.${w.code}`, { class: w.class })}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-border/60 px-3 py-2">
        <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/60 pb-1">
          <span>{t('training.splitReport.groupedBy', {
            unit: t(`training.splitReport.unit.${report.unit}`, { defaultValue: report.unit }),
          })}</span>
          <span className="text-right">Train</span>
          <span className="text-right">Val</span>
          <span className="text-right">Test</span>
        </div>
        <Fila etiqueta={t('training.splitReport.images')} c={report.items} />
        <Fila etiqueta={t('training.splitReport.groups')} c={report.groups} />
        {report.subjects && (
          <Fila etiqueta={t('training.splitReport.subjects')} c={report.subjects} />
        )}
        {report.perClass.length > 0 && (
          <div className="mt-1 pt-1 border-t border-border/60">
            {report.perClass.map((c) => (
              <Fila key={c.class} etiqueta={c.class} c={c} />
            ))}
          </div>
        )}
      </div>

      {report.subjectsUndeclared !== undefined && report.subjectsUndeclared > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {t('training.splitReport.undeclared', { count: report.subjectsUndeclared })}
        </p>
      )}
    </div>
  );
}
