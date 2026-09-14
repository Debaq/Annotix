import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { contractService } from '../services/contractService';
import type { StudyProtocol } from '../types';

interface Props {
  projectId: string;
}

const CAMPOS: (keyof StudyProtocol)[] = [
  'inclusion',
  'exclusion',
  'population',
  'modality',
  'intendedUse',
];

/**
 * Lo que el proyecto declara sobre sí mismo, una vez.
 *
 * Texto libre y opcional a propósito: nadie puede validar por el usuario si un
 * criterio de inclusión está bien escrito, y un formulario rígido acabaría
 * rellenándose con lo que quepa. Lo que sí hace el sistema es **notar la
 * ausencia**: un contrato de modelo sin criterios declarados baja el nivel de
 * evidencia y lo dice.
 *
 * Se guarda al salir del campo, no en cada tecla: cada guardado reescribe
 * `project.json` entero.
 */
export function StudyProtocolSection({ projectId }: Props) {
  const { t } = useTranslation();
  const [protocolo, setProtocolo] = useState<StudyProtocol | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    if (!projectId) return;
    contractService
      .getProtocol(projectId)
      .then(setProtocolo)
      .catch(() => setProtocolo(null));
  }, [projectId]);

  useEffect(cargar, [cargar]);

  if (!protocolo) return null;

  const guardar = (campo: keyof StudyProtocol, valor: string) => {
    const siguiente = { ...protocolo, [campo]: valor };
    setProtocolo(siguiente);
    contractService
      .setProtocol(projectId, siguiente)
      .then(() => setError(null))
      .catch((e) => setError(String(e)));
  };

  return (
    <section className="space-y-2 border-t border-border pt-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('contract.protocol.title')}
      </h4>
      <p className="text-[11px] text-muted-foreground">{t('contract.protocol.intro')}</p>

      <div className="space-y-2">
        {CAMPOS.map((campo) => (
          <div key={campo} className="space-y-1">
            <Label className="text-xs">{t(`contract.protocol.${campo}`)}</Label>
            <textarea
              className="w-full rounded border bg-background px-2 py-1 text-xs"
              rows={2}
              defaultValue={protocolo[campo] ?? ''}
              placeholder={t(`contract.protocol.${campo}Hint`)}
              onBlur={(e) => {
                if ((protocolo[campo] ?? '') !== e.target.value) {
                  guardar(campo, e.target.value);
                }
              }}
            />
          </div>
        ))}
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </section>
  );
}
