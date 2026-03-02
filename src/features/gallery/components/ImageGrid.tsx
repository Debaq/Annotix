import { AnnotixImage } from '@/lib/db';
import { ImageCard } from './ImageCard';

interface ImageGridProps {
  images: AnnotixImage[];
  onDelete: (id: number) => void;
}

export function ImageGrid({ images, onDelete }: ImageGridProps) {
  return (
    <div className="annotix-gallery-grid">
      {images.map((image) => (
        <ImageCard key={image.id} image={image} onDelete={onDelete} />
      ))}
    </div>
  );
}
