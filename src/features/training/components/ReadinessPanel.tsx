import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trainingService } from '../services/trainingService';
import type { ReadinessReport } from '../types';

interface Props {
  projectId: string;
  /** Lo que el usuario tiene configurado ahora mismo. */
  testSplit: number;
  fliplr: number;
}

const COLOR_NIVEL: Record<string, string> = {
  declarativo: 'text-destructive',
  trazable: 'text-amber-600',
  reproducible: 'text-blue-600',
  verificable: 'text-emerald-600',
};

/**
 * Qué nivel de evidencia saldría si se entrenara ahora.
 *
 * El contrato de modelo se emite **después** de entrenar, cuando ya no se puede
 * hacer nada: si faltaba el sujeto, el modelo ya se entrenó sin él. Esto hace la
 * misma cuenta antes, para que el aviso llegue cuando todavía sirve.
 *
 * **Nada de esto bloquea el entrenamiento.** Es la decisión que gobierna toda la
 * parte biomédica: un flujo que impide entrenar hasta tener el corpus perfecto
 * convierte cada mejora en un peaje. Lo que baja cuando falta algo es lo que el
 * contrato podrá afirmar — el coste cae en el papel, que es el que viaja fuera
 * del laboratorio.
 */
export function ReadinessPanel({ projectId, testSplit, fliplr }: Props) {
  const { t } = useTranslation();
  const [r, setR] = useState<ReadinessReport | null>(null);

  const cargar = useCallback(() => {
    if (!projectId) return;
    trainingService
      .getReadiness(projectId, testSplit, fliplr)
      .then(setR)
      .catch(() => setR(null));
  }, [projectId, testSplit, fliplr]);

  useEffect(cargar, [cargar]);

  if (!r) return null;

  // Los de corrección van arriba y con otro color: no dicen que el modelo esté
  // peor documentado, dicen que probablemente está mal entrenado.
  const correcciones = r.warnings.filter((w) => w.kind === 'correccion');
  const evidencia = r.warnings.filter((w) => w.kind === 'evidencia');

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted-foreground">{t('training.readiness.title')}</span>
        <span className={`text-sm font-semibold ${COLOR_NIVEL[r.level] ?? ''}`}>
          {t(`contract.level.${r.level}`, { defaultValue: r.level })}
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground">{t('training.readiness.noBlock')}</p>

      {correcciones.length > 0 && (
        <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <p className="text-[10px] uppercase tracking-wider text-destructive">
            {t('training.readiness.correction')}
          </p>
          {correcciones.map((w, i) => (
            <p key={i} className="text-[11px] text-destructive">
              {t(`training.readiness.warn.${w.code}`, {
                defaultValue: w.code,
                detail: w.detail ?? '',
              })}
            </p>
          ))}
        </div>
      )}

      {r.nextLevel && evidencia.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('training.readiness.toReach', {
              level: t(`contract.level.${r.nextLevel}`, { defaultValue: r.nextLevel }),
            })}
          </p>
          <ul className="space-y-0.5">
            {evidencia.map((w, i) => (
              <li key={i} className="text-[11px] text-muted-foreground">
                · {t(`training.readiness.warn.${w.code}`, {
                  defaultValue: w.code,
                  detail: w.detail ?? '',
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        {t('training.readiness.corpus', {
          images: r.nImages,
          subjects: r.nSubjects,
        })}
        {r.detectedModality && ` · ${r.detectedModality}`}
      </p>
    </div>
  );
}
