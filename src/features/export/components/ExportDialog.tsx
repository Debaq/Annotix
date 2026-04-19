import { ReactNode, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { FormatSelector } from './FormatSelector';
import { ExportProgress } from './ExportProgress';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { ExportFormat, getValidFormats, getDefaultFormat } from '../utils/formatMapping';
import { pickSaveLocation } from '@/lib/nativeDialogs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ExportDialogProps {
  trigger?: ReactNode;
}

export function ExportDialog({ trigger }: ExportDialogProps) {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const [open, setOpen] = useState(false);

  // Get valid formats for this project type
  const validFormats = getValidFormats(project?.type);
  const defaultFormat = getDefaultFormat(project?.type);
  const [format, setFormat] = useState<ExportFormat>(defaultFormat || 'yolo-detection');
  const [normalizeToJpg, setNormalizeToJpg] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);

  // If no valid formats for this project type, don't render the dialog
  if (!project || validFormats.length === 0) {
    return trigger ? (
      <div title={t('export.notAvailable')} className="opacity-50 cursor-not-allowed">
        {trigger}
      </div>
    ) : null;
  }

  const handleExport = async () => {
    if (!project?.id) return;

    setIsExporting(true);
    setProgress(0);

    // Escuchar progreso del backend
    const unlisten = await listen<number>('export:progress', (event) => {
      setProgress(event.payload);
    });

    try {
      // Pedir ubicación de guardado con diálogo nativo
      const ext = format === 'tix' ? 'tix' : 'zip';
      const defaultName = `${project.name}-${format}.${ext}`;
      const savePath = await pickSaveLocation(defaultName, ext);
      if (!savePath) {
        setIsExporting(false);
        unlisten();
        return;
      }

      // Exportar directamente en Rust (sin pasar blobs por JS)
      await invoke('export_dataset', {
        projectId: project.id,
        format,
        outputPath: savePath,
        normalizeToJpg,
      });

      setOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
      unlisten();
      setIsExporting(false);
      setProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <i className="fas fa-download mr-2"></i>
            {t('export.title')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('export.title')}</DialogTitle>
          <DialogDescription>{t('export.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <FormatSelector value={format} onChange={setFormat} validFormats={validFormats} />

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={normalizeToJpg}
              onChange={(e) => setNormalizeToJpg(e.target.checked)}
              className="mt-0.5"
              title={t('export.normalizeToJpgInfo')}
            />
            <span>
              <span className="font-medium">{t('export.normalizeToJpg')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('export.normalizeToJpgInfo')}
              </span>
            </span>
          </label>

          {isExporting && <ExportProgress progress={progress} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isExporting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                {t('export.exporting')}
              </>
            ) : (
              <>
                <i className="fas fa-download mr-2"></i>
                {t('export.export')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
