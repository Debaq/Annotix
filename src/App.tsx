import { useEffect } from 'react';
import { Routes, Route, useParams, useNavigate, Navigate } from 'react-router-dom';
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
import { useTranslation } from 'react-i18next';
import { ManageClassesDialog } from './features/projects/components/ManageClassesDialog';
import { CLASS_SHORTCUTS } from './features/core/constants';
import { cn } from '@/lib/utils';

// Helper functions
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

// --- Route Components ---

const ProjectView = () => {
  const { projectId } = useParams();
  const { setCurrentProjectId, setCurrentImageId, setCurrentTimeSeriesId, activeClassId, setActiveClassId } = useUIStore();
  const { project } = useCurrentProject();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Sync URL -> Store
  useEffect(() => {
    if (projectId) {
      const pid = Number(projectId);
      if (!isNaN(pid)) {
        setCurrentProjectId(pid);
        // Reset selections when at project root
        setCurrentImageId(null);
        setCurrentTimeSeriesId(null);
      }
    }
  }, [projectId, setCurrentProjectId, setCurrentImageId, setCurrentTimeSeriesId]);

  // Initialize active class
  useEffect(() => {
    if (project && project.classes.length > 0) {
      useUIStore.getState().setActiveClassId(project.classes[0].id);
    }
  }, [project]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <i className="fas fa-spinner fa-spin text-4xl text-muted-foreground"></i>
      </div>
    );
  }

  if (isTimeSeriesProject(project.type)) {
    return <TimeSeriesGallery />;
  }

  // LAYOUT LEGACY: 3 columnas (Galería | Canvas | Clases)
  return (
    <div className="annotix-layout">
      {/* LEFT PANEL: Image Gallery */}
      <div className="annotix-panel">
        <ImageGallery />
      </div>

      {/* CENTER: Empty for now (canvas will be shown when image is selected) */}
      <div className="flex items-center justify-center bg-[var(--annotix-light)]">
        <div className="text-center text-[var(--annotix-gray)]">
          <i className="fas fa-images text-6xl mb-4 opacity-20"></i>
          <p className="text-lg font-medium">{t('gallery.selectImage')}</p>
          <p className="text-sm mt-2 opacity-70">{t('gallery.uploadOrSelect')}</p>
        </div>
      </div>

      {/* RIGHT PANEL: Classes */}
      <div className="annotix-panel border-l">
        <div className="annotix-panel-section">
          <div className="flex items-center justify-between mb-3">
            <h3>{t('common.classes')}</h3>
            <ManageClassesDialog
              project={project}
              trigger={
                <button
                  className="h-7 px-2 rounded text-xs bg-[var(--annotix-primary)] text-white hover:bg-[var(--annotix-primary-dark)] transition-colors flex items-center gap-1"
                >
                  <i className="fas fa-cog"></i>
                  {t('classes.manage')}
                </button>
              }
            />
          </div>
          <div className="space-y-2">
            {project.classes.map((cls, index) => (
              <button
                key={cls.id}
                onClick={() => setActiveClassId(cls.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border p-2 transition-all",
                  activeClassId === cls.id
                    ? "border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/10 shadow-sm"
                    : "border-[var(--annotix-border)] bg-white hover:border-[var(--annotix-primary)]/50"
                )}
              >
                {index < CLASS_SHORTCUTS.length ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--annotix-gray-light)] text-[10px] font-mono font-bold">
                    {CLASS_SHORTCUTS[index]}
                  </span>
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--annotix-gray-light)] text-xs font-medium">
                    {index + 1}
                  </span>
                )}
                <div
                  className="h-4 w-4 rounded-full shrink-0 border border-black/20"
                  style={{ backgroundColor: cls.color }}
                ></div>
                <span className="flex-1 text-sm text-left font-medium truncate text-[var(--annotix-dark)]">{cls.name}</span>
                {activeClassId === cls.id && (
                  <div className="h-2 w-2 rounded-full bg-[var(--annotix-primary)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="annotix-panel-section">
          <h3 className="mb-3">{t('common.actions')}</h3>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full annotix-btn annotix-btn-outline"
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
      </div>
    </div>
  );
};

