import { useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useImages } from '../hooks/useImages';
import { ImageCard } from './ImageCard';
import { useUIStore } from '../../core/store/uiStore';
import { cn } from '@/lib/utils';

export function CompactGallery() {
  const { t } = useTranslation();
  const { images } = useImages();
  const { setGalleryMode, currentImageId } = useUIStore();
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!listRef.current) return;
    if (e.deltaY === 0) return;
    e.preventDefault();
    listRef.current.scrollLeft += e.deltaY;
  }, []);

  useEffect(() => {
    if (!currentImageId) return;
    const el = itemRefs.current.get(currentImageId);
    const list = listRef.current;
    if (!el || !list) return;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: left - list.clientWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
    }
  }, [currentImageId, images.length]);

  const setItemRef = (id: string, el: HTMLDivElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  };

  return (
    <div className="annotix-compact-gallery">
      <button
        className="annotix-compact-gallery-btn"
        onClick={() => setGalleryMode('normal')}
        title={t('gallery.expand', 'Expandir galería (G)')}
      >
        <i className="fas fa-expand-alt"></i>
      </button>
      <div
        ref={listRef}
        className="annotix-compact-gallery-list"
        onWheel={handleWheel}
      >
        {images.length === 0 ? (
          <div className="flex items-center justify-center flex-1 text-xs" style={{ color: 'var(--annotix-gray)' }}>
            <i className="fas fa-images mr-2"></i>
            {t('gallery.empty.title')}
          </div>
        ) : (
          images.map((img) => (
            <div
              key={img.id}
              ref={(el) => setItemRef(img.id!, el)}
              className={cn('annotix-compact-gallery-item', currentImageId === img.id && 'active')}
            >
              <ImageCard image={img} />
            </div>
          ))
        )}
      </div>
      <button
        className="annotix-compact-gallery-btn"
        onClick={() => setGalleryMode('hidden')}
        title={t('gallery.hide', 'Ocultar galería')}
      >
        <i className="fas fa-times"></i>
      </button>
    </div>
  );
}
