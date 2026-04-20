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

interface AnalyzeClass {
  id: number;
  name: string;
  color: string;
  description?: string | null;
}
interface AnalyzeProject {
  path: string;
  name: string;
  projectType: string;
  classes: AnalyzeClass[];
  imageCount: number;
}
interface AnalyzeResult {
  projects: AnalyzeProject[];
  sameType: boolean;
  projectType: string;
  warnings: string[];
}

interface CanonicalClass {
  name: string;
  color: string;
  description?: string | null;
}

// Mapping: (projectIndex, sourceClassId) → canonicalIndex (-1 = descartar)
type MappingKey = string; // `${pi}:${cid}`

const DEFAULT_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#82E0AA',
];

const normalize = (s: string) => s.trim().toLowerCase();

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
  const [mapping, setMapping] = useState<Record<MappingKey, number>>({});
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [mergedProjectId, setMergedProjectId] = useState<string | null>(null);

  const existingNames = useMemo(
    () => new Set((projects ?? []).map((p: any) => (p.name ?? '').toLowerCase())),
    [projects]
  );
  const nameExists = projectName.trim() !== '' && existingNames.has(projectName.trim().toLowerCase());

  const reset = () => {
    setOpen(false);
    setStep('select');
    setPaths([]);
    setAnalysis(null);
    setCanonical([]);
    setMapping({});
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

    try {
      const res = await invoke<AnalyzeResult>('analyze_tix_projects', { paths: list });
      setAnalysis(res);

      if (!res.sameType) {
        setError(
          t('merge.error.mixedTypes',
            'Los proyectos tienen tipos distintos. Solo se soporta fusión del mismo tipo.'
          )
        );
        setStep('select');
        setPaths([]);
        return;
      }

      // Auto-construir clases canónicas por nombre
      const canon: CanonicalClass[] = [];
      const nameToIdx = new Map<string, number>();
      const map: Record<MappingKey, number> = {};

      res.projects.forEach((proj, pi) => {
        proj.classes.forEach((cls) => {
          const key = `${pi}:${cls.id}`;
          const norm = normalize(cls.name);
          let idx = nameToIdx.get(norm);
          if (idx === undefined) {
            idx = canon.length;
            canon.push({
              name: cls.name,
              color: cls.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
              description: cls.description || null,
            });
            nameToIdx.set(norm, idx);
          }
          map[key] = idx;
        });
      });

      setCanonical(canon);
      setMapping(map);
      setProjectName(`merged_${Date.now().toString(36)}`);
      setStep('map');
    } catch (err) {
      setError(String(err));
      setStep('select');
      setPaths([]);
    }
  };

  const updateCanonicalName = (idx: number, name: string) => {
    setCanonical((arr) => arr.map((c, i) => (i === idx ? { ...c, name } : c)));
  };
  const updateCanonicalColor = (idx: number, color: string) => {
    setCanonical((arr) => arr.map((c, i) => (i === idx ? { ...c, color } : c)));
  };
  const addCanonicalClass = () => {
    setCanonical((arr) => [
      ...arr,
      {
        name: `class_${arr.length}`,
        color: DEFAULT_COLORS[arr.length % DEFAULT_COLORS.length],
      },
    ]);
  };
  const removeCanonicalClass = (idx: number) => {
    if (canonical.length <= 1) return;
    const newCanon = canonical.filter((_, i) => i !== idx);
    setCanonical(newCanon);
    // Re-mapear: entradas con target==idx → -1; target>idx → target-1
    const newMap: Record<MappingKey, number> = {};
    for (const [k, v] of Object.entries(mapping)) {
      if (v === idx) newMap[k] = -1;
      else if (v > idx) newMap[k] = v - 1;
      else newMap[k] = v;
    }
    setMapping(newMap);
  };
  const moveCanonical = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= canonical.length) return;
    const newCanon = [...canonical];
    [newCanon[idx], newCanon[newIdx]] = [newCanon[newIdx], newCanon[idx]];
    setCanonical(newCanon);
    const swapMap = (v: number) => (v === idx ? newIdx : v === newIdx ? idx : v);
    const newMap: Record<MappingKey, number> = {};
    for (const [k, v] of Object.entries(mapping)) newMap[k] = swapMap(v);
    setMapping(newMap);
  };

  const setSourceMapping = (pi: number, cid: number, canonIdx: number) => {
    setMapping((m) => ({ ...m, [`${pi}:${cid}`]: canonIdx }));
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

    const mappings = Object.entries(mapping).map(([k, v]) => {
      const [pi, cid] = k.split(':').map(Number);
      return {
        projectIndex: pi,
        sourceClassId: cid,
        targetCanonicalIndex: v,
      };
    });

    setStep('merging');
    setProgress(0);
    setError(null);

    const unlisten = await listen<number>('merge:progress', (e) => setProgress(e.payload));

    try {
      const res = await invoke<{ projectId: string; stats: { imagesCount: number; classesCount: number; annotationsCount: number } }>(
        'merge_tix_projects',
        {
          paths,
          canonicalClasses: canonical,
          mappings,
          projectName,
        }
      );
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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {step === 'select' && (
          <>
            <DialogHeader>
              <DialogTitle>{t('merge.title', 'Fusionar proyectos .tix')}</DialogTitle>
              <DialogDescription>
                {t('merge.description',
                  'Selecciona varios archivos .tix para combinarlos en un único proyecto homogeneizando las clases.'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-600 transition"
                onClick={handleSelectFiles}
              >
                <i className="fas fa-cloud-upload-alt text-3xl text-gray-400 dark:text-gray-500 mb-2 block"></i>
                <p className="text-sm font-medium">{t('merge.selectMultiple', 'Selecciona 2 o más archivos .tix')}</p>
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
            <Progress value={50} className="h-2" />
          </>
        )}

        {step === 'map' && analysis && (
          <>
            <DialogHeader>
              <DialogTitle>{t('merge.mapClasses', 'Homogeneizar clases')}</DialogTitle>
              <DialogDescription>
                {t('merge.mapHelp',
                  'Edita, reordena o elimina las clases canónicas. Luego asigna cada clase original a una canónica o descártala.'
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Clases canónicas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>{t('merge.canonicalClasses', 'Clases canónicas (orden = índice)')}</Label>
                  <Button size="sm" variant="outline" onClick={addCanonicalClass}>
                    <i className="fas fa-plus mr-1"></i>{t('common.add', 'Añadir')}
                  </Button>
                </div>
                <div className="space-y-1 border border-gray-200 dark:border-gray-800 rounded p-2 max-h-56 overflow-y-auto">
                  {canonical.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-mono w-6 text-gray-500">{idx}</span>
                      <input
                        type="color"
                        value={c.color}
                        onChange={(e) => updateCanonicalColor(idx, e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-gray-300"
                      />
                      <Input
                        value={c.name}
                        onChange={(e) => updateCanonicalName(idx, e.target.value)}
                        className="flex-1 h-8"
                      />
                      <Button size="sm" variant="ghost" onClick={() => moveCanonical(idx, -1)} disabled={idx === 0}>
                        <i className="fas fa-arrow-up"></i>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => moveCanonical(idx, 1)} disabled={idx === canonical.length - 1}>
                        <i className="fas fa-arrow-down"></i>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => removeCanonicalClass(idx)} disabled={canonical.length <= 1}>
                        <i className="fas fa-trash text-red-500"></i>
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mapeos por proyecto */}
              <div>
                <Label>{t('merge.sourceMapping', 'Mapeo por proyecto origen')}</Label>
                <div className="space-y-3 mt-2">
                  {analysis.projects.map((proj, pi) => (
                    <div key={pi} className="border border-gray-200 dark:border-gray-800 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{proj.name}</p>
                          <p className="text-xs text-gray-500">
                            {proj.projectType} · {proj.imageCount} {t('common.images', 'imágenes')} · {proj.classes.length} {t('common.classes', 'clases')}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {proj.classes.map((cls) => {
                          const key = `${pi}:${cls.id}`;
                          const val = mapping[key] ?? -1;
                          return (
                            <div key={cls.id} className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-sm"
                                style={{ background: cls.color }}
                              />
                              <span className="text-xs font-mono w-8 text-gray-500">#{cls.id}</span>
                              <span className="text-sm flex-1 truncate">{cls.name}</span>
                              <i className="fas fa-arrow-right text-xs text-gray-400"></i>
                              <select
                                value={val}
                                onChange={(e) => setSourceMapping(pi, cls.id, Number(e.target.value))}
                                className="text-xs border border-gray-300 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-900 min-w-[180px]"
                              >
                                <option value={-1}>{t('merge.discard', '— Descartar —')}</option>
                                {canonical.map((c, idx) => (
                                  <option key={idx} value={idx}>
                                    {idx}: {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Nombre + acción */}
              <div>
                <Label htmlFor="mergeName">{t('merge.projectName', 'Nombre del proyecto fusionado')}</Label>
                <Input
                  id="mergeName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="mt-1"
                />
                {nameExists && (
                  <p className="text-xs text-amber-600 mt-1">
                    {t('import.duplicateNameWarning', 'Ya existe un proyecto con ese nombre.')}
                  </p>
                )}
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 px-4 py-3 rounded text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={reset} variant="outline" className="flex-1">
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleMerge}
                  disabled={!projectName.trim() || nameExists || canonical.length === 0}
                  className="flex-1"
                >
                  {t('merge.mergeAction', 'Fusionar')}
                </Button>
              </div>
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
