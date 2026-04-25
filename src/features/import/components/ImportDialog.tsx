import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTauriPathDrop } from '@/hooks/useTauriPathDrop';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/hooks/use-toast';
import { useUIStore } from '@/features/core/store/uiStore';
import { pickZipFile } from '@/lib/nativeDialogs';
import { useProjects } from '@/features/projects/hooks/useProjects';

interface DetectionResult {
  format: string;
  projectType: string;
  confidence: number;
  classCount?: number;
}

interface ImportResult {
  projectId: string;
  stats: {
    imagesCount: number;
    classesCount: number;
    annotationsCount: number;
  };
}

interface ImportDialogProps {
  trigger?: React.ReactNode;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ trigger }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setCurrentProjectId } = useUIStore();
  const { projects } = useProjects();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'select' | 'analyze' | 'configure' | 'importing' | 'success'>('select');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [projectName, setProjectName] = useState('');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [importPhase, setImportPhase] = useState<string>('');
  const [importPhaseDetail, setImportPhaseDetail] = useState<string>('');
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);

  const existingNames = React.useMemo(
    () => new Set((projects ?? []).map((p: any) => (p.name ?? '').toLowerCase())),
    [projects]
  );

  const suggestUniqueName = (base: string): string => {
    if (!existingNames.has(base.toLowerCase())) return base;
    for (let i = 2; i < 1000; i++) {
      const candidate = `${base}_${i}`;
      if (!existingNames.has(candidate.toLowerCase())) return candidate;
    }
    return `${base}_${Date.now()}`;
  };

  const nameExists = projectName.trim() !== '' && existingNames.has(projectName.trim().toLowerCase());

  const getProjectTypeLabel = (type: string): string => {
    const typeMap: Record<string, string> = {
      bbox: t('common.boundingBox') || 'Bounding Box',
      polygon: t('common.polygon') || 'Polygon',
      classification: t('common.classification') || 'Classification',
      keypoints: t('common.keypoints') || 'Keypoints',
      landmarks: t('common.landmarks') || 'Landmarks',
      mask: t('common.segmentation') || 'Segmentation',
      'instance-segmentation': t('common.instanceSegmentation') || 'Instance Segmentation',
      obb: t('common.obb') || 'Oriented Box',
    };
    return typeMap[type] || type;
  };

  const handleSelectFile = useCallback(async (prefilledPath?: string) => {
    const filePath = prefilledPath ?? (await pickZipFile());
    if (!filePath) return;

    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;

    if (!fileName.endsWith('.zip') && !fileName.endsWith('.tix')) {
      setError(t('import.error.invalidZip'));
      return;
    }

    setSelectedFilePath(filePath);
    setError(null);
    setStep('analyze');

    try {
      setProgress(30);
      const result = await invoke<DetectionResult>('detect_import_format', { filePath });
      setDetection(result);
      setProgress(100);

      const baseName = fileName.replace(/\.zip$|\.tix$/i, '');
      setProjectName(suggestUniqueName(baseName));

      setStep('configure');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : typeof err === 'string' ? err : t('import.error.unsupportedFormat')
      );
      setStep('select');
    }
  }, [t, existingNames]);

  const { isDragging: isDraggingImport } = useTauriPathDrop({
    active: open && step === 'select',
    extensions: ['zip', 'tix'],
    onDrop: (paths) => handleSelectFile(paths[0]),
  });

  const handleImport = async () => {
    if (!selectedFilePath || !projectName.trim() || !detection) {
      setError(t('import.error.noFile'));
      return;
    }

    if (!/^[a-zA-Z0-9\-_.]+$/.test(projectName)) {
      setError(t('import.error.invalidProjectName'));
      return;
    }

    if (existingNames.has(projectName.trim().toLowerCase())) {
      setError(t('import.error.duplicateName', 'Ya existe un proyecto con ese nombre. Cambialo antes de importar.'));
      return;
    }

    setStep('importing');
    setProgress(0);
    setImportPhase('');
    setImportPhaseDetail('');
    setError(null);

    const unlisten = await listen<number | { phase?: string; percentage?: number; current?: number; total?: number }>(
      'import:progress',
      (event) => {
        const p = event.payload;
        if (typeof p === 'number') {
          setProgress(p);
          return;
        }
        if (p && typeof p === 'object') {
          if (typeof p.percentage === 'number') setProgress(p.percentage);
          if (typeof p.phase === 'string') setImportPhase(p.phase);
          if (typeof p.current === 'number' && typeof p.total === 'number' && p.total > 0) {
            setImportPhaseDetail(`${p.current}/${p.total}`);
          } else {
            setImportPhaseDetail('');
          }
        }
      }
    );

    try {
      const result = await invoke<ImportResult>('import_dataset', {
        filePath: selectedFilePath,
        projectName,
      });

      setImportedProjectId(result.projectId);
      setStep('success');

      toast({
        title: t('import.success'),
        description: `${result.stats.imagesCount} images, ${result.stats.classesCount} classes`,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : typeof err === 'string' ? err : t('import.error.corruptedData')
      );
      setStep('configure');
    } finally {
      unlisten();
    }
  };

  const handleOpenProject = () => {
    if (importedProjectId) {
      setCurrentProjectId(importedProjectId);
      navigate(`/projects/${importedProjectId}`);
      setOpen(false);
      handleReset();
    }
  };

  const handleReset = () => {
    setOpen(false);
    setStep('select');
    setSelectedFilePath('');
    setProjectName('');
    setDetection(null);
    setError(null);
    setProgress(0);
    setImportedProjectId(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            className="h-9 px-3 rounded bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20"
            title={t('import.button')}
          >
            <i className="fas fa-upload"></i>
            <span className="hidden sm:inline ml-2">{t('import.button')}</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        {/* SELECT FILE STEP */}
        {step === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('import.title')}</DialogTitle>
              <DialogDescription>{t('import.selectFile')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
                  isDraggingImport
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                }`}
                onClick={() => handleSelectFile()}
              >
                <i className="fas fa-cloud-upload-alt text-3xl text-gray-400 dark:text-gray-500 mb-2 block"></i>
                <p className="text-sm font-medium">{t('import.dragFiles')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('import.orClickToSelect')}</p>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <Button onClick={handleReset} variant="outline" className="w-full">
                {t('common.cancel')}
              </Button>
            </div>
          </>
        )}

        {/* ANALYZE STEP */}
        {step === 'analyze' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('import.analyzing')}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {t('import.analyzing')}...
                </p>
                <Progress value={progress} className="h-2" />
              </div>

              <Button disabled variant="outline" className="w-full">
                {t('common.cancel')}
              </Button>
            </div>
          </>
        )}

        {/* CONFIGURE STEP */}
        {step === 'configure' && detection && (
          <>
            <DialogHeader>
              <DialogTitle>{t('import.title')}</DialogTitle>
              <DialogDescription>{t('import.configureProject')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label htmlFor="projectName">{t('import.projectName')}</Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="My Dataset"
                  className="mt-1"
                />
                {nameExists && (
                  <div className="mt-2 flex items-start gap-2 p-2 rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs">
                    <i className="fas fa-exclamation-triangle mt-0.5"></i>
                    <div className="flex-1">
                      <p>{t('import.duplicateNameWarning', 'Ya existe un proyecto con ese nombre.')}</p>
                      <button
                        type="button"
                        className="mt-1 underline font-medium"
                        onClick={() => setProjectName(suggestUniqueName(projectName))}
                      >
                        {t('import.useSuggestedName', 'Usar')} "{suggestUniqueName(projectName)}"
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label>{t('import.projectType')}</Label>
                <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-900/50 rounded border border-gray-200 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-cube text-blue-600 dark:text-blue-400"></i>
                    <span className="font-medium">
                      {getProjectTypeLabel(detection.projectType)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {t('import.format')}: {detection.format}
                  </p>
                </div>
              </div>

              {detection.classCount && (
                <div>
                  <Label>{t('import.classesCount')}</Label>
                  <div className="mt-1 p-3 bg-blue-50 dark:bg-blue-950/30 rounded border border-blue-200 dark:border-blue-900/50">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-300">
                      {detection.classCount} {t('import.classes')}
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleReset}
                  variant="outline"
                  className="flex-1"
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleImport}
                  className="flex-1"
                  disabled={!projectName.trim() || nameExists}
                >
                  {t('import.import')}
                </Button>
              </div>
            </div>
          </>
        )}

        {/* IMPORTING STEP */}
        {step === 'importing' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('import.importing')}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  {(() => {
                    const phaseLabels: Record<string, string> = {
                      detecting: t('import.phase.detecting', 'Detectando formato'),
                      parsing: t('import.phase.parsing', 'Leyendo archivos'),
                      saving: t('import.phase.saving', 'Guardando imágenes'),
                      done: t('import.phase.done', 'Finalizando'),
                    };
                    const label = importPhase ? phaseLabels[importPhase] ?? t('import.processing', 'Procesando') : t('import.processing', 'Procesando');
                    return importPhaseDetail ? `${label} (${importPhaseDetail})` : `${label}...`;
                  })()}
                </p>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{Math.round(progress)}%</p>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <Button disabled variant="outline" className="w-full">
                {t('common.cancel')}
              </Button>
            </div>
          </>
        )}

        {/* SUCCESS STEP */}
        {step === 'success' && importedProjectId && (
          <>
            <DialogHeader>
              <DialogTitle>{t('import.success')}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="text-center">
                <i className="fas fa-check-circle text-4xl text-green-600 mb-2 block"></i>
                <p className="font-medium">{projectName}</p>
                <p className="text-sm text-gray-600 mt-2">
                  {t('import.successMessage')}
                </p>
              </div>

              <Button
                onClick={handleOpenProject}
                className="w-full"
              >
                {t('import.openProject')}
              </Button>

              <Button
                onClick={handleReset}
                variant="outline"
                className="w-full"
              >
                {t('common.close')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
