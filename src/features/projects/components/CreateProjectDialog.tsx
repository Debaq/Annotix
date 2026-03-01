import { ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjects } from '../hooks/useProjects';
import { ProjectTypeSelector } from './ProjectTypeSelector';
import { ProjectTypeWizard } from './ProjectTypeWizard';
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
import { ProjectType, ClassDefinition } from '@/lib/db';


interface CreateProjectDialogProps {
  trigger?: ReactNode;
}

export function CreateProjectDialog({ trigger }: CreateProjectDialogProps) {
  const { t } = useTranslation();
  const { createProject } = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ProjectType>('bbox');
  const [classes, setClasses] = useState<ClassDefinition[]>([
    { id: 0, name: 'Object', color: '#ff0000' },
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || classes.length === 0) {
      return;
    }

    setIsCreating(true);
    try {
      await createProject({
        name: name.trim(),
        type,
        classes,
      });

      // Reset form
      setName('');
      setType('bbox');
      setClasses([{ id: 0, name: 'Object', color: '#ff0000' }]);
      setOpen(false);
    } catch (error) {
      console.error('Failed to create project:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <i className="fas fa-plus mr-2"></i>
            {t('projects.create')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl" closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('projects.create')}</DialogTitle>
          <DialogDescription>{t('projects.createDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="project-name">{t('projects.name')}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('projects.namePlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('projects.type.label')}</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto py-1 px-2 text-xs text-primary"
                onClick={() => setWizardOpen(true)}
              >
                <i className="fas fa-wand-magic-sparkles mr-1.5"></i>
                {t('wizard.trigger')}
              </Button>
            </div>
            <ProjectTypeSelector value={type} onChange={setType} />
            <ProjectTypeWizard
              open={wizardOpen}
              onOpenChange={setWizardOpen}
              onSelectType={setType}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('projects.classes')}</Label>
            <ClassManager classes={classes} onChange={setClasses} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                {t('common.creating')}
              </>
            ) : (
              <>
                <i className="fas fa-plus mr-2"></i>
                {t('common.create')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
