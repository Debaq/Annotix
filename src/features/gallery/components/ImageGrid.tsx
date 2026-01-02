import { AnnotixImage } from '@/lib/db';
import { ImageCard } from './ImageCard';

interface ImageGridProps {
  images: AnnotixImage[];
}

export function ImageGrid({ images }: ImageGridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {images.map((image) => (
        <ImageCard key={image.id} image={image} />
      ))}
    </div>
  );
}
