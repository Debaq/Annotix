import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAnnotations } from '../hooks/useAnnotations';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { AnnotationItem } from './AnnotationItem';
import { Button } from '@/components/ui/button';
import { ManageClassesDialog } from '../../projects/components/ManageClassesDialog';
import { useUIStore } from '../../core/store/uiStore';
import { CLASS_SHORTCUTS } from '../../core/constants';
import { useClassCounts } from '../../projects/hooks/useClassCounts';
import { cn } from '@/lib/utils';

export function AnnotationList() {
  const { t } = useTranslation();
  const { annotations, deleteAnnotation, clearAnnotations, saveAnnotations, hiddenAnnotationIds, toggleAnnotationVisibility, selectedAnnotationIds, updateAnnotation } = useAnnotations();
  const { project } = useCurrentProject();
  const { activeClassId, setActiveClassId, currentProjectId, projectFilters, setProjectFilter } = useUIStore();
  const { byClass: globalByClass } = useClassCounts();
  const pf = currentProjectId ? projectFilters[currentProjectId] : undefined;
  const classSearch = pf?.classListSearch ?? '';
  const onlyUsed = pf?.classListOnlyUsed ?? false;
  const onlyInImage = pf?.classListOnlyInImage ?? false;
  const setPF = (patch: Parameters<typeof setProjectFilter>[1]) => {
    if (currentProjectId) setProjectFilter(currentProjectId, patch);
  };

  const localByClass = annotations.reduce<Record<number, number>>((acc, a) => {
    if (a.classId != null) acc[a.classId] = (acc[a.classId] ?? 0) + 1;
    return acc;
  }, {});

  useEffect(() => {
    if (selectedAnnotationIds.size === 0) return;
    const selected = annotations.filter((a) => selectedAnnotationIds.has(a.id));
    if (selected.length === 0) return;
    const firstClassId = selected[0].classId;
    if (firstClassId === undefined || firstClassId === null) return;
    const allSame = selected.every((a) => a.classId === firstClassId);
    if (allSame && firstClassId !== activeClassId) {
      setActiveClassId(firstClassId);
    }
  }, [selectedAnnotationIds, annotations, activeClassId, setActiveClassId]);

  if (!project) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Classes Management Section */}
      <div className="border-b bg-muted/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('classes.active')}</h3>
          <ManageClassesDialog 
            project={project} 
            trigger={
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <i className="fas fa-plus"></i>
              </Button>
            }
          />
        </div>
        
        <div className="mb-2 space-y-1">
          <input
            type="text"
            value={classSearch}
            onChange={(e) => setPF({ classListSearch: e.target.value || undefined })}
            placeholder={t('filters.search', 'Buscar clase...')}
            className="w-full rounded border bg-background px-2 py-1 text-xs"
          />
          <div className="flex gap-1 flex-wrap" style={{ fontSize: '0.65rem' }}>
            <button
              onClick={() => setPF({ classListOnlyUsed: !onlyUsed || undefined })}
              className={cn(
                'rounded border px-1.5 py-0.5',
                onlyUsed ? 'bg-primary text-primary-foreground border-primary' : 'border-border'
              )}
              title={t('filters.onlyUsedHint', 'Clases con anotaciones globales > 0')}
            >
              <i className="fas fa-check mr-1"></i>{t('filters.onlyUsed', 'usadas')}
            </button>
            <button
              onClick={() => setPF({ classListOnlyInImage: !onlyInImage || undefined })}
              className={cn(
                'rounded border px-1.5 py-0.5',
                onlyInImage ? 'bg-primary text-primary-foreground border-primary' : 'border-border'
              )}
              title={t('filters.onlyInImageHint', 'Clases presentes en imagen actual')}
            >
              <i className="fas fa-image mr-1"></i>{t('filters.onlyInImage', 'en imagen')}
            </button>
          </div>
        </div>

        <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
          {project.classes
            .filter((cls) => {
              if (classSearch && !cls.name.toLowerCase().includes(classSearch.toLowerCase())) return false;
              if (onlyUsed && (globalByClass[cls.id] ?? 0) === 0) return false;
              if (onlyInImage && (localByClass[cls.id] ?? 0) === 0) return false;
              return true;
            })
            .map((cls) => {
              const index = project.classes.findIndex((c) => c.id === cls.id);
              return (
            <button
              key={cls.id}
              onClick={() => {
                if (selectedAnnotationIds.size > 0) {
                  for (const id of selectedAnnotationIds) {
                    const ann = annotations.find((a) => a.id === id);
                    if (ann && ann.classId !== cls.id) {
                      updateAnnotation(id, { classId: cls.id });
                    }
                  }
                }
                setActiveClassId(cls.id);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-muted",
                activeClassId === cls.id ? "bg-accent text-accent-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground"
              )}
            >
              {index < CLASS_SHORTCUTS.length && (
                <span className="font-mono text-[10px] opacity-70">
                  [{CLASS_SHORTCUTS[index]}]
                </span>
              )}
              <div 
                className="h-3 w-3 rounded-full shrink-0" 
                style={{ backgroundColor: cls.color }}
              />
              <span className="truncate flex-1 text-left font-medium">{cls.name}</span>
              <span className="font-mono text-[10px] tabular-nums opacity-70 shrink-0">
                {localByClass[cls.id] ?? 0}/{globalByClass[cls.id] ?? 0}
              </span>
              {activeClassId === cls.id && (
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </button>
              );
            })}
        </div>
      </div>

      {/* Annotations Control Section */}
      <div className="border-b p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{t('annotations.title')}</h3>
          <span className="text-sm text-muted-foreground">
            {annotations.length}
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={saveAnnotations}
            className="flex-1"
          >
            <i className="fas fa-save mr-2"></i>
            {t('common.save')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearAnnotations}
            disabled={annotations.length === 0}
            className="flex-1"
          >
            <i className="fas fa-trash mr-2"></i>
            {t('common.clear')}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {annotations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <i className="fas fa-tag text-4xl text-muted-foreground"></i>
            <p className="mt-4 text-sm text-muted-foreground">
              {t('annotations.empty')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {annotations.map((annotation) => (
              <AnnotationItem
                key={annotation.id}
                annotation={annotation}
                project={project}
                isHidden={hiddenAnnotationIds.has(annotation.id)}
                onToggleVisibility={() => toggleAnnotationVisibility(annotation.id)}
                onDelete={() => deleteAnnotation(annotation.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

