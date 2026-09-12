import { useCallback } from 'react';
import { TimeSeries, TimeSeriesAnnotation, TimeSeriesData } from '@/lib/db';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { timeseriesService } from '../services/timeseriesService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export function useTimeSeries() {
  const { project } = useCurrentProject();

  // Escucha `db:timeseries-changed`, que el backend ya emitía y nadie usaba:
  // sin esto la galería no reflejaba lo que cambiaba otra ventana o un peer.
  const { data, isLoading: loading, reload: load } = useTauriQuery(
    async () => {
      if (!project?.id) return [];
      return timeseriesService.getByProjectId(project.id);
    },
    [project?.id],
    ['db:timeseries-changed']
  );

  const timeseries = (data || []) as TimeSeries[];

  const addTimeSeries = useCallback(async (
    name: string,
    seriesData: TimeSeriesData,
    annotations: TimeSeriesAnnotation[] = []
  ) => {
    if (!project?.id) return;
    // El evento `db:timeseries-changed` dispara la recarga; no hace falta pedirla.
    return timeseriesService.create(project.id, name, seriesData, annotations);
  }, [project?.id]);

  const deleteTimeSeries = useCallback(async (id: string) => {
    if (!project?.id) return;
    await timeseriesService.delete(project.id, id);
  }, [project?.id]);

  const getStats = () => {
    const total = timeseries.length;
    const annotated = timeseries.filter(
      (ts) => ts.metadata.status === 'annotated' || ts.metadata.status === 'reviewed'
    ).length;
    const pending = total - annotated;

    return { total, annotated, pending };
  };

  return {
    timeseries,
    loading,
    reload: load,
    addTimeSeries,
    deleteTimeSeries,
    stats: getStats(),
  };
}
