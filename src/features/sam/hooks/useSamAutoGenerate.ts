import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { samAutoGenerateMasks, samEncodeImage } from '@/lib/tauriDb';
import type { AmgConfig, Annotation, BBoxData } from '@/lib/db';
import { useSamStore } from '../store/useSamStore';
import { useToast } from '@/components/hooks/use-toast';

function bboxesFromAnnotations(
  anns: Annotation[],
): [number, number, number, number][] {
  return anns
    .filter((a) => a.type === 'bbox')
    .map((a) => {
      const d = a.data as BBoxData;
      return [d.x, d.y, d.width, d.height] as [number, number, number, number];
    });
}

interface Params {
  projectId: string | null;
  imageId: string | null;
  annotations: Annotation[];
}

export function useSamAutoGenerate({ projectId, imageId, annotations }: Params) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const token = useSamStore((s) => s.amgRequestToken);
  const pairId = useSamStore((s) => s.pairId);
  const hqMode = useSamStore((s) => s.hqMode);
  const filters = useSamStore((s) => s.filters);
  const setCandidates = useSamStore((s) => s.setCandidates);
  const setAmgProgress = useSamStore((s) => s.setAmgProgress);
  const setGenerating = useSamStore((s) => s.setGenerating);

  const annsRef = useRef(annotations);
  annsRef.current = annotations;
  const lastRunRef = useRef(0);

  useEffect(() => {
    if (token === 0 || token === lastRunRef.current) return;
    if (!pairId || !projectId || !imageId) return;
    if (useSamStore.getState().generating) return;
    lastRunRef.current = token;

    const cfg: AmgConfig = {
      pointsPerSide: hqMode ? 32 : 16,
      predIouThresh: filters.predIouMin,
      stabilityScoreThresh: filters.stabilityMin,
      boxNmsThresh: filters.nmsThresh,
      minMaskRegionArea: 100,
      overlapWithExistingThresh: filters.overlapThresh,
    };

    setGenerating(true);
    setAmgProgress(null);
    (async () => {
      try {
        // Encode idempotente: si ya está cacheada la embedding, vuelve al toque.
        await samEncodeImage(projectId, imageId);
        const masks = await samAutoGenerateMasks(
          projectId,
          imageId,
          cfg,
          bboxesFromAnnotations(annsRef.current),
        );
        setCandidates(masks);
        toast({
          title: `${masks.length} ${t('sam.panel.candidates')}`,
          duration: 2500,
        });
      } catch (e) {
        toast({
          title: String(e),
          variant: 'destructive',
          duration: 6000,
        });
      } finally {
        setGenerating(false);
        setAmgProgress(null);
      }
    })();
  }, [
    token,
    pairId,
    projectId,
    imageId,
    hqMode,
    filters,
    setAmgProgress,
    setCandidates,
    setGenerating,
    t,
    toast,
  ]);
}
