import { useState, useEffect } from 'react';
import { TimeSeries } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { timeseriesService } from '../services/timeseriesService';

export function useCurrentTimeSeries() {
  const { currentTimeSeriesId } = useUIStore();
  const [timeseries, setTimeseries] = useState<TimeSeries | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!currentTimeSeriesId) {
      setTimeseries(null);
      return;
    }

    setLoading(true);
    try {
      const data = await timeseriesService.getById(currentTimeSeriesId);
      setTimeseries(data || null);
    } catch (error) {
      console.error('Failed to load current time series:', error);
      setTimeseries(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [currentTimeSeriesId]);

  return {
    timeseries,
    loading,
    reload: load,
  };
}
