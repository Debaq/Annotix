import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { AnnotationInspectorModal } from '../../gallery/components/AnnotationInspectorModal';
import { imageService } from '../../gallery/services/imageService';
import { useToast } from '@/components/hooks/use-toast';
import type { Project, AnnotixImage } from '@/lib/db';

interface Props {
  project: Project;
}

export function ProjectInspectorTrigger({ project }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<AnnotixImage[] | null>(null);

  const handleOpen = async () => {
    if (!project.id) return;
    setLoading(true);
    try {
      const data = await imageService.listByProject(project.id);
      setImages(data.filter((img) => !img.videoId));
      setOpen(true);
    } catch (err) {
      toast({ title: `Error: ${(err as Error).message}`, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DropdownMenuItem onSelect={(e) => { e.preventDefault(); handleOpen(); }} disabled={loading}>
        <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-microscope'} mr-2`}></i>
        {t('inspector.title', 'Inspector de anotaciones')}
      </DropdownMenuItem>
      {images && (
        <AnnotationInspectorModal
          open={open}
          onOpenChange={setOpen}
          projectOverride={project}
          imagesOverride={images}
        />
      )}
    </>
  );
}
