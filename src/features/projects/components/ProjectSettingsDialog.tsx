import { ReactNode, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjects } from '../hooks/useProjects';
import { projectService } from '../services/projectService';
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
  const { updateProject, saveClasses } = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [classes, setClasses] = useState<ClassDefinition[]>(project.classes);
  const [imageFormat, setImageFormat] = useState<'jpg' | 'webp'>(project.imageFormat ?? 'jpg');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionMsg, setConversionMsg] = useState<string | null>(null);

  // Sincronizar estado cuando cambie el proyecto o se abra el diálogo
  useEffect(() => {
    if (open) {
      setName(project.name);
      setClasses(project.classes);
      setImageFormat(project.imageFormat ?? 'jpg');
      setConversionMsg(null);
    }
  }, [open, project]);

  const currentFormat: 'jpg' | 'webp' = project.imageFormat ?? 'jpg';
  const hasImages = (project.imageCount ?? 0) > 0;

  const handleFormatChange = async (next: 'jpg' | 'webp') => {
    setImageFormat(next);
    if (next !== currentFormat) {
      try {
        await projectService.setImageFormat(project.id!, next);
      } catch (e) {
        console.error('Failed to set image format:', e);
      }
    }
  };

  const handleConvertDataset = async () => {
    if (!project.id) return;
    const count = project.imageCount ?? 0;
    const target = imageFormat;
    const message = t('project.convertDatasetConfirm', {
      count,
      format: target.toUpperCase(),
    });
    if (!window.confirm(message)) return;

    setIsConverting(true);
    setConversionMsg(null);
    try {
      const report = await projectService.convertImages(project.id, target);
      setConversionMsg(
        t('project.convertDatasetSuccess', {
          converted: report.converted,
          skipped: report.skipped,
          failed: report.failed.length,
        })
      );
    } catch (e) {
      console.error('Failed to convert images:', e);
      setConversionMsg(String(e));
    } finally {
      setIsConverting(false);
    }
  };

  const handleUpdate = async () => {
    if (!name.trim() || classes.length === 0) {
      return;
    }

    setIsUpdating(true);
    try {
      await updateProject(project.id!, { name: name.trim() });
      await saveClasses(project.id!, classes);
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
            {t('projects.description')}
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

          <div className="space-y-2">
            <Label htmlFor="edit-image-format">{t('project.imageFormat')}</Label>
            <select
              id="edit-image-format"
              value={imageFormat}
              onChange={(e) => handleFormatChange(e.target.value as 'jpg' | 'webp')}
              className="w-full border rounded px-3 py-2 bg-background text-foreground text-sm"
            >
              <option value="jpg">{t('project.imageFormatJpg')}</option>
              <option value="webp">{t('project.imageFormatWebp')}</option>
            </select>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <i className="fas fa-info-circle mr-1.5" />
              {t('project.imageFormatInfo')}
            </p>

            {hasImages && imageFormat !== currentFormat && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={handleConvertDataset}
                disabled={isConverting}
              >
                {isConverting ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2" />
                    {t('common.loading', 'Loading')}
                  </>
                ) : (
                  <>
                    <i className="fas fa-right-left mr-2" />
                    {t('project.convertDataset')} ({imageFormat.toUpperCase()})
                  </>
                )}
              </Button>
            )}
            {conversionMsg && (
              <p className="text-xs mt-1" style={{ color: 'var(--annotix-gray)' }}>
                {conversionMsg}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('classes.cancel')}
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating || !name.trim()}>
            {isUpdating ? (
              <i className="fas fa-spinner fa-spin mr-2"></i>
            ) : (
              <i className="fas fa-save mr-2"></i>
            )}
            {t('classes.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
