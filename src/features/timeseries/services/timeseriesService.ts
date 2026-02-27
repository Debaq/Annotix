import { TimeSeries, TimeSeriesAnnotation } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const timeseriesService = {
  async getByProjectId(projectId: number): Promise<TimeSeries[]> {
    const records = await tauriDb.listTimeseriesByProject(projectId);
    return records as unknown as TimeSeries[];
  },

  async getById(id: number): Promise<TimeSeries | undefined> {
    const record = await tauriDb.getTimeseries(id);
    return (record as unknown as TimeSeries) ?? undefined;
  },

  async create(timeseries: Omit<TimeSeries, 'id'>): Promise<number> {
    return await tauriDb.createTimeseries(
      timeseries.projectId,
      timeseries.name,
      timeseries.data
    );
  },

  async delete(id: number): Promise<void> {
    await tauriDb.deleteTimeseries(id);
  },

  async deleteByProjectId(projectId: number): Promise<void> {
    const records = await tauriDb.listTimeseriesByProject(projectId);
    for (const record of records) {
      if (record.id) {
        await tauriDb.deleteTimeseries(record.id);
      }
    }
  },

  async saveAnnotations(
    timeseriesId: number,
    annotations: TimeSeriesAnnotation[]
  ): Promise<void> {
    await tauriDb.saveTsAnnotations(timeseriesId, annotations);
  },

  async getCountByStatus(
    projectId: number,
    status: 'pending' | 'annotated' | 'reviewed'
  ): Promise<number> {
    const records = await tauriDb.listTimeseriesByProject(projectId);
    return records.filter((r) => r.metadata.status === status).length;
  },
};
