import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface TabularColumnInfo {
  name: string;
  dtype: string;
  uniqueCount: number;
  nullCount: number;
  sampleValues: string[];
}

export interface TabularDataEntry {
  id: string;
  name: string;
  file: string;
  uploaded: number;
  rows: number;
  columns: TabularColumnInfo[];
  targetColumn: string | null;
  featureColumns: string[];
  taskType: string | null;
}

export interface TabularPreview {
  columns: string[];
  rows: string[][];
  totalRows: number;
}

export function useTabularData(projectId: string | null) {
  const [dataEntries, setDataEntries] = useState<TabularDataEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<TabularPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const entries = await invoke<TabularDataEntry[]>('list_tabular_data', { projectId });
      setDataEntries(entries);
    } catch (err) {
      console.error('Error loading tabular data:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFile = useCallback(async (sourcePath: string, fileName: string) => {
    if (!projectId) return null;
    try {
      const entry = await invoke<TabularDataEntry>('upload_tabular_file', {
        projectId,
        sourcePath,
        fileName,
      });
      await refresh();
      return entry;
    } catch (err) {
      console.error('Error uploading tabular file:', err);
      throw err;
    }
  }, [projectId, refresh]);

  const loadPreview = useCallback(async (dataId: string, maxRows = 100) => {
    if (!projectId) return;
    setPreviewLoading(true);
    try {
      const result = await invoke<TabularPreview>('get_tabular_preview', {
        projectId,
        dataId,
        maxRows,
      });
      setPreview(result);
    } catch (err) {
      console.error('Error loading preview:', err);
    } finally {
      setPreviewLoading(false);
    }
  }, [projectId]);

  const updateConfig = useCallback(async (
    dataId: string,
    targetColumn: string | null,
    featureColumns: string[],
    taskType: string | null,
  ) => {
    if (!projectId) return;
    try {
      await invoke('update_tabular_config', {
        projectId,
        dataId,
        targetColumn,
        featureColumns,
        taskType,
      });
      await refresh();
    } catch (err) {
      console.error('Error updating config:', err);
      throw err;
    }
  }, [projectId, refresh]);

  const deleteData = useCallback(async (dataId: string) => {
    if (!projectId) return;
    try {
      await invoke('delete_tabular_data', { projectId, dataId });
      setPreview(null);
      await refresh();
    } catch (err) {
      console.error('Error deleting data:', err);
      throw err;
    }
  }, [projectId, refresh]);

  return {
    dataEntries,
    loading,
    preview,
    previewLoading,
    uploadFile,
    loadPreview,
    updateConfig,
    deleteData,
    refresh,
  };
}
