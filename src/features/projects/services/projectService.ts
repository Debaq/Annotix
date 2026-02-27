import { Project, NewProject, ClassDefinition } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const projectService = {
  async create(project: NewProject): Promise<number> {
    const id = await tauriDb.createProject(
      project.name,
      project.type,
      project.classes
    );
    return id;
  },

  async get(id: number): Promise<Project | undefined> {
    const project = await tauriDb.getProject(id);
    return project ?? undefined;
  },

  async list(): Promise<Project[]> {
    return await tauriDb.listProjects();
  },

  async update(id: number, updates: Partial<Project>): Promise<void> {
    await tauriDb.updateProject(id, {
      name: updates.name,
      projectType: updates.type,
      classes: updates.classes,
    });
  },

  async delete(id: number): Promise<void> {
    await tauriDb.deleteProject(id);
  },
};
