import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { FamilyInfo } from '../types';

interface ModelFamilyInfoProps {
  info: FamilyInfo;
}

/** Un dato con su etiqueta, en una fila compacta. */
function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className="text-xs font-medium break-words">{valor}</p>
      {nota && <p className="text-[10px] text-muted-foreground mt-0.5">{nota}</p>}
    </div>
  );
}

/**
 * Ficha de decisión de una familia: cuándo usarla, cuándo no, y a qué coste.
 *
 * Los números van con su matiz al lado a propósito. Una cubeta de VRAM sin decir
 * que es una estimación, o una métrica de COCO sin decir que es de otro dataset,
 * invita a leerlas como una promesa sobre el corpus del usuario.
 */
export function ModelFamilyInfo({ info }: ModelFamilyInfoProps) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);

  const base = `training.families.items.${info.backend}.${info.family}`;
  const uso = t(`${base}.use`, { defaultValue: '' });
  const evitar = t(`${base}.avoid`, { defaultValue: '' });

  const vram = t(`training.families.axes.vram.${info.vram}`, { defaultValue: info.vram });
  const velocidad = t(`training.families.axes.speed.${info.speed}`, { defaultValue: info.speed });
  const acceso = t(`training.families.axes.access.${info.access}`, { defaultValue: info.access });
  const licenciaVaria = info.license === 'varies';
  const noComercial = info.access === 'non_commercial';

  return (
    <div className="rounded-md border border-border/60 bg-muted/30">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/40 rounded-md"
      >
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium">{t('training.families.labels.title')}</span>
          <Badge variant="outline" className="text-[10px] px-1 font-normal">
            {vram}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1 font-normal">
            {velocidad}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1 font-normal">
            {t('training.families.labels.minSamplesValue', { count: info.minSamples })}
          </Badge>
          {noComercial && (
            <Badge variant="destructive" className="text-[10px] px-1 font-normal">
              {acceso}
            </Badge>
          )}
        </div>
        <i className={`fas fa-chevron-${abierto ? 'up' : 'down'} text-[10px] text-muted-foreground`} />
      </button>

      {abierto && (
        <div className="px-3 pb-3 space-y-3">
          {uso && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-emerald-500">
                {t('training.families.labels.useWhen')}
              </p>
              <p className="text-xs mt-0.5">{uso}</p>
            </div>
          )}
          {evitar && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-amber-500">
                {t('training.families.labels.avoidWhen')}
              </p>
              <p className="text-xs mt-0.5">{evitar}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/60">
            <Dato
              etiqueta={t('training.families.labels.vram')}
              valor={vram}
              nota={t('training.families.labels.vramCaveat')}
            />
            <Dato etiqueta={t('training.families.labels.speed')} valor={velocidad} />
            <Dato
              etiqueta={t('training.families.labels.minSamples')}
              valor={t('training.families.labels.minSamplesValue', { count: info.minSamples })}
              nota={t('training.families.labels.minSamplesCaveat')}
            />
            <Dato
              etiqueta={t('training.families.labels.pretrainedOn')}
              valor={
                info.pretrainedOn === 'none'
                  ? t('training.families.labels.pretrainedOnNone')
                  : info.pretrainedOn
              }
            />
            <Dato
              etiqueta={t('training.families.labels.license')}
              valor={licenciaVaria ? acceso : info.license}
              nota={
                licenciaVaria
                  ? t('training.families.labels.licenseVaries')
                  : t('training.families.labels.licenseInherited')
              }
            />
            {info.reference && (
              <Dato
                etiqueta={t('training.families.labels.reference')}
                valor={info.reference}
                nota={t('training.families.labels.referenceCaveat')}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
