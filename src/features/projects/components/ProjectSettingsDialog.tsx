import { ReactNode, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjects } from '../hooks/useProjects';
import { ClassManager } from './ClassManager';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Project, ClassDefinition } from '@/lib/db';

interface ProjectSettingsDialogProps {
  project: Project;
  trigger?: ReactNode;
}

export function ProjectSettingsDialog({ project, trigger }: ProjectSettingsDialogProps) {
  const { t } = useTranslation();
  const { updateProject } = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [classes, setClasses] = useState<ClassDefinition[]>(project.classes);
  const [isUpdating, setIsUpdating] = useState(false);

  // Sincronizar estado cuando cambie el proyecto o se abra el diálogo
  useEffect(() => {
    if (open) {
      setName(project.name);
      setClasses(project.classes);
    }
  }, [open, project]);

  const handleUpdate = async () => {
    if (!name.trim() || classes.length === 0) {
      return;
    }

    setIsUpdating(true);
    try {
      await updateProject(project.id!, {
        name: name.trim(),
        classes,
      });
      setOpen(false);
    } catch (error) {
      console.error('Failed to update project:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm">
            <i className="fas fa-cog mr-2"></i>
            {t('projects.configure')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('projects.settings')}</DialogTitle>
          <DialogDescription>
            Modifica el nombre o gestiona las clases del proyecto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-project-name">{t('projects.name')}</Label>
            <Input
              id="edit-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('classes.manage')}</Label>
            <ClassManager classes={classes} onChange={setClasses} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating || !name.trim()}>
            {isUpdating ? (
              <i className="fas fa-spinner fa-spin mr-2"></i>
            ) : (
              <i className="fas fa-save mr-2"></i>
            )}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
