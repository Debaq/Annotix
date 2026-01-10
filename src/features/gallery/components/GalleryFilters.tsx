import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../core/store/uiStore';
import { cn } from '@/lib/utils';

type FilterType = 'all' | 'annotated' | 'unannotated';

export function GalleryFilters() {
  const { t } = useTranslation();
  const { galleryFilter, setGalleryFilter } = useUIStore();

  const filters: { type: FilterType; icon: string }[] = [
    { type: 'all', icon: 'fa-images' },
    { type: 'annotated', icon: 'fa-check-circle' },
    { type: 'unannotated', icon: 'fa-circle' },
  ];

  return (
    <div className="gallery-filters">
      {filters.map((filter) => (
        <button
          key={filter.type}
          onClick={() => setGalleryFilter(filter.type)}
          className={cn(
            "filter-btn",
            galleryFilter === filter.type && "active"
            )}>
        
          <i className={`fas ${filter.icon} mr-1`}></i>
          {t(`gallery.filter.${filter.type}`)}
        </button>
      ))}
    </div>
  );
}
