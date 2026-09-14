import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/hooks/use-toast';
import { trainingService } from '../services/trainingService';
import type { BiomedPreset, TrainingBackend } from '../types';

interface Props {
  projectId: string;
  /** Tarea del proyecto: se ofrecen sólo los presets que la hacen. */
  task: string;
  /** Modalidad detectada del corpus, si la hay. Ordena lo que encaja primero. */
  modality?: string | null;
  /** Aplica el preset: backend, modelo y augmentaciones. */
  onApply: (preset: BiomedPreset) => void;
}

/**
 * Presets del dominio biomédico.
 *
 * Sólo aparecen si el proyecto declara dominio biomédico: un usuario generalista
 * no ve un solo término clínico, que es la mitad del punto del selector de
 * dominio.
 *
 * De cada preset se enseña **qué augmentaciones no usa**, porque es lo que lo
 * distingue de su equivalente generalista. Un preset que sólo dijera «U-Net para
 * radiología» parecería el mismo con otro nombre.
 */
export function BiomedPresets({ projectId, task, modality, onApply }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [dominio, setDominio] = useState<string>('general');
  const [presets, setPresets] = useState<BiomedPreset[]>([]);
  const [elegido, setElegido] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    trainingService.getProjectDomain(projectId).then(setDominio).catch(() => setDominio('general'));
    trainingService.getBiomedPresets().then(setPresets).catch(() => setPresets([]));
  }, [projectId]);

  const cambiarDominio = useCallback(
    async (d: 'general' | 'biomedical') => {
      setDominio(d);
      try {
        await trainingService.setProjectDomain(projectId, d);
      } catch (e) {
        toast({ title: String(e), variant: 'destructive' });
      }
    },
    [projectId, toast],
  );

  const aplicar = useCallback(
    async (p: BiomedPreset) => {
      setElegido(p.id);
      onApply(p);
      // El preset trae el reparto que su modalidad pide. Se aplica al declararlo,
      // no a espaldas del usuario: por eso se avisa de lo que acaba de cambiar.
      try {
        await trainingService.setSplitPolicy(projectId, {
          unit: p.split.unit,
          valSplit: p.split.valSplit,
          testSplit: p.split.testSplit,
          seed: null,
          requireTest: p.split.requireTest,
        });
        toast({ title: t('training.biomed.applied', { name: t(`training.biomed.preset.${p.id}`) }) });
      } catch (e) {
        toast({ title: String(e), variant: 'destructive' });
      }
    },
    [onApply, projectId, t, toast],
  );

  // Los que hacen la tarea del proyecto, y primero los que encajan con su
  // modalidad: ofrecer un preset de histopatología sobre un corpus de TAC es
  // ruido que hace desconfiar del resto.
  const aplicables = presets
    .filter((p) => p.task === task)
    .sort((a, b) => {
      const encaja = (p: BiomedPreset) =>
        modality && p.modalities.some((m) => m.toLowerCase() === modality.toLowerCase()) ? 0 : 1;
      return encaja(a) - encaja(b);
    });

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">{t('training.biomed.domain')}</Label>
        <div className="flex gap-1">
          {(['general', 'biomedical'] as const).map((d) => (
            <button
              key={d}
              className={`annotix-btn ${dominio === d ? 'annotix-btn-primary' : 'annotix-btn-outline'}`}
              style={{ fontSize: '0.7rem', padding: '4px 10px' }}
              onClick={() => cambiarDominio(d)}
            >
              {t(`training.biomed.domain_${d}`)}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{t('training.biomed.domainHint')}</p>
      </div>

      {dominio === 'biomedical' && aplicables.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          {t('training.biomed.noneForTask')}
        </p>
      )}

      {dominio === 'biomedical' &&
        aplicables.map((p) => (
          <div
            key={p.id}
            className={`space-y-1.5 rounded-lg border p-2.5 ${
              elegido === p.id ? 'border-primary bg-primary/5' : 'border-border/60'
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {t(`training.biomed.preset.${p.id}`, { defaultValue: p.id })}
                </p>
                <p className="text-[11px] font-mono text-muted-foreground">
                  {p.backend} · {p.modelId}
                </p>
              </div>
              <button
                className="annotix-btn annotix-btn-outline shrink-0"
                style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                onClick={() => aplicar(p)}
              >
                {t('training.biomed.apply')}
              </button>
            </div>

            {/* Lo que lo distingue del preset generalista equivalente. */}
            <p className="text-[11px] text-muted-foreground">
              {p.lateralized
                ? t('training.biomed.anatomical')
                : t('training.biomed.freeOrientation')}
            </p>

            <ul className="space-y-0.5">
              {p.notes.map((n, i) => (
                <li key={i} className="text-[11px] text-muted-foreground">
                  · {n}
                </li>
              ))}
            </ul>

            <p className="text-[11px] text-muted-foreground">
              {t('training.biomed.modalities', { list: p.modalities.join(', ') })}
            </p>
          </div>
        ))}
    </div>
  );
}

/** Los campos de configuración que un preset biomédico fija. */
export interface BiomedApplied {
  backend: TrainingBackend;
  modelId: string;
  augmentation: BiomedPreset['augmentation'];
}
