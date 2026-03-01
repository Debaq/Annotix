import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { TabularColumnInfo } from '../hooks/useTabularData';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface ColumnSelectorProps {
  columns: TabularColumnInfo[];
  targetColumn: string | null;
  featureColumns: string[];
  taskType: string | null;
  onUpdate: (target: string | null, features: string[], taskType: string | null) => void;
}

export function ColumnSelector({ columns, targetColumn, featureColumns, taskType, onUpdate }: ColumnSelectorProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<string | null>(targetColumn);
  const [features, setFeatures] = useState<string[]>(featureColumns);
  const [task, setTask] = useState<string | null>(taskType);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTarget(targetColumn);
    setFeatures(featureColumns);
    setTask(taskType);
    setDirty(false);
  }, [targetColumn, featureColumns, taskType]);

  const handleTargetChange = (col: string) => {
    setTarget(col);
    // Auto-remove from features
    setFeatures(prev => prev.filter(f => f !== col));
    // Auto-detect task type
    const colInfo = columns.find(c => c.name === col);
    if (colInfo) {
      if (colInfo.dtype === 'categorical' || (colInfo.dtype === 'numeric' && colInfo.uniqueCount <= 20)) {
        setTask('classification');
      } else {
        setTask('regression');
      }
    }
    setDirty(true);
  };

  const handleFeatureToggle = (col: string) => {
    if (col === target) return;
    setFeatures(prev =>
      prev.includes(col)
        ? prev.filter(f => f !== col)
        : [...prev, col]
    );
    setDirty(true);
  };

  const handleSelectAllFeatures = () => {
    setFeatures(columns.filter(c => c.name !== target).map(c => c.name));
    setDirty(true);
  };

  const handleDeselectAllFeatures = () => {
    setFeatures([]);
    setDirty(true);
  };

  const handleSave = () => {
    onUpdate(target, features, task);
    setDirty(false);
  };

  const dtypeIcon = (dtype: string) => {
    switch (dtype) {
      case 'numeric': return 'fa-hashtag text-blue-500';
      case 'categorical': return 'fa-list text-orange-500';
      case 'text': return 'fa-font text-gray-500';
      case 'datetime': return 'fa-clock text-purple-500';
      default: return 'fa-question text-gray-400';
    }
  };

  return (
    <div className="space-y-4">
      {/* Target column selection */}
      <div>
        <Label className="text-sm font-medium">{t('tabular.targetColumn')}</Label>
        <p className="text-xs text-muted-foreground mb-2">{t('tabular.targetColumnDesc')}</p>
        <div className="flex flex-wrap gap-1.5">
          {columns.map(col => (
            <button
              key={col.name}
              onClick={() => handleTargetChange(col.name)}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-all ${
                target === col.name
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm'
                  : 'border-border hover:border-emerald-300 text-foreground'
              }`}
            >
              <i className={`fas ${dtypeIcon(col.dtype)} text-[10px]`}></i>
              {col.name}
              {target === col.name && <i className="fas fa-bullseye text-[10px] text-emerald-600"></i>}
            </button>
          ))}
        </div>
      </div>

      {/* Task type */}
      {target && (
        <div>
          <Label className="text-sm font-medium">{t('tabular.taskType')}</Label>
          <div className="flex gap-2 mt-1">
            {['classification', 'regression'].map(tt => (
              <button
                key={tt}
                onClick={() => { setTask(tt); setDirty(true); }}
                className={`px-3 py-1.5 rounded-md text-xs border transition-all ${
                  task === tt
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                {t(`tabular.${tt}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Feature columns */}
      {target && (
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">{t('tabular.featureColumns')}</Label>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={handleSelectAllFeatures}>
                {t('tabular.selectAll')}
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={handleDeselectAllFeatures}>
                {t('tabular.deselectAll')}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{t('tabular.featureColumnsDesc')}</p>
          <div className="flex flex-wrap gap-1.5">
            {columns.filter(c => c.name !== target).map(col => (
              <button
                key={col.name}
                onClick={() => handleFeatureToggle(col.name)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-all ${
                  features.includes(col.name)
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-border hover:border-blue-300 text-muted-foreground'
                }`}
              >
                <i className={`fas ${dtypeIcon(col.dtype)} text-[10px]`}></i>
                {col.name}
                <span className="text-[9px] opacity-60">({col.dtype === 'numeric' ? '#' : 'abc'})</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {features.length} / {columns.length - 1} {t('tabular.selected')}
          </p>
        </div>
      )}

      {/* Save */}
      {dirty && (
        <Button size="sm" onClick={handleSave}>
          <i className="fas fa-check mr-1"></i>
          {t('tabular.saveConfig')}
        </Button>
      )}
    </div>
  );
}
