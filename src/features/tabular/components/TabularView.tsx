import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { useUIStore } from '@/features/core/store/uiStore';
import { useTabularData, TabularDataEntry } from '../hooks/useTabularData';
import { DataPreviewTable } from './DataPreviewTable';
import { ColumnSelector } from './ColumnSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function TabularView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { project } = useCurrentProject();
  const { currentProjectId, setCurrentProjectId } = useUIStore();
  const { dataEntries, loading, preview, previewLoading, uploadFile, loadPreview, updateConfig, deleteData } = useTabularData(currentProjectId);
  const [selectedEntry, setSelectedEntry] = useState<TabularDataEntry | null>(null);
  const [uploading, setUploading] = useState(false);

  // Auto-select first entry and load preview
  useEffect(() => {
    if (dataEntries.length > 0 && !selectedEntry) {
      setSelectedEntry(dataEntries[0]);
      loadPreview(dataEntries[0].id);
    }
  }, [dataEntries, selectedEntry, loadPreview]);

  // Sync selected entry with dataEntries
  useEffect(() => {
    if (selectedEntry) {
      const updated = dataEntries.find(e => e.id === selectedEntry.id);
      if (updated) setSelectedEntry(updated);
    }
  }, [dataEntries, selectedEntry]);

  const handleUpload = async () => {
    try {
      const result = await open({
        multiple: false,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (result && typeof result === 'string') {
        setUploading(true);
        const path = result;
        const fileName = path.split(/[/\\]/).pop() || 'data.csv';
        const entry = await uploadFile(path, fileName);
        if (entry) {
          setSelectedEntry(entry);
          loadPreview(entry.id);
        }
        setUploading(false);
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploading(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    await deleteData(entryId);
    if (selectedEntry?.id === entryId) {
      setSelectedEntry(null);
    }
  };

  const handleConfigUpdate = async (
    targetColumn: string | null,
    featureColumns: string[],
    taskType: string | null,
  ) => {
    if (!selectedEntry) return;
    await updateConfig(selectedEntry.id, targetColumn, featureColumns, taskType);
  };

  if (!project) return null;

  return (
    <div className="flex h-full">
      {/* Left: Data list + upload */}
      <div className="w-80 border-r bg-card p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t('tabular.datasets')}
          </h2>
          <Button size="sm" onClick={handleUpload} disabled={uploading}>
            {uploading ? (
              <i className="fas fa-spinner fa-spin mr-1"></i>
            ) : (
              <i className="fas fa-upload mr-1"></i>
            )}
            {t('tabular.upload')}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-8">
            <i className="fas fa-spinner fa-spin text-2xl text-muted-foreground"></i>
          </div>
        ) : dataEntries.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <i className="fas fa-table text-4xl text-muted-foreground/30 mb-3"></i>
              <p className="text-sm text-muted-foreground">{t('tabular.noData')}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleUpload}>
                <i className="fas fa-upload mr-1"></i>
                {t('tabular.uploadFirst')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {dataEntries.map(entry => (
              <Card
                key={entry.id}
                className={`cursor-pointer transition-all ${
                  selectedEntry?.id === entry.id
                    ? 'border-primary shadow-sm'
                    : 'hover:border-primary/50'
                }`}
                onClick={() => {
                  setSelectedEntry(entry);
                  loadPreview(entry.id);
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <i className="fas fa-file-csv text-emerald-600 shrink-0"></i>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{entry.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.rows.toLocaleString()} {t('tabular.rows')} · {entry.columns.length} {t('tabular.cols')}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(entry.id);
                      }}
                    >
                      <i className="fas fa-trash text-xs text-destructive"></i>
                    </Button>
                  </div>
                  {entry.targetColumn && (
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                        {t('tabular.target')}: {entry.targetColumn}
                      </span>
                      {entry.taskType && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                          {entry.taskType}
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-auto pt-4 border-t">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setCurrentProjectId(null);
              navigate('/');
            }}
          >
            <i className="fas fa-arrow-left mr-2"></i>
            {t('common.backToProjects')}
          </Button>
        </div>
      </div>

      {/* Center: Preview + Column configuration */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selectedEntry ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <i className="fas fa-table text-6xl mb-4 opacity-20"></i>
              <p className="text-lg font-medium">{t('tabular.selectOrUpload')}</p>
              <p className="text-sm mt-2 opacity-70">{t('tabular.selectOrUploadDesc')}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div>
              <h1 className="text-xl font-semibold">{selectedEntry.name}</h1>
              <p className="text-sm text-muted-foreground">
                {selectedEntry.rows.toLocaleString()} {t('tabular.rows')} · {selectedEntry.columns.length} {t('tabular.columns')}
              </p>
            </div>

            {/* Column selector */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('tabular.configuration')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ColumnSelector
                  columns={selectedEntry.columns}
                  targetColumn={selectedEntry.targetColumn}
                  featureColumns={selectedEntry.featureColumns}
                  taskType={selectedEntry.taskType}
                  onUpdate={handleConfigUpdate}
                />
              </CardContent>
            </Card>

            {/* Data preview */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('tabular.preview')}</CardTitle>
              </CardHeader>
              <CardContent>
                {previewLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <i className="fas fa-spinner fa-spin text-2xl text-muted-foreground"></i>
                  </div>
                ) : preview ? (
                  <DataPreviewTable
                    columns={preview.columns}
                    rows={preview.rows}
                    totalRows={preview.totalRows}
                    targetColumn={selectedEntry.targetColumn}
                    featureColumns={selectedEntry.featureColumns}
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
