import { useEffect } from 'react';
import { AppLayout } from './features/core/components/AppLayout';
import { ProjectList } from './features/projects/components/ProjectList';
import { ImageGallery } from './features/gallery/components/ImageGallery';
import { AnnotationCanvas } from './features/canvas/components/AnnotationCanvas';
import { ClassificationPanel } from './features/classification/components/ClassificationPanel';
import { TimeSeriesGallery } from './features/timeseries/components/TimeSeriesGallery';
import { TimeSeriesCanvas } from './features/timeseries/components/TimeSeriesCanvas';
import { useUIStore } from './features/core/store/uiStore';
import { useKeyboardShortcuts } from './features/core/hooks/useKeyboardShortcuts';
import { useCurrentProject } from './features/projects/hooks/useCurrentProject';
import { useAnnotations } from './features/canvas/hooks/useAnnotations';
import { ExportDialog } from './features/export/components/ExportDialog';
import { Button } from './components/ui/button';
import { ProjectType } from './lib/db';
import { Toaster } from '@/components/ui/toaster';
import { useTranslationWithLogging } from './hooks/useTranslationWithLogging';

// Helper function to determine project category
function isTimeSeriesProject(type: ProjectType): boolean {
  return [
    'timeseries-classification',
    'timeseries-forecasting',
    'anomaly-detection',
    'timeseries-segmentation',
    'pattern-recognition',
    'event-detection',
    'timeseries-regression',
    'clustering',
    'imputation',
  ].includes(type);
}

function isClassificationProject(type: ProjectType): boolean {
  return type === 'classification' || type === 'multi-label-classification';
}

function App() {
  const { currentProjectId, currentImageId, currentTimeSeriesId, setCurrentProjectId, setActiveClassId } =
    useUIStore();
  const { project } = useCurrentProject();
  const { addAnnotation } = useAnnotations();
  const { t } = useTranslationWithLogging();

  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  // Initialize active class when project loads
  useEffect(() => {
    if (project && project.classes.length > 0) {
      setActiveClassId(project.classes[0].id);
    }
  }, [project, setActiveClassId]);

  // Handle annotation creation events from tools
  useEffect(() => {
    const handleAnnotationCreated = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { type, data } = customEvent.detail;

      // Get active class ID
      const activeClassId = useUIStore.getState().activeClassId;
      if (activeClassId === null) return;

      // Create annotation with UUID
      const annotation = {
        id: crypto.randomUUID(),
        type,
        classId: activeClassId,
        data,
      };

      addAnnotation(annotation);
    };

    window.addEventListener('annotix:annotation-created', handleAnnotationCreated);
    return () => window.removeEventListener('annotix:annotation-created', handleAnnotationCreated);
  }, [addAnnotation]);

  // Render based on state
  if (!currentProjectId) {
    return (
      <AppLayout>
        <ProjectList />
      </AppLayout>
    );
  }

  // Determine what to render based on project type
  const isTimeSeries = project && isTimeSeriesProject(project.type);
  const isClassification = project && isClassificationProject(project.type);

  return (
    <AppLayout>
      {/* Time Series Projects */}
      {isTimeSeries && !currentTimeSeriesId ? (
        <TimeSeriesGallery />
      ) : isTimeSeries && currentTimeSeriesId ? (
        <TimeSeriesCanvas />
      ) : (
        /* Image-based Projects */
        !currentImageId ? (
          <div className="flex h-full">
            <div className="flex-1 overflow-auto">
              <ImageGallery />
            </div>
            <div className="w-80 border-l bg-card p-6">
              <div className="space-y-4">
                <div>
                  <h3 className="mb-3 font-semibold">{t('common.actions')}</h3>
                  <div className="space-y-2">
                    <ExportDialog
                      trigger={
                        <Button className="w-full">
                          <i className="fas fa-download mr-2"></i>
                          {t('common.exportDataset')}
                        </Button>
                      }
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setCurrentProjectId(null)}
                    >
                      <i className="fas fa-arrow-left mr-2"></i>
                      {t('common.backToProjects')}
                    </Button>
                  </div>
                </div>

                {project && (
                  <div>
                    <h3 className="mb-3 font-semibold">{t('common.classes')}</h3>
                    <div className="space-y-2">
                      {project.classes.map((cls, index) => (
                        <div
                          key={cls.id}
                          className="flex items-center gap-2 rounded-lg border bg-background p-2"
                        >
                          <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-medium">
                            {index + 1}
                          </span>
                          <div
                            className="h-4 w-4 rounded"
                            style={{ backgroundColor: cls.color }}
                          ></div>
                          <span className="flex-1 text-sm">{cls.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {isClassification ? (
              <div className="flex h-full">
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="w-full max-w-2xl">
                    <ClassificationPanel />
                  </div>
                </div>
              </div>
            ) : (
              <AnnotationCanvas />
            )}
          </>
        )
      )}
      <Toaster />
    </AppLayout>
  );
}

export default App;