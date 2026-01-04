import { useLiveQuery } from 'dexie-react-hooks';
import { db, Project, NewProject } from '@/lib/db';
import { projectService } from '../services/projectService';

export function useProjects() {
  const projects = useLiveQuery(
    () => projectService.list(),
    []
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

  const updateProject = async (id: number, updates: Partial<Project>) => {
    try {
      await projectService.update(id, updates);
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  };

  const deleteProject = async (id: number) => {
    try {
      await projectService.delete(id);
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  };

  return {
    projects: projects || [],
    isLoading: projects === undefined,
    createProject,
    updateProject,
    deleteProject,
  };
}
