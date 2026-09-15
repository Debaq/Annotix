import { Fragment, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/hooks/use-toast';
import { contractService } from '../services/contractService';
import type { ModelContract } from '../types';

interface Props {
  projectId: string;
  jobId: string;
}

/** Color del nivel: no es una nota, es cuánto sostiene el dato lo que se afirma. */
const COLOR_NIVEL: Record<string, string> = {
  declarativo: 'text-destructive',
  trazable: 'text-amber-600',
  reproducible: 'text-blue-600',
  verificable: 'text-emerald-600',
};

/** Hash corto para mirar a ojo; el completo está en el archivo. */
function corto(h: string | null): string {
  return h ? `${h.slice(0, 12)}…` : '—';
}

/**
 * Contrato de un modelo entrenado.
 *
 * Se arma solo con lo que dejaron las etapas anteriores. Lo primero que se
 * enseña, arriba y sin esconder, son las **limitaciones**: un contrato que
 * empiece por las métricas invita a leer sólo eso.
 */
export function ModelContractPanel({ projectId, jobId }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [contrato, setContrato] = useState<ModelContract | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    if (!projectId || !jobId) return;
    contractService
      .build(projectId, jobId)
      .then(setContrato)
      .catch(() => setContrato(null));
  }, [projectId, jobId]);

  useEffect(cargar, [cargar]);

  if (!contrato) return null;

  const emitir = async () => {
    setOcupado(true);
    try {
      const [c, ruta] = await contractService.write(projectId, jobId);
      setContrato(c);
      toast({ title: t('contract.written'), description: ruta });
    } catch (e) {
      toast({ title: t('contract.writeFailed'), description: String(e), variant: 'destructive' });
    } finally {
      setOcupado(false);
    }
  };

  const nivel = contrato.evidenceLevel;
  const p = contrato.provenance;

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-3">
      <div className="flex items-center gap-2">
        <h4 className="flex-1 text-sm font-medium">{t('contract.title')}</h4>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={emitir} disabled={ocupado}>
          <i className="fas fa-file-signature mr-1.5" />
          {ocupado ? t('contract.writing') : t('contract.write')}
        </Button>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted-foreground">{t('contract.evidenceLevel')}</span>
        <span className={`text-sm font-semibold ${COLOR_NIVEL[nivel] ?? ''}`}>
          {t(`contract.level.${nivel}`, { defaultValue: nivel })}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t(`contract.levelDesc.${nivel}`, { defaultValue: '' })}
      </p>

      {contrato.limitations.length > 0 && (
        <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
          <p className="text-[10px] uppercase tracking-wider text-amber-600">
            {t('contract.limitations')}
          </p>
          <ul className="space-y-1">
            {contrato.limitations.map((l, i) => (
              <li key={i} className="text-[11px] text-amber-700 dark:text-amber-500">
                · {l}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        {contrato.population && (
          <>
            <span className="text-muted-foreground">{t('contract.splitUnit')}</span>
            <span className="font-mono">
              {contrato.population.splitUnit}
              {contrato.population.declaredUnit &&
                contrato.population.declaredUnit !== contrato.population.splitUnit &&
                ` (${t('contract.declared')}: ${contrato.population.declaredUnit})`}
            </span>
            <span className="text-muted-foreground">{t('contract.seed')}</span>
            <span className="font-mono break-all">{contrato.population.seed ?? '—'}</span>
          </>
        )}

        <span className="text-muted-foreground">{t('contract.provenance')}</span>
        <span className="font-mono">
          {t('contract.provenanceValue', {
            total: p.total,
            unknown: p.unknown,
            rejected: p.rejected,
          })}
        </span>

        {contrato.agreement?.value != null && (
          <>
            <span className="text-muted-foreground">{t('contract.agreement')}</span>
            <span className="font-mono">
              {contrato.agreement.value.toFixed(3)}
              {contrato.agreement.ciLow != null && contrato.agreement.ciHigh != null &&
                ` [${contrato.agreement.ciLow.toFixed(3)}, ${contrato.agreement.ciHigh.toFixed(3)}]`}
            </span>
          </>
        )}

        {contrato.augmentation && (
          <>
            <span className="text-muted-foreground">{t('contract.augmentation')}</span>
            <span className="font-mono">
              {t('contract.augmentationValue', {
                generated: contrato.augmentation.generated,
                from: contrato.augmentation.trainSourceImages,
                total: contrato.augmentation.trainImages,
              })}
            </span>
            <span className="text-muted-foreground">{t('contract.augmentationWhat')}</span>
            <span className="font-mono break-all">
              {contrato.augmentation.transforms.join(', ') || '—'}
              {` · ${t('contract.seed')} ${contrato.augmentation.seed}`}
            </span>
          </>
        )}

        <span className="text-muted-foreground">{t('contract.modelHash')}</span>
        <span className="font-mono">{corto(contrato.integrity.modelSha256)}</span>

        <span className="text-muted-foreground">{t('contract.datasetHash')}</span>
        <span className="font-mono">{corto(contrato.integrity.datasetCompositionSha256)}</span>

        <span className="text-muted-foreground">{t('contract.auditChain')}</span>
        <span
          className={
            contrato.integrity.auditChainValid === false ? 'text-destructive' : 'font-mono'
          }
        >
          {contrato.integrity.auditChainValid === null
            ? '—'
            : contrato.integrity.auditChainValid
              ? t('contract.auditValid', { count: contrato.integrity.auditEvents })
              : t('contract.auditBroken')}
        </span>
      </div>

      {contrato.testMetricsCi && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium">{t('contract.testMetrics')}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            {Object.entries(contrato.testMetricsCi).map(([nombre, m]) => (
              // Fragment con clave: las dos celdas son hermanas en la rejilla,
              // así que no pueden ir en un div propio.
              <Fragment key={nombre}>
                <span className="text-muted-foreground">
                  {nombre}
                </span>
                <span className="font-mono">
                  {m.value.toFixed(3)}
                  {m.ciLow != null && m.ciHigh != null
                    ? ` [${m.ciLow.toFixed(3)}, ${m.ciHigh.toFixed(3)}]`
                    : ''}
                  <span className="text-muted-foreground">
                    {` · ${t('contract.ciGroups', { n: m.n, groups: m.groups })}`}
                  </span>
                </span>
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">{contrato.metricsCiNote}</p>
    </div>
  );
}
