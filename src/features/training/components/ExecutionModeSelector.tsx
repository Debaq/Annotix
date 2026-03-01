import { useTranslation } from 'react-i18next';
import type { ExecutionMode } from '../types';

interface ExecutionModeSelectorProps {
  selected: ExecutionMode;
  onSelect: (mode: ExecutionMode) => void;
  onStartLocal: () => void;
  onDownloadPackage: () => void;
}

export function ExecutionModeSelector({
  selected,
  onSelect,
  onStartLocal,
  onDownloadPackage,
}: ExecutionModeSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-1">{t('training.execution.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('training.execution.description')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Local training */}
        <button
          onClick={() => onSelect('local')}
          className={`p-4 rounded-lg border-2 text-left transition-all ${
            selected === 'local'
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-border hover:bg-accent/50'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <i className="fas fa-desktop text-lg text-emerald-500" />
            <span className="font-semibold text-sm">{t('training.execution.local')}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t('training.execution.localDesc')}</p>
        </button>

        {/* Download package */}
        <button
          onClick={() => onSelect('download_package')}
          className={`p-4 rounded-lg border-2 text-left transition-all ${
            selected === 'download_package'
              ? 'border-violet-500 bg-violet-500/10'
              : 'border-border hover:bg-accent/50'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <i className="fas fa-file-archive text-lg text-violet-500" />
            <span className="font-semibold text-sm">{t('training.execution.download')}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t('training.execution.downloadDesc')}</p>
        </button>
      </div>

      <div className="flex justify-end">
        {selected === 'local' ? (
          <button
            onClick={onStartLocal}
            className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors flex items-center gap-2"
          >
            <i className="fas fa-play" />
            {t('training.start')}
          </button>
        ) : (
          <button
            onClick={onDownloadPackage}
            className="px-6 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium text-sm transition-colors flex items-center gap-2"
          >
            <i className="fas fa-download" />
            {t('training.execution.downloadPackage')}
          </button>
        )}
      </div>
    </div>
  );
}
