import { Project, NewProject } from '@/lib/db';
import { projectService } from '../services/projectService';
import { useTauriQuery } from '@/hooks/useTauriQuery';

export function useProjects() {
  const { data: projects, isLoading } = useTauriQuery(
    () => projectService.list(),
    [],
    ['db:projects-changed']
  );

  const createProject = async (project: NewProject) => {
    try {
      const id = await projectService.create(project);
      return id;
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error;
    }
  };

  const updateProject = async (id: string, updates: Partial<Project>) => {
    try {
      await projectService.update(id, updates);
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await projectService.delete(id);
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  };

  return {
    projects: projects || [],
    isLoading,
    createProject,
    updateProject,
    deleteProject,
  };
}
