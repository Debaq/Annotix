import { useLiveQuery } from 'dexie-react-hooks';
import { db, Project } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';

export function useCurrentProject() {
  const { currentProjectId } = useUIStore();

  const project = useLiveQuery(
    () => (currentProjectId ? db.projects.get(currentProjectId) : undefined),
    [currentProjectId]
  );

  return { 
    project: project ?? null, 
    isLoading: project === undefined 
  };
}
