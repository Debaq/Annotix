import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { InferenceModelEntry } from '../types';

interface ModelUploaderProps {
  model: InferenceModelEntry | null;
  loading: boolean;
  onUpload: () => void;
  onDelete: (modelId: string) => void;
}

export function ModelUploader({ model, loading, onUpload, onDelete }: ModelUploaderProps) {
  const { t } = useTranslation('inference');

  if (model) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <i className="fas fa-brain text-emerald-400 text-sm" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{model.name}</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="uppercase font-mono">{model.format}</span>
                <span>|</span>
                <span>{model.task}</span>
                {model.inputSize && (
                  <>
                    <span>|</span>
                    <span>{model.inputSize}px</span>
                  </>
                )}
                <span>|</span>
                <span>{model.classNames.length} {t('predictions').toLowerCase()}</span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => onDelete(model.id)}
            title={t('deleteModel')}
          >
            <i className="fas fa-trash text-xs" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onUpload}
      disabled={loading}
      className="w-full p-6 rounded-lg border-2 border-dashed border-gray-600 hover:border-emerald-500/50 transition-colors flex flex-col items-center gap-2 text-gray-400 hover:text-emerald-400"
    >
      {loading ? (
        <>
          <i className="fas fa-spinner fa-spin text-2xl" />
          <span className="text-sm">{t('detectingMetadata')}</span>
        </>
      ) : (
        <>
          <i className="fas fa-cloud-upload-alt text-2xl" />
          <span className="text-sm font-medium">{t('uploadModel')}</span>
          <span className="text-xs text-gray-500">{t('uploadModelPt')}</span>
        </>
      )}
    </button>
  );
}
