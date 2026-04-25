import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { save } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';
import { trainingService } from '../services/trainingService';
import { EXPORT_FORMATS } from '../utils/presets';
import { buildModelDownloadName, extensionFromPath } from '../utils/downloadName';

interface TrainingModelExportProps {
  modelPath: string;
  projectName: string;
}

export function TrainingModelExport({ modelPath, projectName }: TrainingModelExportProps) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<{ format: string; path: string }[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: string) => {
    setExporting(format);
    setError(null);
    try {
      const path = await trainingService.exportTrainedModel(modelPath, format);
      setExported((prev) => [...prev, { format, path }]);
    } catch (e) {
      setError(String(e));
    } finally {
      setExporting(null);
    }
  };

  const handleDownload = async (format: string, srcPath: string) => {
    if (downloading) return;
    setDownloading(format);
    setError(null);
    try {
      const ext = extensionFromPath(srcPath);
      const defaultName = buildModelDownloadName({
        projectName,
        variant: format,
        extension: ext,
      });
      const dest = await save({
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
        defaultPath: defaultName,
      });
      if (!dest) return;
      await trainingService.downloadTrainedModel(srcPath, dest);
    } catch (e) {
      setError(String(e));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{t('training.result.exportModel')}</h4>
      <div className="grid grid-cols-3 gap-2">
        {EXPORT_FORMATS.map((fmt) => {
          const isExported = exported.some((e) => e.format === fmt.value);
          const isExporting = exporting === fmt.value;
          return (
            <Button
              key={fmt.value}
              variant={isExported ? 'default' : 'outline'}
              size="sm"
              disabled={isExporting || isExported}
              onClick={() => handleExport(fmt.value)}
            >
              {isExporting ? (
                <i className="fas fa-spinner fa-spin mr-1" />
              ) : isExported ? (
                <i className="fas fa-check mr-1" />
              ) : (
                <i className="fas fa-file-export mr-1" />
              )}
              {fmt.label}
            </Button>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {exported.length > 0 && (
        <div className="space-y-1">
          {exported.map((e) => (
            <div key={e.format} className="flex items-center gap-2">
              <p className="flex-1 text-xs font-mono text-muted-foreground truncate">
                {e.format.toUpperCase()}: {e.path}
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={downloading !== null}
                onClick={() => handleDownload(e.format, e.path)}
              >
                <i className={`fas ${downloading === e.format ? 'fa-spinner fa-spin' : 'fa-download'} mr-1`} />
                {t('training.result.downloadExported')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
