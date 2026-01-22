import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormatSelector } from './FormatSelector';
import { ExportProgress } from './ExportProgress';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { exportService } from '../services/exportService';
import { ExportFormat, getValidFormats, getDefaultFormat } from '../utils/formatMapping';
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

    try {
      const blob = await exportService.export(project.id, format, (p) => setProgress(p));

      // Download file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name}-${format}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setOpen(false);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    } finally {
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
