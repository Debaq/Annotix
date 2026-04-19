import { Project, NewProject, ClassDefinition } from '@/lib/db';
import * as tauriDb from '@/lib/tauriDb';

export const projectService = {
  async create(project: NewProject): Promise<string> {
    const id = await tauriDb.createProject(
      project.name,
      project.type,
      project.classes,
      project.imageFormat
    );
    return id;
  },

  async setImageFormat(id: string, format: 'jpg' | 'webp'): Promise<void> {
    await tauriDb.setProjectImageFormat(id, format);
  },

  async convertImages(id: string, targetFormat: 'jpg' | 'webp') {
    return await tauriDb.convertProjectImages(id, targetFormat);
  },

  async get(id: string): Promise<Project | undefined> {
    const project = await tauriDb.getProject(id);
    return project ?? undefined;
  },

  async list(): Promise<Project[]> {
    return await tauriDb.listProjects();
  },

  async update(id: string, updates: Partial<Project>): Promise<void> {
    await tauriDb.updateProject(id, {
      name: updates.name,
      projectType: updates.type,
      classes: updates.classes,
    });
  },

  async delete(id: string): Promise<void> {
    await tauriDb.deleteProject(id);
  },

  async saveClasses(id: string, classes: ClassDefinition[]): Promise<void> {
    await tauriDb.saveClasses(id, classes);
  },
};
