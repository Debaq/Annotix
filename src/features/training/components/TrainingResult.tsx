import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { Button } from '@/components/ui/button';
import { TrainingModelExport } from './TrainingModelExport';
import { TrainingMetricsChart } from './TrainingMetricsChart';
import { generateTrainingReport } from '../services/trainingReportService';
import type {
  TrainingResult as TrainingResultType,
  TrainingEpochMetrics,
  TrainingBackend,
} from '../types';

interface TrainingResultProps {
  result: TrainingResultType;
  onNewTraining: () => void;
  // Report context
  projectName: string;
  backend: TrainingBackend;
  modelId: string;
  modelSize?: string | null;
  startedAt: number;
  config: Record<string, unknown>;
  metricsHistory: TrainingEpochMetrics[];
  logs: string[];
}

export function TrainingResult({
  result,
  onNewTraining,
  projectName,
  backend,
  modelId,
  modelSize,
  startedAt,
  config,
  metricsHistory,
  logs,
}: TrainingResultProps) {
  const { t } = useTranslation();
  const chartsRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);

  const handleExportPdf = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filePath = await save({
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
        defaultPath: `training_report_${backend}_${ts}.pdf`,
      });
      if (!filePath) return;

      const blob = await generateTrainingReport({
        backend,
        projectName,
        modelId,
        modelSize,
        startedAt,
        finishedAt: Date.now(),
        config,
        finalMetrics: result.finalMetrics,
        metricsHistory,
        logs,
        result,
        chartsContainer: chartsRef.current,
      });
      const buf = new Uint8Array(await blob.arrayBuffer());
      await writeFile(filePath, buf);
    } catch (e) {
      console.error('PDF report generation failed:', e);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success header */}
      <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
        <i className="fas fa-check-circle text-2xl text-green-500" />
        <div>
          <h3 className="font-medium">{t('training.result.completed')}</h3>
          <p className="text-sm text-muted-foreground">{t('training.result.description')}</p>
        </div>
      </div>

      {/* Final metrics */}
      {result.finalMetrics && (
        <div>
          <h4 className="text-sm font-medium mb-2">{t('training.result.finalMetrics')}</h4>
          <div className="grid grid-cols-5 gap-3">
            {result.finalMetrics.mAP50 != null && (
              <div className="bg-accent/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">mAP50</p>
                <p className="text-lg font-bold font-mono">
                  {(result.finalMetrics.mAP50 * 100).toFixed(1)}%
                </p>
              </div>
            )}
            {result.finalMetrics.mAP50_95 != null && (
              <div className="bg-accent/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">mAP50-95</p>
                <p className="text-lg font-bold font-mono">
                  {(result.finalMetrics.mAP50_95 * 100).toFixed(1)}%
                </p>
              </div>
            )}
            {result.finalMetrics.precision != null && (
              <div className="bg-accent/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('training.monitor.precision')}</p>
                <p className="text-lg font-bold font-mono">
                  {(result.finalMetrics.precision * 100).toFixed(1)}%
                </p>
              </div>
            )}
            {result.finalMetrics.recall != null && (
              <div className="bg-accent/50 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('training.monitor.recall')}</p>
                <p className="text-lg font-bold font-mono">
                  {(result.finalMetrics.recall * 100).toFixed(1)}%
                </p>
              </div>
            )}
            {(() => {
              const f1 = result.finalMetrics.f1Score ?? (
                result.finalMetrics.precision != null && result.finalMetrics.recall != null && result.finalMetrics.precision + result.finalMetrics.recall > 0
                  ? (2 * result.finalMetrics.precision * result.finalMetrics.recall) / (result.finalMetrics.precision + result.finalMetrics.recall)
                  : null
              );
              return f1 != null ? (
                <div className="bg-accent/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">F1</p>
                  <p className="text-lg font-bold font-mono">{(f1 * 100).toFixed(1)}%</p>
                </div>
              ) : null;
            })()}
          </div>
        </div>
      )}

      {/* Model paths */}
      <div>
        <h4 className="text-sm font-medium mb-2">{t('training.result.modelPaths')}</h4>
        <div className="space-y-1 text-xs font-mono bg-accent/30 rounded-lg p-3">
          {result.bestModelPath && (
            <div><span className="text-muted-foreground">Best: </span>{result.bestModelPath}</div>
          )}
          {result.lastModelPath && (
            <div><span className="text-muted-foreground">Last: </span>{result.lastModelPath}</div>
          )}
        </div>
      </div>

      {/* Exported models */}
      {result.exportedModels.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">{t('training.result.exported')}</h4>
          <div className="space-y-1">
            {result.exportedModels.map((m) => (
              <div key={m.format} className="text-xs font-mono bg-accent/30 rounded px-3 py-1.5">
                <span className="text-blue-500">{m.format.toUpperCase()}</span>: {m.path}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export model button */}
      {result.bestModelPath && (
        <TrainingModelExport modelPath={result.bestModelPath} />
      )}

      {/* Export PDF report */}
      <Button onClick={handleExportPdf} disabled={generating} variant="outline" className="w-full">
        <i className={`fas ${generating ? 'fa-spinner fa-spin' : 'fa-file-pdf'} mr-2`} />
        {generating ? t('training.result.generatingReport') : t('training.result.exportReport')}
      </Button>

      {/* New training */}
      <Button onClick={onNewTraining} variant="outline" className="w-full">
        <i className="fas fa-redo mr-2" />
        {t('training.result.newTraining')}
      </Button>

      {/* Off-screen charts container for PDF snapshot */}
      <div
        ref={chartsRef}
        style={{
          position: 'fixed',
          left: '-10000px',
          top: 0,
          width: '900px',
          background: '#ffffff',
          color: '#000000',
          padding: '16px',
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        <TrainingMetricsChart metricsHistory={metricsHistory} />
      </div>
    </div>
  );
}
