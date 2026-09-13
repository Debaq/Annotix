import { useEffect, useRef } from 'react';
import { useUIStore } from '../../core/store/uiStore';
import { projectService } from '../services/projectService';
import { useTauriQuery } from '@/hooks/useTauriQuery';
import { studyLog } from '../../study/studyLog';
import { setStudyContext } from '../../study/studySession';
import { modalityForProjectType } from '../../study/modality';

export function useCurrentProject() {
  const { currentProjectId } = useUIStore();

  const { data: project, isLoading } = useTauriQuery(
    async () => {
      if (!currentProjectId) return null;
      return (await projectService.get(currentProjectId)) ?? null;
    },
    [currentProjectId],
    ['db:projects-changed']
  );

  // Modo estudio: el proyecto abierto fija `project_kind` y `modality` para el
  // resto de los eventos. `project.open` se emite una vez por proyecto.
  const openedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!project) return;
    const modality = modalityForProjectType(project.type);
    setStudyContext(project.type, modality);
    if (openedRef.current !== project.id) {
      openedRef.current = project.id ?? null;
      studyLog.emit('project.open', { project_kind: project.type, modality });
    }
  }, [project]);

  return {
    project: project ?? null,
    isLoading,
  };
}
