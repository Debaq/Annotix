import { useUIStore } from '../../core/store/uiStore';
import { projectService } from '../services/projectService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

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

  return {
    project: project ?? null,
    isLoading,
  };
}
