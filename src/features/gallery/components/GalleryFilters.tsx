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
    <div className="flex gap-1">
      {filters.map((filter) => (
        <button
          key={filter.type}
          onClick={() => setGalleryFilter(filter.type)}
          className={cn(
            "flex-1 px-2 py-1.5 text-xs font-medium rounded border transition-all",
            galleryFilter === filter.type
              ? "bg-[var(--annotix-primary)] text-white border-[var(--annotix-primary)]"
              : "bg-white text-[var(--annotix-dark)] border-[var(--annotix-border)] hover:border-[var(--annotix-primary)]"
          )}
        >
          <i className={`fas ${filter.icon} mr-1`}></i>
          {t(`gallery.filter.${filter.type}`)}
        </button>
      ))}
    </div>
  );
}
