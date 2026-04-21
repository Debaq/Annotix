import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnnotixImage } from '@/lib/db';
import { ImageCard } from './ImageCard';

interface ImageGridProps {
  images: AnnotixImage[];
}

// Debe quedar consistente con .annotix-gallery-grid en globals.css:
//   grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
//   gap: 8px;
const MIN_ITEM_PX = 100;
const GAP_PX = 8;

export function ImageGrid({ images }: ImageGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Observa el ancho del contenedor para decidir cuántas columnas caben.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // columnas: misma heurística que CSS auto-fill/minmax(100px, 1fr) con gap.
  const cols = useMemo(() => {
    if (containerWidth <= 0) return 1;
    const usable = containerWidth;
    // cantidad de items de ancho mínimo que entran con gaps entre medio
    const n = Math.max(1, Math.floor((usable + GAP_PX) / (MIN_ITEM_PX + GAP_PX)));
    return n;
  }, [containerWidth]);

  const rowCount = Math.ceil(images.length / cols);

  // Cada ítem es cuadrado (aspect-ratio: 1). Estimar altura por ancho de celda.
  const itemWidth = useMemo(() => {
    if (containerWidth <= 0 || cols <= 0) return MIN_ITEM_PX;
    return (containerWidth - GAP_PX * (cols - 1)) / cols;
  }, [containerWidth, cols]);
  const rowHeight = Math.round(itemWidth) + GAP_PX;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  return (
    <div ref={scrollRef} className="h-full w-full overflow-auto p-3">
      {containerWidth > 0 && (
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * cols;
            const end = Math.min(start + cols, images.length);
            const rowImages = images.slice(start, end);
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap: `${GAP_PX}px`,
                  paddingBottom: `${GAP_PX}px`,
                }}
              >
                {rowImages.map((image) => (
                  <ImageCard key={image.id} image={image} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
