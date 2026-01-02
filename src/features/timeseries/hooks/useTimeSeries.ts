import { useState, useEffect } from 'react';
import { TimeSeries } from '@/lib/db';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { timeseriesService } from '../services/timeseriesService';

export function useTimeSeries() {
  const { project } = useCurrentProject();
  const [timeseries, setTimeseries] = useState<TimeSeries[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!project?.id) {
      setTimeseries([]);
      return;
    }

    setLoading(true);
    try {
      const data = await timeseriesService.getByProjectId(project.id);
      setTimeseries(data);
    } catch (error) {
      console.error('Failed to load time series:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [project?.id]);

  const addTimeSeries = async (ts: Omit<TimeSeries, 'id'>) => {
    if (!project?.id) return;

    try {
      const id = await timeseriesService.create(ts);
      await load(); // Reload to get the new time series
      return id;
    } catch (error) {
      console.error('Failed to add time series:', error);
      throw error;
    }
  };

  const deleteTimeSeries = async (id: number) => {
    try {
      await timeseriesService.delete(id);
      await load();
    } catch (error) {
      console.error('Failed to delete time series:', error);
      throw error;
    }
  };

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
