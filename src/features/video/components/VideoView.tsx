import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useCurrentVideo } from '../hooks/useCurrentVideo';
import { useVideoNavigation } from '../hooks/useVideoNavigation';
import { useVideoTracks } from '../hooks/useVideoTracks';
import { useInterpolation } from '../hooks/useInterpolation';
import { countCoveredFrames } from '../utils/interpolation';
import { VideoTimeline } from './VideoTimeline';
import { VideoAnnotationCanvas } from './VideoAnnotationCanvas';
import { VideoTrackPanel } from './VideoTrackPanel';
import { AnnotationPanelActions } from '../../core/components/AnnotationPanelActions';
import { AnnotationCanvas } from '../../canvas/components/AnnotationCanvas';
import { Button } from '@/components/ui/button';
import { ManageClassesDialog } from '../../projects/components/ManageClassesDialog';
import { useClassCounts } from '../../projects/hooks/useClassCounts';
import { cn } from '@/lib/utils';
import { CLASS_SHORTCUTS } from '../../core/constants';
import { matchesShortcut } from '../../core/utils/matchShortcut';

export function VideoView() {
  const { projectId, videoId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const {
    setCurrentProjectId,
    setCurrentVideoId,
    activeClassId,
    setActiveClassId,
  } = useUIStore();
  const { project } = useCurrentProject();
  const { video } = useCurrentVideo();
  const { currentFrameIndex, totalFrames, positionByFrameIndex, goPrev, goNext } = useVideoNavigation();
  const { tracks, createTrack, deleteTrack, updateTrack, bake } = useVideoTracks();
  const { byClass: globalByClass } = useClassCounts();

  const localByClass = useMemo(() => {
    const acc: Record<number, number> = {};
    for (const tr of tracks) {
      if (tr.classId != null) acc[tr.classId] = (acc[tr.classId] ?? 0) + 1;
    }
    return acc;
  }, [tracks]);

  const isBboxProject = project?.type === 'bbox';

  const { interpolatedBBoxes } = useInterpolation(isBboxProject ? tracks : [], currentFrameIndex);

  // Fotogramas que la consolidación va a tocar, evaluando la interpolación real
  // de cada track. Antes miraba solo el primer y último keyframe: con un track
  // que prolonga su última caja, o con una salida de escena en medio, ese rango
  // ya no dice qué fotogramas quedan cubiertos y el número del botón mentía.
  const bakeableCount = useMemo(
    () => (totalFrames === 0 ? 0 : countCoveredFrames(tracks, positionByFrameIndex.keys())),
    [tracks, totalFrames, positionByFrameIndex],
  );

  // Track seleccionado: lo comparten el panel y las pistas de la línea de tiempo.
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [isBaking, setIsBaking] = useState(false);
  const [bakeResult, setBakeResult] = useState<number | null>(null);
  const [bakeError, setBakeError] = useState<string | null>(null);

  const handleBake = useCallback(async () => {
    setIsBaking(true);
    setBakeResult(null);
    setBakeError(null);
    try {
      const count = await bake();
      setBakeResult(count);
      setTimeout(() => setBakeResult(null), 3000);
    } catch (error) {
      console.error('Error consolidando tracks:', error);
      setBakeError(String(error));
    } finally {
      setIsBaking(false);
    }
  }, [bake]);

  // Sync URL -> Store
  useEffect(() => {
    if (projectId) setCurrentProjectId(projectId);
    if (videoId) setCurrentVideoId(videoId);
  }, [projectId, videoId, setCurrentProjectId, setCurrentVideoId]);

  // Initialize active class
  useEffect(() => {
    if (project && project.classes.length > 0 && activeClassId === null) {
      setActiveClassId(project.classes[0].id);
    }
  }, [project, activeClassId, setActiveClassId]);

  // Keyboard shortcuts for video
  useEffect(() => {
    const { setActiveTool } = useUIStore.getState();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const { currentVideoId, activeClassId } = useUIStore.getState();
      if (!currentVideoId) return;

      const key = e.key.toLowerCase();

      // Class selection shortcuts (numbers/letters)
      if (!e.ctrlKey && !e.metaKey) {
        const classIndex = CLASS_SHORTCUTS.indexOf(key);
        if (classIndex !== -1 && project?.classes[classIndex]) {
          e.preventDefault();
          setActiveClassId(project.classes[classIndex].id);
          return;
        }
      }

      // Tool shortcuts
      if (matchesShortcut(e, 'tool-pan')) {
        e.preventDefault();
        setActiveTool('pan');
        return;
      }
      if (matchesShortcut(e, 'tool-box')) {
        e.preventDefault();
        setActiveTool('bbox');
        return;
      }

      // Video navigation
      if (matchesShortcut(e, 'prev-sample')) {
        e.preventDefault();
        goPrev();
        return;
      }
      if (matchesShortcut(e, 'next-sample')) {
        e.preventDefault();
        goNext();
        return;
      }

      // Track-only shortcuts (bbox mode)
      if (isBboxProject) {
        // New track
        if (matchesShortcut(e, 'video-new-track')) {
          if (activeClassId !== null) {
            createTrack(activeClassId);
          }
          return;
        }
        // El borrado lo maneja VideoAnnotationCanvas, que es quien conoce la
        // caja seleccionada. Aquí no hay forma de saber cuál es.
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, createTrack, project, setActiveClassId, isBboxProject]);

  if (!project || !video) {
    return (
      <div className="flex h-full items-center justify-center">
        <i className="fas fa-spinner fa-spin text-4xl text-muted-foreground"></i>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Center: Canvas */}
        <div className="flex-1 min-w-0">
          {isBboxProject ? (
            <VideoAnnotationCanvas
              interpolatedBBoxes={interpolatedBBoxes}
              tracks={tracks}
              classes={project.classes}
              video={video}
            />
          ) : (
            <AnnotationCanvas
              videoFrameInfo={{ frameIndex: currentFrameIndex, fps: video.fpsExtraction }}
            />
          )}
        </div>

        {/* Right Panel: Classes + Tracks (bbox) / Classes only (other types) */}
        <div className="w-64 border-l border-[var(--annotix-border)] flex flex-col overflow-y-auto bg-[var(--annotix-white)] transition-colors">
          {/* Classes */}
          <div className="annotix-panel-section">
            <div className="flex items-center justify-between mb-3">
              <h3>{t('common.classes')}</h3>
              <ManageClassesDialog
                project={project}
                trigger={
                  <button className="h-7 px-2 rounded text-xs bg-[var(--annotix-primary)] text-white hover:bg-[var(--annotix-primary-dark)] transition-colors flex items-center gap-1">
                    <i className="fas fa-cog"></i>
                    {t('classes.manage')}
                  </button>
                }
              />
            </div>
            <div className="space-y-1">
              {project.classes.map((cls, index) => (
                <button
                  key={cls.id}
                  onClick={() => setActiveClassId(cls.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border p-1.5 transition-all text-xs",
                    activeClassId === cls.id
                      ? "border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/10"
                      : "border-[var(--annotix-border)] bg-[var(--annotix-white)] hover:border-[var(--annotix-primary)]/50"
                  )}
                >
                  {index < CLASS_SHORTCUTS.length && (
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--annotix-gray-light)] text-[9px] font-mono font-bold">
                      {CLASS_SHORTCUTS[index]}
                    </span>
                  )}
                  <div
                    className="h-3 w-3 rounded-full shrink-0 border border-black/20"
                    style={{ backgroundColor: cls.color }}
                  />
                  <span className="flex-1 text-left font-medium truncate">{cls.name}</span>
                  <span className="font-mono text-[10px] tabular-nums opacity-70 shrink-0">
                    {localByClass[cls.id] ?? 0}/{globalByClass[cls.id] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Acciones: mismo bloque y misma posición que en la vista de imágenes,
              antes de cualquier contenido de altura variable. */}
          <AnnotationPanelActions onBack={() => navigate(`/projects/${projectId}`)}>
            {isBboxProject && tracks.length > 0 && (
              <div className="space-y-1">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={handleBake}
                  disabled={isBaking || bakeableCount === 0}
                  title={t('video.bakeDesc')}
                >
                  {isBaking ? (
                    <><i className="fas fa-spinner fa-spin mr-2"></i>{t('video.baking')}</>
                  ) : (
                    <><i className="fas fa-fire mr-2"></i>{t('video.bake')} ({bakeableCount})</>
                  )}
                </Button>
                {bakeResult !== null && (
                  <p className="text-xs text-center text-green-600">
                    <i className="fas fa-check mr-1"></i>
                    {t('video.bakeDone')} ({bakeResult} frames)
                  </p>
                )}
                {bakeError !== null && (
                  <p className="text-xs text-center text-red-600 break-words">
                    <i className="fas fa-triangle-exclamation mr-1"></i>
                    {t('video.bakeError')}: {bakeError}
                  </p>
                )}
              </div>
            )}
          </AnnotationPanelActions>

          {/* Tracks (bbox only): al final y con altura acotada, para que no empuje
              nada de lo anterior. */}
          {isBboxProject && (
            <div className="annotix-panel-section min-h-0">
              <VideoTrackPanel
                tracks={tracks}
                classes={project.classes}
                currentFrameIndex={currentFrameIndex}
                selectedTrackId={selectedTrackId}
                onSelectTrack={setSelectedTrackId}
                onCreateTrack={createTrack}
                onDeleteTrack={deleteTrack}
                onUpdateTrack={updateTrack}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Timeline */}
      <VideoTimeline
        tracks={isBboxProject ? tracks : []}
        classes={project.classes}
        selectedTrackId={selectedTrackId}
        onSelectTrack={setSelectedTrackId}
      />
    </div>
  );
}
