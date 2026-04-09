import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../core/store/uiStore';
import { useInferenceModels } from '../../inference/hooks/useInferenceModels';
import { useInferenceRunner } from '../../inference/hooks/useInferenceRunner';
import { useImages } from '../hooks/useImages';
import { useToast } from '@/components/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { InferenceConfig, InferenceCompletedEvent, InferenceErrorEvent } from '../../inference/types';

type FilterType = 'all' | 'annotated' | 'unannotated';

export function GalleryFilters() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentProjectId, galleryFilter, setGalleryFilter } = useUIStore();
  const { images } = useImages();
  const { selectedModel } = useInferenceModels(currentProjectId);

  const handleBatchCompleted = useCallback((_event: InferenceCompletedEvent) => {
    toast({ title: t('gallery.inferenceCompleted', 'Inferencia batch completada'), duration: 4000 });
  }, [toast, t]);

  const handleBatchError = useCallback((event: InferenceErrorEvent) => {
    toast({ title: `Error: ${event.error}`, variant: 'destructive', duration: 5000 });
  }, [toast]);

  const { running, progress, startBatch } = useInferenceRunner(undefined, handleBatchCompleted, handleBatchError);

  const progressPercent = running && progress
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const handleInferAll = useCallback(async () => {
    if (!currentProjectId || !selectedModel || images.length === 0) return;
    const config: InferenceConfig = {
      confidenceThreshold: 0.25,
      inputSize: selectedModel.inputSize || null,
      device: 'cpu',
      iouThreshold: 0.45,
    };
    const imageIds = images.map((img) => img.id).filter((id): id is string => !!id);
    await startBatch(currentProjectId, selectedModel.id, imageIds, config);
  }, [currentProjectId, selectedModel, images, startBatch]);

  const filters: { type: FilterType; icon: string }[] = [
    { type: 'all', icon: 'fa-images' },
    { type: 'annotated', icon: 'fa-check-circle' },
    { type: 'unannotated', icon: 'fa-circle' },
  ];

  return (
    <div>
      <div className="gallery-filters">
        {filters.map((filter) => (
          <button
            key={filter.type}
            onClick={() => setGalleryFilter(filter.type)}
            className={cn(
              "filter-btn",
              galleryFilter === filter.type && "active"
              )}>

            <i className={`fas ${filter.icon} mr-1`}></i>
            {t(`gallery.filter.${filter.type}`)}
          </button>
        ))}
      </div>
      {selectedModel && !running && (
        <button
          onClick={handleInferAll}
          disabled={images.length === 0}
          className="annotix-btn w-full mt-2"
          style={{
            background: '#7c3aed',
            color: 'white',
            opacity: images.length === 0 ? 0.6 : 1,
            fontSize: '0.75rem',
          }}
        >
          <i className="fas fa-brain mr-1"></i>
          {t('gallery.inferAll', 'Inferir todas')}
        </button>
      )}
      {selectedModel && running && (
        <div
          className="w-full mt-2 relative overflow-hidden"
          style={{
            height: '28px',
            borderRadius: '6px',
            background: 'white',
            border: '1px solid #7c3aed',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
              width: `${progressPercent}%`,
              background: '#7c3aed',
              transition: 'width 0.3s ease',
            }}
          />
          <span
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontSize: '0.7rem',
              fontWeight: 600,
              color: progressPercent > 50 ? 'white' : '#7c3aed',
              zIndex: 1,
            }}
          >
            <i className="fas fa-spinner fa-spin mr-1"></i>
            {progress ? `${progress.current}/${progress.total}` : '...'}
          </span>
        </div>
      )}
    </div>
  );
}
