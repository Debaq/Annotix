import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { InferenceModelEntry, ModelConfigResult } from '../types';

interface ModelUploaderProps {
  model: InferenceModelEntry | null;
  loading: boolean;
  configResult?: ModelConfigResult | null;
  onUpload: () => void;
  onDelete: (modelId: string) => void;
}

export function ModelUploader({ model, loading, configResult, onUpload, onDelete }: ModelUploaderProps) {
  const { t } = useTranslation();

  // Extraer info del modelo desde metadata si existe
  const modelVersion = model?.metadata
    ? (model.metadata as any)?.model_info?.version
    : null;
  const modelType = model?.metadata
    ? (model.metadata as any)?.model_info?.type
    : null;

  // Colores del config result o de la metadata guardada
  const colors: Record<string, string> = configResult?.colors
    || (model?.metadata as any)?.color_palette
    || {};

  if (model) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <i className="fas fa-brain text-purple-400 text-sm" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{model.name}</p>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="uppercase font-mono">{model.format}</span>
                <span>·</span>
                <span>{modelType || model.task}</span>
                {model.inputSize && (
                  <>
                    <span>·</span>
                    <span>{model.inputSize}px</span>
                  </>
                )}
                <span>·</span>
                <span>{t('inference.classesCount', { count: model.classNames.length })}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {model.format === 'onnx' ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-500/15 text-orange-400 border border-orange-500/20">
                    <i className="fas fa-cog text-[8px]" />
                    Rust (nativo)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/20">
                    <i className="fab fa-python text-[8px]" />
                    Python
                  </span>
                )}
                {modelVersion && (
                  <span className="text-xs text-gray-500">v{modelVersion}</span>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => onDelete(model.id)}
            title={t('inference.deleteModel')}
          >
            <i className="fas fa-trash text-xs" />
          </Button>
        </div>

        {/* Muestra clases con colores si hay palette */}
        {Object.keys(colors).length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {model.classNames.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-800/80 text-gray-300"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: colors[name] || '#6b7280' }}
                />
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={onUpload}
      disabled={loading}
      className="w-full p-6 rounded-lg border-2 border-dashed border-gray-600 hover:border-purple-500/50 transition-colors flex flex-col items-center gap-2 text-gray-400 hover:text-purple-400"
    >
      {loading ? (
        <>
          <i className="fas fa-spinner fa-spin text-2xl" />
          <span className="text-sm">{t('inference.detectingMetadata')}</span>
        </>
      ) : (
        <>
          <i className="fas fa-cloud-upload-alt text-2xl" />
          <span className="text-sm font-medium">{t('inference.uploadModel')}</span>
          <span className="text-xs text-gray-500">{t('inference.uploadHintFiles')}</span>
        </>
      )}
    </button>
  );
}
