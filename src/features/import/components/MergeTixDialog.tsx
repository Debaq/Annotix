import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
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
import { useProjects } from '@/features/projects/hooks/useProjects';
import { MergeMatrixStep } from './merge/MergeMatrixStep';
import {
  AnalyzeResult,
  AssignmentMap,
  CanonicalClass,
  countByState,
  initFromProject,
  toBackendMappings,
} from './merge/types';

interface Props {
  trigger?: React.ReactNode;
}

export const MergeTixDialog: React.FC<Props> = ({ trigger }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setCurrentProjectId } = useUIStore();
  const { projects } = useProjects();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'select' | 'analyzing' | 'map' | 'merging' | 'success'>('select');
  const [paths, setPaths] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [canonical, setCanonical] = useState<CanonicalClass[]>([]);
  const [assignments, setAssignments] = useState<AssignmentMap>({});
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ current: number; total: number; fileName: string }>({ current: 0, total: 0, fileName: '' });
  const [progress, setProgress] = useState(0);
  const [mergedProjectId, setMergedProjectId] = useState<string | null>(null);

  const existingNames = useMemo(
    () => new Set((projects ?? []).map((p: any) => (p.name ?? '').toLowerCase())),
    [projects],
  );
  const nameExists = projectName.trim() !== '' && existingNames.has(projectName.trim().toLowerCase());

  const counts = useMemo(() => countByState(assignments), [assignments]);

  const reset = () => {
    setOpen(false);
    setStep('select');
    setPaths([]);
    setAnalysis(null);
    setCanonical([]);
    setAssignments({});
    setProjectName('');
    setError(null);
    setProgress(0);
    setMergedProjectId(null);
  };

  const handleSelectFiles = async () => {
    const result = await openDialog({
      multiple: true,
      filters: [{ name: '.tix', extensions: ['tix', 'zip'] }],
    });
    if (!result) return;
    const list = Array.isArray(result) ? result : [result];
    if (list.length < 2) {
      setError(t('merge.needTwo', 'Selecciona al menos dos archivos .tix'));
      return;
    }
    setPaths(list);
    setError(null);
    setStep('analyzing');
    setAnalyzeProgress({ current: 0, total: list.length, fileName: '' });

    const unlistenAnalyze = await listen<{ current: number; total: number; fileName: string }>(
      'merge:analyze-progress',
      (e) => setAnalyzeProgress(e.payload),
    );

    try {
      const res = await invoke<AnalyzeResult>('analyze_tix_projects', { paths: list });
      setAnalysis(res);

      if (!res.sameType) {
        setError(
          t(
            'merge.error.mixedTypes',
            'Los proyectos tienen tipos distintos. Solo se soporta fusión del mismo tipo.',
          ),
        );
        setStep('select');
        setPaths([]);
        return;
      }

      const { canonical: c0, assignments: a0 } = initFromProject(res, 0);
      setCanonical(c0);
      setAssignments(a0);
      setProjectName(`merged_${Date.now().toString(36)}`);
      setStep('map');
    } catch (err) {
      setError(String(err));
      setStep('select');
      setPaths([]);
    } finally {
      unlistenAnalyze();
    }
  };

  const handleMerge = async () => {
    if (!analysis) return;
    if (!projectName.trim()) {
      setError(t('merge.error.noName', 'Ingresa un nombre de proyecto'));
      return;
    }
    if (!/^[a-zA-Z0-9\-_.]+$/.test(projectName)) {
      setError(t('import.error.invalidProjectName'));
      return;
    }
    if (nameExists) {
      setError(t('import.error.duplicateName', 'Ya existe un proyecto con ese nombre.'));
      return;
    }
    if (canonical.length === 0) {
      setError(t('merge.error.noCanonical', 'Debe haber al menos una clase canónica.'));
      return;
    }
    if (counts.pending > 0) {
      setError(
        t(
          'merge.error.pending',
          'Quedan clases sin asignar. Asígnalas a una canónica o descártalas explícitamente.',
        ),
      );
      return;
    }

    const mappings = toBackendMappings(canonical, assignments);
    const canonicalPayload = canonical.map((c) => ({
      name: c.name,
      color: c.color,
      description: c.description ?? null,
    }));

    setStep('merging');
    setProgress(0);
    setError(null);

    const unlisten = await listen<number>('merge:progress', (e) => setProgress(e.payload));

    try {
      const res = await invoke<{
        projectId: string;
        stats: { imagesCount: number; classesCount: number; annotationsCount: number };
      }>('merge_tix_projects', {
        paths,
        canonicalClasses: canonicalPayload,
        mappings,
        projectName,
      });
      setMergedProjectId(res.projectId);
      setStep('success');
      toast({
        title: t('merge.success', 'Fusión completada'),
        description: `${res.stats.imagesCount} imágenes · ${res.stats.classesCount} clases · ${res.stats.annotationsCount} anotaciones`,
      });
    } catch (err) {
      setError(String(err));
      setStep('map');
    } finally {
      unlisten();
    }
  };

  const handleOpenProject = () => {
    if (mergedProjectId) {
      setCurrentProjectId(mergedProjectId);
      navigate(`/projects/${mergedProjectId}`);
      reset();
    }
  };

  const mergeDisabled =
    !projectName.trim() ||
    nameExists ||
    canonical.length === 0 ||
    counts.pending > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : reset())}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="h-9 px-3 rounded bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20">
            <i className="fas fa-code-merge"></i>
            <span className="hidden sm:inline ml-2">{t('merge.button', 'Fusionar .tix')}</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="max-w-[1200px] max-h-[95vh] overflow-y-auto"
        preventClose={step === 'map' || step === 'analyzing' || step === 'merging'}
      >
        {step === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('merge.title', 'Fusionar proyectos .tix')}</DialogTitle>
              <DialogDescription>
                {t(
                  'merge.description',
                  'Selecciona varios archivos .tix para combinarlos en un único proyecto homogeneizando las clases.',
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-600 transition"
                onClick={handleSelectFiles}
              >
                <i className="fas fa-cloud-upload-alt text-3xl text-gray-400 dark:text-gray-500 mb-2 block"></i>
                <p className="text-sm font-medium">
                  {t('merge.selectMultiple', 'Selecciona 2 o más archivos .tix')}
                </p>
              </div>
              {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
                  {error}
                </div>
              )}
              <Button onClick={reset} variant="outline" className="w-full">
                {t('common.cancel')}
              </Button>
            </div>
          </>
        )}

        {step === 'analyzing' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('merge.analyzing', 'Analizando archivos...')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Progress
                value={analyzeProgress.total > 0 ? (analyzeProgress.current / analyzeProgress.total) * 100 : 0}
                className="h-2"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {analyzeProgress.total > 0
                  ? `${analyzeProgress.current}/${analyzeProgress.total}${analyzeProgress.fileName ? ` — ${analyzeProgress.fileName}` : ''}`
                  : ''}
              </p>
            </div>
          </>
        )}

        {step === 'map' && analysis && (
          <>
            <DialogHeader>
              <DialogTitle>{t('merge.mapClasses', 'Homogeneizar clases')}</DialogTitle>
              <DialogDescription>
                {t(
                  'merge.mapHelpMatrix',
                  'Cada chip es una clase origen. Arrástralos mentalmente de pendientes a la celda de la canónica que les corresponde. Nada se pierde sin descarte explícito.',
                )}
              </DialogDescription>
            </DialogHeader>

            <MergeMatrixStep
              analysis={analysis}
              canonical={canonical}
              setCanonical={setCanonical}
              assignments={assignments}
              setAssignments={setAssignments}
            />

            <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-800">
              <Label htmlFor="mergeName">{t('merge.projectName', 'Nombre del proyecto fusionado')}</Label>
              <Input
                id="mergeName"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
              {nameExists && (
                <p className="text-xs text-amber-600">
                  {t('import.duplicateNameWarning', 'Ya existe un proyecto con ese nombre.')}
                </p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
                {error}
              </div>
            )}

            {counts.pending > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 px-4 py-2 rounded text-xs">
                <i className="fas fa-triangle-exclamation mr-1.5"></i>
                {t(
                  'merge.pendingBlockHint',
                  'No puedes fusionar mientras haya clases pendientes. Asígnalas o descártalas desde el menú del chip.',
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={reset} variant="outline" className="flex-1">
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleMerge}
                disabled={mergeDisabled}
                className="flex-1"
                title={
                  counts.pending > 0
                    ? t('merge.pendingBlockHint', 'Quedan clases sin asignar')
                    : undefined
                }
              >
                {t('merge.mergeAction', 'Fusionar')}
              </Button>
            </div>
          </>
        )}

        {step === 'merging' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('merge.merging', 'Fusionando proyectos...')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-gray-500">{Math.round(progress)}%</p>
            </div>
          </>
        )}

        {step === 'success' && mergedProjectId && (
          <>
            <DialogHeader>
              <DialogTitle>{t('merge.success', 'Fusión completada')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-center">
                <i className="fas fa-check-circle text-4xl text-green-600 mb-2 block"></i>
                <p className="font-medium">{projectName}</p>
              </div>
              <Button onClick={handleOpenProject} className="w-full">
                {t('import.openProject', 'Abrir proyecto')}
              </Button>
              <Button onClick={reset} variant="outline" className="w-full">
                {t('common.close')}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
