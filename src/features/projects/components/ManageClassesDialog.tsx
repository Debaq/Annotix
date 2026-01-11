import { useState, useEffect } from 'react';
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
import { Project, ClassDefinition } from '@/lib/db';

interface ManageClassesDialogProps {
  project: Project;
  trigger?: React.ReactNode;
}

export function ManageClassesDialog({ project, trigger }: ManageClassesDialogProps) {
  const { t } = useTranslation();
  const { updateProject } = useProjects();
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<ClassDefinition[]>(project.classes);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (open) {
      setClasses(project.classes);
    }
  }, [open, project.classes]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      await updateProject(project.id!, {
        classes,
      });
      setOpen(false);
    } catch (error) {
      console.error('Failed to update classes:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="w-full">
            <i className="fas fa-tags mr-2"></i>
            Gestionar Clases
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('classes.manage')}</DialogTitle>
          <DialogDescription>
            Añade, edita o elimina las categorías disponibles para este proyecto.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <ClassManager classes={classes} onChange={setClasses} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating}>
            {isUpdating && <i className="fas fa-spinner fa-spin mr-2"></i>}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
