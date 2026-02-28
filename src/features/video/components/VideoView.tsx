import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useCurrentVideo } from '../hooks/useCurrentVideo';
import { useVideoNavigation } from '../hooks/useVideoNavigation';
import { useVideoTracks } from '../hooks/useVideoTracks';
import { useInterpolation } from '../hooks/useInterpolation';
import { VideoTimeline } from './VideoTimeline';
import { VideoAnnotationCanvas } from './VideoAnnotationCanvas';
import { VideoTrackList } from './VideoTrackList';
import { Button } from '@/components/ui/button';
import { ManageClassesDialog } from '../../projects/components/ManageClassesDialog';
import { cn } from '@/lib/utils';
import { CLASS_SHORTCUTS } from '../../core/constants';

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
  const { currentFrameIndex, totalFrames, currentFrame } = useVideoNavigation();
  const { tracks, createTrack, deleteTrack, updateTrack, setKeyframe, removeKeyframe, bake } = useVideoTracks();

  // Auto-bake al salir de la vista de video
  useEffect(() => {
    return () => { bake(); };
  }, [bake]);
  const { interpolatedBBoxes } = useInterpolation(tracks, currentFrameIndex);

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

      const { currentFrameIndex, setCurrentFrameIndex, currentVideoId, activeClassId } = useUIStore.getState();
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
      if (!e.ctrlKey && !e.metaKey) {
        switch (key) {
          case 'v':
            e.preventDefault();
            setActiveTool('select');
            return;
          case 'h':
            e.preventDefault();
            setActiveTool('pan');
            return;
          case 'b':
            e.preventDefault();
            setActiveTool('bbox');
            return;
        }
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          if (currentFrameIndex > 0) setCurrentFrameIndex(currentFrameIndex - 1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (currentFrameIndex < totalFrames - 1) setCurrentFrameIndex(currentFrameIndex + 1);
          break;
        case 't':
        case 'T':
          // Create new track with active class
          if (activeClassId !== null) {
            createTrack(activeClassId);
          }
          break;
        case 'Delete':
        case 'Backspace':
          // Delete keyframe on current frame for first track that has one
          for (const track of tracks) {
            const hasKf = track.keyframes.some(kf => kf.frameIndex === currentFrameIndex);
            if (hasKf && track.id) {
              removeKeyframe(track.id, currentFrameIndex);
              break;
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalFrames, tracks, createTrack, removeKeyframe, project, setActiveClassId]);

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
          <VideoAnnotationCanvas
            interpolatedBBoxes={interpolatedBBoxes}
            tracks={tracks}
            classes={project.classes}
            video={video}
          />
        </div>

        {/* Right Panel: Classes + Tracks */}
        <div className="w-64 border-l flex flex-col overflow-y-auto bg-white">
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
                      : "border-[var(--annotix-border)] bg-white hover:border-[var(--annotix-primary)]/50"
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
                </button>
              ))}
            </div>
          </div>

          {/* Tracks */}
          <div className="annotix-panel-section flex-1">
            <VideoTrackList
              tracks={tracks}
              classes={project.classes}
              currentFrameIndex={currentFrameIndex}
              onCreateTrack={createTrack}
              onDeleteTrack={deleteTrack}
              onUpdateTrack={updateTrack}
            />
          </div>

          {/* Actions */}
          <div className="annotix-panel-section space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => navigate(`/projects/${projectId}`)}
            >
              <i className="fas fa-arrow-left mr-2"></i>
              {t('gallery.backToGallery', 'Volver')}
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom: Timeline */}
      <VideoTimeline tracks={tracks} classes={project.classes} />
    </div>
  );
}