const ImageView = () => {
  const { projectId, imageId } = useParams();
  const { setCurrentProjectId, setCurrentImageId, activeClassId, setActiveClassId } = useUIStore();
  const { project } = useCurrentProject();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (projectId) setCurrentProjectId(Number(projectId));
    if (imageId) setCurrentImageId(Number(imageId));
  }, [projectId, imageId, setCurrentProjectId, setCurrentImageId]);

  if (!project) return null;

  if (isClassificationProject(project.type)) {
    return (
      <div className="flex h-full">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl">
            <ClassificationPanel />
          </div>
        </div>
      </div>
    );
  }

  // LAYOUT LEGACY para Canvas: 3 columnas (Galería | Canvas | Clases)
  return (
    <div className="annotix-layout">
      {/* LEFT PANEL: Image Gallery */}
      <div className="annotix-panel">
        <ImageGallery />
      </div>

      {/* CENTER: Canvas */}
      <AnnotationCanvas />

      {/* RIGHT PANEL: Classes */}
      <div className="annotix-panel border-l">
        <div className="annotix-panel-section">
          <div className="flex items-center justify-between mb-3">
            <h3>{t('common.classes')}</h3>
            <ManageClassesDialog
              project={project}
              trigger={
                <button
                  className="h-7 px-2 rounded text-xs bg-[var(--annotix-primary)] text-white hover:bg-[var(--annotix-primary-dark)] transition-colors flex items-center gap-1"
                >
                  <i className="fas fa-cog"></i>
                  {t('classes.manage')}
                </button>
              }
            />
          </div>
          <div className="space-y-2">
            {project.classes.map((cls, index) => (
              <button
                key={cls.id}
                onClick={() => setActiveClassId(cls.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border p-2 transition-all",
                  activeClassId === cls.id
                    ? "border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/10 shadow-sm"
                    : "border-[var(--annotix-border)] bg-white hover:border-[var(--annotix-primary)]/50"
                )}
              >
                {index < CLASS_SHORTCUTS.length ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--annotix-gray-light)] text-[10px] font-mono font-bold">
                    {CLASS_SHORTCUTS[index]}
                  </span>
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-[var(--annotix-gray-light)] text-xs font-medium">
                    {index + 1}
                  </span>
                )}
                <div
                  className="h-4 w-4 rounded-full shrink-0 border border-black/20"
                  style={{ backgroundColor: cls.color }}
                ></div>
                <span className="flex-1 text-sm text-left font-medium truncate text-[var(--annotix-dark)]">{cls.name}</span>
                {activeClassId === cls.id && (
                  <div className="h-2 w-2 rounded-full bg-[var(--annotix-primary)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="annotix-panel-section">
          <h3 className="mb-3">{t('common.actions')}</h3>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full annotix-btn annotix-btn-outline"
              onClick={() => {
                navigate(`/projects/${projectId}`);
              }}
            >
              <i className="fas fa-arrow-left mr-2"></i>
              {t('gallery.backToGallery')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const TimeSeriesView = () => {
  const { projectId, seriesId } = useParams();
  const { setCurrentProjectId, setCurrentTimeSeriesId } = useUIStore();
  
  useEffect(() => {
    if (projectId) setCurrentProjectId(Number(projectId));
    if (seriesId) setCurrentTimeSeriesId(Number(seriesId));
  }, [projectId, seriesId, setCurrentProjectId, setCurrentTimeSeriesId]);

  return <TimeSeriesCanvas />;
};

// --- Main App Component ---

function App() {
  const { addAnnotation } = useAnnotations();
  
  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

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

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:projectId" element={<ProjectView />} />
        <Route path="/projects/:projectId/images/:imageId" element={<ImageView />} />
        <Route path="/projects/:projectId/timeseries/:seriesId" element={<TimeSeriesView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </AppLayout>
  );
}

export default App;
