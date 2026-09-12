import { TimeSeries, TimeSeriesAnnotation, TimeSeriesData } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const timeseriesService = {
  async getByProjectId(projectId: string): Promise<TimeSeries[]> {
    const records = await tauriDb.listTimeseriesByProject(projectId);
    return records as unknown as TimeSeries[];
  },

  async getById(projectId: string, id: string): Promise<TimeSeries | undefined> {
    const record = await tauriDb.getTimeseries(projectId, id);
    return (record as unknown as TimeSeries) ?? undefined;
  },

  async create(
    projectId: string,
    name: string,
    data: TimeSeriesData,
    annotations: TimeSeriesAnnotation[] = []
  ): Promise<string> {
    // El backend acepta anotaciones al crear; antes se descartaban aquí, así que
    // importar una serie ya anotada era imposible.
    return await tauriDb.createTimeseries(projectId, name, data, annotations);
  },

  async delete(projectId: string, id: string): Promise<void> {
    await tauriDb.deleteTimeseries(projectId, id);
  },

  async deleteByProjectId(projectId: string): Promise<void> {
    const records = await tauriDb.listTimeseriesByProject(projectId);
    for (const record of records) {
      if (record.id) {
        await tauriDb.deleteTimeseries(projectId, record.id);
      }
    }
  },

  async saveAnnotations(
    projectId: string,
    timeseriesId: string,
    annotations: TimeSeriesAnnotation[]
  ): Promise<void> {
    await tauriDb.saveTsAnnotations(projectId, timeseriesId, annotations);
  },

  async getCountByStatus(
    projectId: string,
    status: 'pending' | 'annotated' | 'reviewed'
  ): Promise<number> {
    const records = await tauriDb.listTimeseriesByProject(projectId);
    return records.filter((r) => r.metadata.status === status).length;
  },
};
