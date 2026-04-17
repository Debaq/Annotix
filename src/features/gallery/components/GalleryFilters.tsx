import { useCallback, useMemo, useState } from 'react';
import { InferenceLogModal } from '../../inference/components/InferenceLogModal';
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

  const { running, startBatch, cancel } = useInferenceRunner(undefined, handleBatchCompleted, handleBatchError);
  const [logOpen, setLogOpen] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);

  const fileNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const img of images) {
      if (img.id) m.set(img.id, img.name ?? img.id);
    }
    return m;
  }, [images]);

  const handleInferAll = useCallback(async () => {
    if (!currentProjectId || !selectedModel || images.length === 0) return;
    const config: InferenceConfig = {
      confidenceThreshold: 0.25,
      inputSize: selectedModel.inputSize || null,
      device: 'cpu',
      iouThreshold: 0.45,
    };
    const imageIds = images.map((img) => img.id).filter((id): id is string => !!id);
    setBatchTotal(imageIds.length);
    setLogOpen(true);
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
      {selectedModel && (
        <button
          onClick={running ? () => setLogOpen(true) : handleInferAll}
          disabled={!running && images.length === 0}
          className="annotix-btn w-full mt-2"
          style={{
            background: '#7c3aed',
            color: 'white',
            opacity: !running && images.length === 0 ? 0.6 : 1,
            fontSize: '0.75rem',
          }}
        >
          <i className={`fas ${running ? 'fa-spinner fa-spin' : 'fa-brain'} mr-1`}></i>
          {running
            ? t('gallery.inferRunning', 'Inferencia en curso (ver log)')
            : t('gallery.inferAll', 'Inferir todas')}
        </button>
      )}
      <InferenceLogModal
        open={logOpen}
        total={batchTotal}
        fileNameById={fileNameById}
        onCancel={async () => {
          await cancel();
          setLogOpen(false);
        }}
        onClose={() => setLogOpen(false)}
      />
    </div>
  );
}
