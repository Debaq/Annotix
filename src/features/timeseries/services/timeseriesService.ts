import { db, TimeSeries, TimeSeriesAnnotation } from '@/lib/db';

export const timeseriesService = {
  /**
   * Get all time series for a project
   */
  async getByProjectId(projectId: number): Promise<TimeSeries[]> {
    return await db.timeseries.where('projectId').equals(projectId).toArray();
  },

  /**
   * Get single time series by ID
   */
  async getById(id: number): Promise<TimeSeries | undefined> {
    return await db.timeseries.get(id);
  },

  /**
   * Create a new time series
   */
  async create(timeseries: Omit<TimeSeries, 'id'>): Promise<number> {
    const id = await db.timeseries.add({
      ...timeseries,
      metadata: {
        ...timeseries.metadata,
        uploaded: timeseries.metadata?.uploaded || Date.now(),
        status: timeseries.metadata?.status || 'pending',
      },
    });
    return id;
  },

  /**
   * Delete time series
   */
  async delete(id: number): Promise<void> {
    await db.timeseries.delete(id);
  },

  /**
   * Delete all time series for a project
   */
  async deleteByProjectId(projectId: number): Promise<void> {
    await db.timeseries.where('projectId').equals(projectId).delete();
  },

  /**
   * Update annotations for a time series
   */
  async saveAnnotations(
    timeseriesId: number,
    annotations: TimeSeriesAnnotation[]
  ): Promise<void> {
    const ts = await db.timeseries.get(timeseriesId);
    if (!ts) {
      throw new Error(`TimeSeries ${timeseriesId} not found`);
    }

    await db.timeseries.update(timeseriesId, {
      annotations,
      metadata: {
        ...ts.metadata,
        annotated: Date.now(),
        status: annotations.length > 0 ? 'annotated' : 'pending',
      },
    });
  },

  /**
   * Get time series count by status
   */
  async getCountByStatus(
    projectId: number,
    status: 'pending' | 'annotated' | 'reviewed'
  ): Promise<number> {
    return await db.timeseries
      .where('projectId')
      .equals(projectId)
      .and((ts) => ts.metadata.status === status)
      .count();
  },
};
