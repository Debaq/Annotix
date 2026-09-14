import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useUIStore } from '@/features/core/store/uiStore';
import { medicalService } from '../services/medicalService';
import { DeidentReportDialog } from './DeidentReportDialog';
import type { MedicalImportReport } from '../types';

/**
 * Importación de DICOM y NIfTI.
 *
 * Separada de la subida normal de imágenes porque no es lo mismo: aquí se
 * deidentifica, se seudonimiza el paciente y se ventanea. Mezclarlo con «subir
 * imágenes» haría que alguien arrastrara un DICOM esperando que pasara lo de
 * siempre.
 *
 * El informe de lo que se quitó se muestra **siempre** al terminar, y no se puede
 * silenciar.
 */
export function MedicalUploader() {
  const { t } = useTranslation();
  const currentProjectId = useUIStore((s) => s.currentProjectId);
  const [eje, setEje] = useState<'axial' | 'coronal' | 'sagital'>('axial');
  const [importando, setImportando] = useState(false);
  const [informe, setInforme] = useState<MedicalImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elegirEImportar = async () => {
    if (!currentProjectId) return;
    const elegido = await open({
      multiple: true,
      filters: [
        // Muchos DICOM clínicos no llevan extensión: por eso el filtro de «todos».
        { name: 'DICOM / NIfTI', extensions: ['dcm', 'DCM', 'nii', 'gz'] },
        { name: t('medical.import.anyFile', 'Todos los archivos'), extensions: ['*'] },
      ],
    });
    const rutas = Array.isArray(elegido) ? elegido : elegido ? [elegido] : [];
    if (rutas.length === 0) return;

    setImportando(true);
    setError(null);
    try {
      const r = await medicalService.importFiles(currentProjectId, rutas, eje);
      setInforme(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        className="annotix-btn annotix-btn-outline w-full"
        onClick={elegirEImportar}
        disabled={importando || !currentProjectId}
      >
        <i className={`fas ${importando ? 'fa-spinner fa-spin' : 'fa-file-medical'} mr-2`} />
        {importando ? t('medical.import.importing') : t('medical.import.title')}
      </button>

      <div className="flex items-center gap-2">
        <Label className="text-[11px] text-muted-foreground shrink-0">
          {t('medical.import.axis')}
        </Label>
        <Select value={eje} onValueChange={(v) => setEje(v as typeof eje)}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="axial" className="text-xs">
              {t('medical.import.axial')}
            </SelectItem>
            <SelectItem value="coronal" className="text-xs">
              {t('medical.import.coronal')}
            </SelectItem>
            <SelectItem value="sagital" className="text-xs">
              {t('medical.import.sagital')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <DeidentReportDialog report={informe} onClose={() => setInforme(null)} />
    </div>
  );
}
