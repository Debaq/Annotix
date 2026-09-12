import { TimeSeries } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { timeseriesService } from '../services/timeseriesService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export function useCurrentTimeSeries() {
  const { currentTimeSeriesId, currentProjectId } = useUIStore();

  const { data, isLoading: loading, reload } = useTauriQuery(
    async () => {
      if (!currentTimeSeriesId || !currentProjectId) return null;
      return (await timeseriesService.getById(currentProjectId, currentTimeSeriesId)) ?? null;
    },
    [currentTimeSeriesId, currentProjectId],
    ['db:timeseries-changed']
  );

  return {
    timeseries: (data ?? null) as TimeSeries | null,
    loading,
    reload,
  };
}
