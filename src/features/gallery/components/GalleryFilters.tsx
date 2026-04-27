import { useCallback, useMemo, useState } from 'react';
import { InferenceLogModal } from '../../inference/components/InferenceLogModal';
import { InferencePanel } from '../../inference/components/InferencePanel';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../core/store/uiStore';
import { useInferenceModels } from '../../inference/hooks/useInferenceModels';
import { useInferenceRunner } from '../../inference/hooks/useInferenceRunner';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useImages } from '../hooks/useImages';
import { useToast } from '@/components/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ClassFilterControls } from './ClassFilterControls';
import { AnnotationInspectorModal } from './AnnotationInspectorModal';
import type { InferenceConfig, InferenceCompletedEvent, InferenceErrorEvent } from '../../inference/types';

type FilterType = 'all' | 'annotated' | 'unannotated';

export function GalleryFilters() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentProjectId, galleryFilter, setGalleryFilter } = useUIStore();
  const { project } = useCurrentProject();
  const { images } = useImages();
  const { selectedModel } = useInferenceModels(currentProjectId);

  const handleBatchCompleted = useCallback((_event: InferenceCompletedEvent) => {
    toast({ title: t('gallery.inferenceCompleted'), duration: 4000 });
  }, [toast, t]);

  const handleBatchError = useCallback((event: InferenceErrorEvent) => {
    toast({ title: `Error: ${event.error}`, variant: 'destructive', duration: 5000 });
  }, [toast]);

  const { running, startBatch, cancel } = useInferenceRunner(undefined, handleBatchCompleted, handleBatchError);
  const [logOpen, setLogOpen] = useState(false);
  const [batchTotal, setBatchTotal] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);

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

      <ClassFilterControls />

      <button
        onClick={() => setInspectorOpen(true)}
        className="annotix-btn annotix-btn-outline mt-2 w-full"
        style={{ fontSize: '0.75rem' }}
        title={t('inspector.title', 'Inspector de anotaciones')}
      >
        <i className="fas fa-microscope mr-2"></i>
        {t('inspector.title', 'Inspector de anotaciones')}
      </button>

      <AnnotationInspectorModal open={inspectorOpen} onOpenChange={setInspectorOpen} />

      {/* Inferencia: sin modelo = cargar; con modelo = inferir todas + engrane */}
      {!selectedModel ? (
        <div className="mt-2">
          <InferencePanel project={project} trigger={
            <button className="annotix-btn annotix-btn-outline w-full" style={{ fontSize: '0.75rem' }}>
              <i className="fas fa-brain mr-2" style={{ color: '#7c3aed' }} />
              {t('inference.loadModel')}
            </button>
          } />
        </div>
      ) : (
        <div className="mt-2 flex gap-1">
          <button
            onClick={running ? () => setLogOpen(true) : handleInferAll}
            disabled={!running && images.length === 0}
            className="annotix-btn flex-1"
            style={{
              background: '#7c3aed',
              color: 'white',
              opacity: !running && images.length === 0 ? 0.6 : 1,
              fontSize: '0.75rem',
            }}
          >
            <i className={`fas ${running ? 'fa-spinner fa-spin' : 'fa-brain'} mr-1`}></i>
            {running
              ? t('gallery.inferRunning')
              : t('gallery.inferAll')}
          </button>
          <InferencePanel project={project} trigger={
            <button
              className="annotix-btn annotix-btn-outline"
              style={{ fontSize: '0.75rem', padding: '0 8px', flexShrink: 0 }}
              title={t('inference.config')}
            >
              <i className="fas fa-cog"></i>
            </button>
          } />
        </div>
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
