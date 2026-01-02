import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnnotixImage } from '@/lib/db';
import { useUIStore } from '../../core/store/uiStore';
import { useImages } from '../hooks/useImages';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ImageCardProps {
  image: AnnotixImage;
}

export function ImageCard({ image }: ImageCardProps) {
  const { t } = useTranslation();
  const { currentImageId, setCurrentImageId } = useUIStore();
  const { deleteImage } = useImages();
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');

  useEffect(() => {
    if (image.image) {
      const url = URL.createObjectURL(image.image);
      setThumbnailUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [image.image]);

  const handleSelect = () => {
    setCurrentImageId(image.id!);
  };

  const handleDelete = async () => {
    if (confirm(t('gallery.confirmDelete', { name: image.name }))) {
      await deleteImage(image.id!);
    }
  };

  const isSelected = currentImageId === image.id;
  const isAnnotated = image.annotations.length > 0;

  return (
    <Card
      className={`group cursor-pointer overflow-hidden transition-all hover:shadow-lg ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={handleSelect}
    >
      <div className="relative aspect-square bg-muted">
        {thumbnailUrl && (
          <img
            src={thumbnailUrl}
            alt={image.name}
            className="h-full w-full object-cover"
          />
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/40">
          <div className="flex h-full items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect();
              }}
            >
              <i className="fas fa-edit mr-2"></i>
              {t('gallery.annotate')}
            </Button>
          </div>
        </div>

        {/* Status badges */}
        <div className="absolute left-2 top-2 flex gap-2">
          {isAnnotated && (
            <div className="rounded-full bg-green-500 px-2 py-1 text-xs font-medium text-white">
              <i className="fas fa-check mr-1"></i>
              {image.annotations.length}
            </div>
          )}
        </div>

        {/* Menu */}
        <div className="absolute right-2 top-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="secondary" size="icon" className="h-8 w-8">
                <i className="fas fa-ellipsis-v"></i>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleSelect}>
                <i className="fas fa-edit mr-2"></i>
                {t('gallery.annotate')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <i className="fas fa-trash mr-2"></i>
                {t('gallery.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="p-3">
        <p className="truncate text-sm font-medium">{image.name}</p>
        <p className="text-xs text-muted-foreground">
          {image.width} × {image.height}
        </p>
      </div>
    </Card>
  );
}
