import { AnnotixImage } from '@/lib/db';
import { ImageCard } from './ImageCard';

interface ImageGridProps {
  images: AnnotixImage[];
}

export function ImageGrid({ images }: ImageGridProps) {
  return (
    <div className="annotix-gallery-grid">
      {images.map((image) => (
        <ImageCard key={image.id} image={image} />
      ))}
    </div>
  );
}
