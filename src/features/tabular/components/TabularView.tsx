import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { useToast } from '@/components/hooks/use-toast';
import { confirm } from '@/lib/dialogs';
import { useUIStore } from '@/features/core/store/uiStore';
import { useTabularData, TabularDataEntry } from '../hooks/useTabularData';
import { DataPreviewTable } from './DataPreviewTable';
import { ColumnSelector } from './ColumnSelector';
import { DataTableEditor } from './DataTableEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function TabularView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { project } = useCurrentProject();
  const { currentProjectId, setCurrentProjectId } = useUIStore();
  const { dataEntries, loading, preview, previewLoading, uploadFile, createTable, updateRows, loadPreview, updateConfig, deleteData } = useTabularData(currentProjectId);
  const { toast } = useToast();
  const [selectedEntry, setSelectedEntry] = useState<TabularDataEntry | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, setSavingConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'view' | 'edit'>('view');

  // New Table Dialog state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableCols, setNewTableCols] = useState('col1,col2,target');

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
          setActiveTab('view');
        }
        setUploading(false);
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast({ title: t('common.error'), description: String(err), variant: 'destructive' });
      setUploading(false);
    }
  };

  const handleCreateManual = async () => {
    if (!newTableName.trim()) return;
    const cols = newTableCols.split(',').map(c => c.trim()).filter(c => c.length > 0);
    if (cols.length === 0) return;

    try {
      const entry = await createTable(newTableName, cols);
      if (entry) {
        setSelectedEntry(entry);
        loadPreview(entry.id);
        setActiveTab('edit');
        setIsCreateDialogOpen(false);
        setNewTableName('');
      }
    } catch (err) {
      console.error('Create error:', err);
      toast({ title: t('common.error'), description: String(err), variant: 'destructive' });
    }
  };

  const handleDelete = async (entryId: string) => {
    const ok = await confirm(t('tabular.confirmDelete'), { kind: 'destructive' });
    if (!ok) return;
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
    setSavingConfig(true);
    try {
      await updateConfig(selectedEntry.id, targetColumn, featureColumns, taskType);
      await loadPreview(selectedEntry.id);
    } catch (err) {
      toast({ title: t('common.error'), description: String(err), variant: 'destructive' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveRows = async (rows: string[][]) => {
    if (!selectedEntry) return;
    await updateRows(selectedEntry.id, rows);
  };

  if (!project) return null;

  return (
    <div className="flex h-full">
      {/* Left: Data list + upload/create */}
      <div className="w-80 border-r bg-card p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {t('tabular.datasets')}
            </h2>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" className="text-xs" onClick={handleUpload} disabled={uploading}>
              <i className="fas fa-upload mr-1"></i>
              {t('tabular.upload')}
            </Button>

            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-xs">
                  <i className="fas fa-plus mr-1"></i>
                  {t('tabular.create')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('tabular.createNewTitle', 'Create New Table')}</DialogTitle>
                  <DialogDescription>
                    {t('tabular.createNewDesc', 'Create a new table manually by defining its name and initial columns.')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>{t('tabular.tableName', 'Table Name')}</Label>
                    <Input 
                      placeholder={t('tabular.placeholderName')}
                      value={newTableName}
                      onChange={e => setNewTableName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('tabular.columns', 'Columns (comma separated)')}</Label>
                    <Input 
                      placeholder={t('tabular.placeholderColumns')}
                      value={newTableCols}
                      onChange={e => setNewTableCols(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button onClick={handleCreateManual} disabled={!newTableName.trim()}>
                    {t('common.create')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
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
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setIsCreateDialogOpen(true)}>
                <i className="fas fa-plus mr-1"></i>
                {t('tabular.createFirst', 'Create first table')}
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
                  setActiveTab('view');
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <i className="fas fa-table text-emerald-600 shrink-0"></i>
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

      {/* Center: Tabs (View/Edit) */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedEntry ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <i className="fas fa-table text-6xl mb-4 opacity-20"></i>
              <p className="text-lg font-medium">{t('tabular.selectOrUpload')}</p>
              <p className="text-sm mt-2 opacity-70">{t('tabular.selectOrUploadDesc')}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b bg-card shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-xl font-semibold">{selectedEntry.name}</h1>
                  <p className="text-sm text-muted-foreground">
                    {selectedEntry.rows.toLocaleString()} {t('tabular.rows')} · {selectedEntry.columns.length} {t('tabular.columns')}
                  </p>
                </div>
                
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'view' | 'edit')} className="w-auto">
                  <TabsList>
                    <TabsTrigger value="view">
                      <i className="fas fa-eye mr-2"></i>
                      {t('tabular.tabs.view', 'Preview & Config')}
                    </TabsTrigger>
                    <TabsTrigger value="edit">
                      <i className="fas fa-edit mr-2"></i>
                      {t('tabular.tabs.edit', 'Edit Data')}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-5xl mx-auto">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'view' | 'edit')}>
                  <TabsContent value="view" className="mt-0 space-y-6">
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
                  </TabsContent>

                  <TabsContent value="edit" className="mt-0">
                    {previewLoading ? (
                      <div className="flex items-center justify-center p-8">
                        <i className="fas fa-spinner fa-spin text-2xl text-muted-foreground"></i>
                      </div>
                    ) : preview ? (
                      <DataTableEditor
                        columns={preview.columns}
                        initialRows={preview.rows}
                        onSave={handleSaveRows}
                      />
                    ) : null}
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
