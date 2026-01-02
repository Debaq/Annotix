import { useState, useEffect } from 'react';
import { Project } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { projectService } from '../services/projectService';

export function useCurrentProject() {
  const { currentProjectId } = useUIStore();
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!currentProjectId) {
      setProject(null);
      return;
    }

    const loadProject = async () => {
      setIsLoading(true);
      try {
        const data = await projectService.get(currentProjectId);
        setProject(data || null);
      } catch (error) {
        console.error('Failed to load current project:', error);
        setProject(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadProject();
  }, [currentProjectId]);

  return { project, isLoading };
}
