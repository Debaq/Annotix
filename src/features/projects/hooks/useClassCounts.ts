import { useUIStore } from '../../core/store/uiStore';
import * as tauriDb from '@/lib/tauriDb';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export interface ClassCounts {
  total: number;
  byClass: Record<number, number>;
}

const EMPTY: ClassCounts = { total: 0, byClass: {} };

export function useClassCounts(): ClassCounts {
  const { currentProjectId } = useUIStore();

  const { data } = useTauriQuery<ClassCounts>(
    async () => {
      if (!currentProjectId) return EMPTY;

      const byClass: Record<number, number> = {};
      let total = 0;
      const bump = (cid: number | null | undefined) => {
        if (cid == null) return;
        byClass[cid] = (byClass[cid] ?? 0) + 1;
        total += 1;
      };

      const [images, videos, series] = await Promise.all([
        tauriDb.listImagesByProject(currentProjectId).catch(() => []),
        tauriDb.listVideosByProject(currentProjectId).catch(() => []),
        tauriDb.listTimeseriesByProject(currentProjectId).catch(() => []),
      ]);

      for (const img of images) {
        for (const ann of img.annotations ?? []) bump(ann.classId);
      }
      for (const vid of videos) {
        for (const tr of vid.tracks ?? []) bump(tr.classId);
      }
      for (const ts of series) {
        for (const ann of ts.annotations ?? []) bump(ann.classId);
      }

      return { total, byClass };
    },
    [currentProjectId],
    [
      'db:images-changed',
      'db:videos-changed',
      'db:tracks-changed',
      'db:timeseries-changed',
    ]
  );

  return data ?? EMPTY;
}
