import { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mic, Music, Volume2 } from 'lucide-react';
import { useCurrentAudio } from '../hooks/useCurrentAudio';
import { useAudio } from '../hooks/useAudio';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useUIStore } from '../../core/store/uiStore';
import { SpeechRecognitionAnnotator } from './SpeechRecognitionAnnotator';
import { AudioClassificationAnnotator } from './AudioClassificationAnnotator';
import { SoundEventDetectionAnnotator } from './SoundEventDetectionAnnotator';
import { AudioEditToolbar, type EditTool, RANGE_TOOLS } from './AudioEditToolbar';

export function AudioAnnotator() {
  const { t } = useTranslation('audio');
  const { audio, reload } = useCurrentAudio();
  const { audioList } = useAudio();
  const { project } = useCurrentProject();
  const { currentAudioId, setCurrentAudioId } = useUIStore();
  const navigate = useNavigate();

  const currentIndex = audioList.findIndex((a) => a.id === currentAudioId);

  // ── Edit toolbar state ──────────────────────────────────────────────────
  const [editTool, setEditTool] = useState<EditTool>(null);
  const [editSelection, setEditSelection] = useState<{ startMs: number; endMs: number } | null>(null);
  const [splitPoint, setSplitPoint] = useState<number | null>(null);

  useEffect(() => {
    setEditTool(null);
    setEditSelection(null);
    setSplitPoint(null);
  }, [currentAudioId]);

  const handleToolChange = useCallback((tool: EditTool) => {
    setEditTool(tool);
    setEditSelection(null);
    setSplitPoint(null);
  }, []);

  const isRangeEdit = editTool != null && RANGE_TOOLS.includes(editTool);

  const handleEditSelectionChange = useCallback((startMs: number, endMs: number) => {
    setEditSelection({ startMs, endMs });
  }, []);

  const handleEditSplitPointChange = useCallback((ms: number) => {
    setSplitPoint(ms);
  }, []);

  const editProps = {
    editSelection: isRangeEdit ? editSelection : undefined,
    editSplitPoint: editTool === 'split' ? splitPoint : undefined,
    onEditSelectionChange: isRangeEdit ? handleEditSelectionChange : undefined,
    onEditSplitPointChange: editTool === 'split' ? handleEditSplitPointChange : undefined,
  };

  const goToNext = useCallback(() => {
    if (!project?.id || !audioList.length) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex < audioList.length) {
      const nextId = audioList[nextIndex].id!;
      setCurrentAudioId(nextId);
      navigate(`/projects/${project.id}/audio/${nextId}`);
    }
  }, [project?.id, audioList, currentIndex, setCurrentAudioId, navigate]);

  const goToPrev = useCallback(() => {
    if (!project?.id || !audioList.length) return;
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      const prevId = audioList[prevIndex].id!;
      setCurrentAudioId(prevId);
      navigate(`/projects/${project.id}/audio/${prevId}`);
    }
  }, [project?.id, audioList, currentIndex, setCurrentAudioId, navigate]);

  if (!audio || !project?.id) {
    const IconComponent = project?.type === 'audio-classification' ? Music
      : project?.type === 'sound-event-detection' ? Volume2
      : Mic;

    return (
      <div className="flex items-center justify-center h-full text-[var(--annotix-gray)]">
        <div className="text-center">
          <IconComponent size={48} className="mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">{t('selectAudio')}</p>
          <p className="text-sm mt-2 opacity-70">{t('selectAudioDesc')}</p>
        </div>
      </div>
    );
  }

  const sharedProps = {
    audio,
    projectId: project.id,
    currentIndex,
    totalCount: audioList.length,
    onPrev: goToPrev,
    onNext: goToNext,
    onSaved: reload,
    ...editProps,
  };

  const annotator = (() => {
    switch (project.type) {
      case 'audio-classification':
        return (
          <AudioClassificationAnnotator
            {...sharedProps}
            classes={project.classes}
          />
        );

      case 'sound-event-detection':
        return (
          <SoundEventDetectionAnnotator
            {...sharedProps}
            classes={project.classes}
          />
        );

      case 'speech-recognition':
      default:
        return <SpeechRecognitionAnnotator {...sharedProps} />;
    }
  })();

  return (
    <div className="flex flex-col h-full">
      <AudioEditToolbar
        projectId={project.id}
        audioId={audio.id}
        editSelection={editSelection}
        splitPoint={splitPoint}
        activeTool={editTool}
        onToolChange={handleToolChange}
        onComplete={reload}
      />
      <div className="flex-1 min-h-0">
        {annotator}
      </div>
    </div>
  );
}
