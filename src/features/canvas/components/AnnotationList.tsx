import { useTranslation } from 'react-i18next';
import { useAnnotations } from '../hooks/useAnnotations';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { AnnotationItem } from './AnnotationItem';
import { Button } from '@/components/ui/button';

export function AnnotationList() {
  const { t } = useTranslation();
  const { annotations, deleteAnnotation, clearAnnotations, saveAnnotations } = useAnnotations();
  const { project } = useCurrentProject();

  if (!project) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{t('annotations.title')}</h3>
          <span className="text-sm text-muted-foreground">
            {annotations.length} {t('annotations.count')}
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
