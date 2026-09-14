import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { medicalService } from '../services/medicalService';
import type { MedicalInfo, WindowPreset } from '../types';

interface Props {
  projectId: string;
  imageId: string;
  medical: MedicalInfo;
  /** Se llama tras reventanear, para que el canvas recargue la imagen. */
  onChanged?: () => void;
}

/**
 * Ventana window/level de una imagen médica.
 *
 * Un CT guarda unidades Hounsfield entre −1024 y 3071 y la pantalla muestra 256
 * grises: el ventaneo elige qué tramo se los reparte. Sin él, el pulmón y el
 * hueso caben en el mismo gris y no se ve nada.
 *
 * Cambiar la ventana **cambia la imagen que se está anotando**, no sólo cómo se
 * ve: una marca puesta con ventana de pulmón puede no tener sentido con ventana
 * de hueso. Por eso se avisa y no se ofrece como un deslizador de brillo.
 */
export function WindowControl({ projectId, imageId, medical, onChanged }: Props) {
  const { t } = useTranslation();
  const [presets, setPresets] = useState<WindowPreset[]>([]);
  const [center, setCenter] = useState(medical.windowCenter ?? 0);
  const [width, setWidth] = useState(medical.windowWidth ?? 1);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    medicalService.getWindowPresets().then(setPresets).catch(() => setPresets([]));
  }, []);

  useEffect(() => {
    setCenter(medical.windowCenter ?? 0);
    setWidth(medical.windowWidth ?? 1);
  }, [medical.windowCenter, medical.windowWidth, imageId]);

  const aplicar = useCallback(
    async (c: number, w: number) => {
      if (w <= 0) return;
      setAplicando(true);
      try {
        await medicalService.rewindow(projectId, imageId, c, w);
        setCenter(c);
        setWidth(w);
        onChanged?.();
      } finally {
        setAplicando(false);
      }
    },
    [projectId, imageId, onChanged],
  );

  // Sin copia de 16 bits no hay nada que reventanear: la imagen es lo que es.
  if (!medical.rawFile) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-2">
      <div className="flex items-center gap-2">
        <Label className="flex-1 text-xs font-medium">{t('medical.window.title')}</Label>
        {medical.modality && (
          <span className="text-[10px] font-mono text-muted-foreground">{medical.modality}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {presets.map(([nombre, c, w]) => (
          <button
            key={nombre}
            className="annotix-btn annotix-btn-outline"
            style={{ fontSize: '0.7rem', padding: '3px 7px' }}
            onClick={() => aplicar(c, w)}
            disabled={aplicando}
          >
            {t(`medical.window.preset.${nombre}`, { defaultValue: nombre })}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            {t('medical.window.center')}
          </Label>
          <Input
            type="number"
            className="h-7 text-xs"
            value={center}
            onChange={(e) => setCenter(Number(e.target.value))}
            onBlur={() => aplicar(center, width)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">
            {t('medical.window.width')}
          </Label>
          <Input
            type="number"
            min={1}
            className="h-7 text-xs"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            onBlur={() => aplicar(center, width)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {medical.windowFromFile
          ? t('medical.window.fromFile')
          : t('medical.window.computed')}
      </p>
      <p className="text-[11px] text-amber-600">{t('medical.window.changesImage')}</p>
    </div>
  );
}
