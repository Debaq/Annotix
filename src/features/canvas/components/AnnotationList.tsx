import { useTranslation } from 'react-i18next';
import { useAnnotations } from '../hooks/useAnnotations';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { AnnotationItem } from './AnnotationItem';
import { Button } from '@/components/ui/button';
import { ManageClassesDialog } from '../../projects/components/ManageClassesDialog';
import { useUIStore } from '../../core/store/uiStore';
import { CLASS_SHORTCUTS } from '../../core/constants';
import { cn } from '@/lib/utils';

export function AnnotationList() {
  const { t } = useTranslation();
  const { annotations, deleteAnnotation, clearAnnotations, saveAnnotations } = useAnnotations();
  const { project } = useCurrentProject();
  const { activeClassId, setActiveClassId } = useUIStore();

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
        
        <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
          {project.classes.map((cls, index) => (
            <button
              key={cls.id}
              onClick={() => setActiveClassId(cls.id)}
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
              {activeClassId === cls.id && (
                <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          ))}
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
                onDelete={() => deleteAnnotation(annotation.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

