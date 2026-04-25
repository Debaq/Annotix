import { memo } from 'react';
import { useTranslation } from 'react-i18next';

interface DatasetSplitVisualizerProps {
  total: number;
  valSplit: number;
  testSplit: number;
}

function computeSplit(total: number, valSplit: number, testSplit: number) {
  if (total <= 0) return { train: 0, val: 0, test: 0 };
  if (total === 1) return { train: 1, val: 0, test: 0 };

  let test = Math.round(total * Math.max(0, testSplit));
  if (testSplit > 0 && test === 0) test = 1;
  if (test >= total) test = total - 2;

  let val = Math.ceil(total * Math.max(0, valSplit));
  val = Math.max(1, Math.min(val, Math.max(1, total - test - 1)));
  if (val + test >= total) val = total - test - 1;

  const train = total - val - test;
  return { train, val, test };
}

export const DatasetSplitVisualizer = memo(function DatasetSplitVisualizer({
  total,
  valSplit,
  testSplit,
}: DatasetSplitVisualizerProps) {
  const { t } = useTranslation();
  const { train, val, test } = computeSplit(total, valSplit, testSplit);
  const trainPct = total > 0 ? (train / total) * 100 : 0;
  const valPct = total > 0 ? (val / total) * 100 : 0;
  const testPct = total > 0 ? (test / total) * 100 : 0;

  if (total === 0) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
        {t('training.split.noImages', 'No hay imágenes anotadas en el proyecto')}
      </div>
    );
  }

  const tinyWarning = total < 20;

  return (
    <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">
          {t('training.split.title', 'División del dataset')}
        </span>
        <span className="text-muted-foreground font-mono">
          {total} {t('training.split.images', 'imágenes')}
        </span>
      </div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500 transition-all" style={{ width: `${trainPct}%` }} title={`train ${train}`} />
        <div className="bg-blue-500 transition-all" style={{ width: `${valPct}%` }} title={`val ${val}`} />
        {test > 0 && (
          <div className="bg-purple-500 transition-all" style={{ width: `${testPct}%` }} title={`test ${test}`} />
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <SplitBadge color="emerald" label={t('training.split.train', 'Train')} count={train} pct={trainPct} />
        <SplitBadge color="blue" label={t('training.split.val', 'Val')} count={val} pct={valPct} />
        <SplitBadge color="purple" label={t('training.split.test', 'Test')} count={test} pct={testPct} muted={test === 0} />
      </div>
      {tinyWarning && (
        <p className="text-[11px] text-amber-600">
          {t('training.split.tinyWarning', 'Dataset muy pequeño. Considerá desactivar el test split (0) o anotar más imágenes.')}
        </p>
      )}
    </div>
  );
});

function SplitBadge({
  color,
  label,
  count,
  pct,
  muted,
}: {
  color: 'emerald' | 'blue' | 'purple';
  label: string;
  count: number;
  pct: number;
  muted?: boolean;
}) {
  const dot = {
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
  }[color];
  return (
    <div className={`flex items-center gap-1.5 ${muted ? 'opacity-50' : ''}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="font-medium">{label}</span>
      <span className="ml-auto font-mono">
        {count} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span>
      </span>
    </div>
  );
}
