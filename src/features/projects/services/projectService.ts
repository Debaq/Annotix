import { db, Project, NewProject } from '@/lib/db';

export const projectService = {
  async create(project: NewProject): Promise<number> {
    const now = Date.now();
    const fullProject: Omit<Project, 'id'> = {
      ...project,
      metadata: {
        created: now,
        updated: now,
        version: '2.0.0',
        ...project.metadata,
      },
    };
    const id = await db.projects.add(fullProject);
    return id;
  },

  async get(id: number): Promise<Project | undefined> {
    return await db.projects.get(id);
  },

  async list(): Promise<Project[]> {
    return await db.projects.orderBy('metadata.created').reverse().toArray();
  },

  async update(id: number, updates: Partial<Project>): Promise<void> {
    const current = await db.projects.get(id);
    if (!current) return;

    await db.projects.update(id, {
      ...updates,
      metadata: {
        ...current.metadata,
        ...updates.metadata,
        updated: Date.now(),
      },
    });
  },

  async delete(id: number): Promise<void> {
    // Delete all images associated with this project
    await db.images.where('projectId').equals(id).delete();

    // Delete the project
    await db.projects.delete(id);
  },
};
