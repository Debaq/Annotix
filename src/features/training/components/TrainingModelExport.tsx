import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { trainingService } from '../services/trainingService';
import { EXPORT_FORMATS } from '../utils/presets';

interface TrainingModelExportProps {
  modelPath: string;
}

export function TrainingModelExport({ modelPath }: TrainingModelExportProps) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState<string | null>(null);
  const [exported, setExported] = useState<{ format: string; path: string }[]>([]);
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
            <p key={e.format} className="text-xs font-mono text-muted-foreground">
              {e.format.toUpperCase()}: {e.path}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
