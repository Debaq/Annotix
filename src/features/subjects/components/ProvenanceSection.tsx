import { useTranslation } from 'react-i18next';
import type { ProvenanceSummary } from '../types';

interface Props {
  summary: ProvenanceSummary;
}

/** Porcentaje entero, sin decimales falsos sobre conteos pequeños. */
function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

/**
 * De dónde salieron las etiquetas del corpus.
 *
 * Las dos cifras que importan van destacadas: lo que sugirió un modelo —porque un
 * corpus mayormente autogenerado se realimenta de su propio modelo y eso no se ve
 * en ninguna métrica— y lo desconocido, que es la parte sobre la que no se puede
 * afirmar nada y por eso no se cuenta como un origen más.
 */
export function ProvenanceSection({ summary }: Props) {
  const { t } = useTranslation();

  if (summary.total === 0) return null;

  const orden = ['manual', 'model', 'track', 'import', 'adjudicated', 'unknown'];
  const origenes = orden
    .filter((o) => (summary.byOrigin[o] ?? 0) > 0)
    .map((o) => [o, summary.byOrigin[o]] as const);

  const delModelo = summary.byOrigin.model ?? 0;
  const aceptadas = summary.byReview.accepted ?? 0;
  const corregidas = summary.byReview.corrected ?? 0;

  return (
    <section className="space-y-2 border-t border-border pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('subjects.provenance')}
      </h4>

      <div className="space-y-1">
        {origenes.map(([origen, n]) => (
          <div key={origen} className="flex items-center gap-2 text-xs">
            <span className="w-28 shrink-0 text-muted-foreground">
              {t(`subjects.origin.${origen}`, { defaultValue: origen })}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full ${origen === 'unknown' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                style={{ width: `${pct(n, summary.total)}%` }}
              />
            </div>
            <span className="w-16 text-right font-mono">
              {pct(n, summary.total)}%
            </span>
            <span className="w-12 text-right text-muted-foreground font-mono">{n}</span>
          </div>
        ))}
      </div>

      {delModelo > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {t('subjects.modelBreakdown', {
            accepted: aceptadas,
            corrected: corregidas,
            pct: pct(delModelo, summary.total),
          })}
        </p>
      )}

      {/* Lo rechazado no está en el corpus y por eso no sale en las barras de
          arriba. Va igual: sin ello la tasa de acierto del modelo se calcula sólo
          sobre lo que sobrevivió, y sale siempre buena. */}
      {summary.rejected > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {t('subjects.rejectedNote', {
            count: summary.rejected,
            pct: pct(summary.rejected, summary.rejected + delModelo),
          })}
        </p>
      )}

      {summary.unknown > 0 && (
        <p className="text-[11px] text-amber-600">
          {t('subjects.unknownNote', { count: summary.unknown })}
        </p>
      )}
    </section>
  );
}
