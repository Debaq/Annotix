import { useCurrentProject } from './useCurrentProject';
import { ClassDefinition } from '@/lib/db';
import { projectService } from '../services/projectService';

export function useClasses() {
  const { project } = useCurrentProject();

  const addClass = async (name: string, color: string) => {
    if (!project?.id) return;

    const newId = project.classes.length > 0
      ? Math.max(...project.classes.map((c) => c.id)) + 1
      : 0;

    const newClass: ClassDefinition = { id: newId, name, color };
    const updatedClasses = [...project.classes, newClass];

    await projectService.update(project.id, { classes: updatedClasses });
  };

  const updateClass = async (id: number, updates: Partial<ClassDefinition>) => {
    if (!project?.id) return;

    const updatedClasses = project.classes.map((cls) =>
      cls.id === id ? { ...cls, ...updates } : cls
    );

    await projectService.update(project.id, { classes: updatedClasses });
  };

  const deleteClass = async (id: number) => {
    if (!project?.id) return;

    const updatedClasses = project.classes.filter((cls) => cls.id !== id);

    await projectService.update(project.id, { classes: updatedClasses });
  };

  return {
    classes: project?.classes || [],
    addClass,
    updateClass,
    deleteClass,
  };
}
