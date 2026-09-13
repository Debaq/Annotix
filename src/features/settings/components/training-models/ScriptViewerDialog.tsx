import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trainingService } from '@/features/training/services/trainingService';
import type { CatalogBackend } from '../../hooks/useTrainingCatalog';

interface Props {
  backend: CatalogBackend | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Muestra el `train.py` del backend **generado por el mismo código que entrena**.
 *
 * Antes venía de una plantilla escrita a mano en el front, y había derivado: la
 * mitad de los backends mostraban literalmente «See Rust backend for full
 * script», y las que tenían contenido usaban APIs que el generador ya no emitía.
 * Una referencia que miente es peor que no tener referencia.
 */
export function ScriptViewerDialog({ backend, open, onClose }: Props) {
  const { t } = useTranslation();
  const [script, setScript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !backend) return;
    setScript(null);
    setError(null);
    let vivo = true;
    const task = backend.supportedTasks[0] ?? 'detect';
    trainingService
      .previewTrainScript(backend.id, task)
      .then((s) => vivo && setScript(s))
      .catch((e) => vivo && setError(String(e)));
    return () => {
      vivo = false;
    };
  }, [open, backend]);

  if (!backend) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 bg-card border-border overflow-hidden">
        <DialogHeader className="px-4 py-3 bg-muted/30 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <i className={`${backend.icon} ${backend.iconColor} text-sm`} />
              <DialogTitle className="text-sm font-medium text-foreground">{backend.name}</DialogTitle>
              <span className="text-[11px] text-muted-foreground font-mono">train.py</span>
            </div>
            <span className="text-[10px] text-muted-foreground">{t('settings.trainingModels.readOnly')}</span>
          </div>
        </DialogHeader>
        <pre className="p-4 text-[12px] leading-relaxed overflow-auto max-h-[60vh] bg-muted/10">
          <code className="text-foreground font-mono whitespace-pre">
            {error
              ? t('settings.trainingModels.scriptError', { error })
              : script ?? t('common.loading')}
          </code>
        </pre>
        {script && (
          <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
            {t('settings.trainingModels.scriptNote')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
