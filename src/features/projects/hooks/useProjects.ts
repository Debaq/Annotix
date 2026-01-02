import { useState, useEffect } from 'react';
import { Project, NewProject } from '@/lib/db';
import { projectService } from '../services/projectService';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const data = await projectService.list();
      setProjects(data);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const createProject = async (project: NewProject) => {
    try {
      const id = await projectService.create(project);
      await loadProjects();
      return id;
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error;
    }
  };

  const updateProject = async (id: number, updates: Partial<Project>) => {
    try {
      await projectService.update(id, updates);
      await loadProjects();
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  };

  const deleteProject = async (id: number) => {
    try {
      await projectService.delete(id);
      await loadProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  };

  return {
    projects,
    isLoading,
    createProject,
    updateProject,
    deleteProject,
    reload: loadProjects,
  };
}
