import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../core/store/uiStore';
import { Button } from '@/components/ui/button';

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
    <div className="flex gap-2">
      {filters.map((filter) => (
        <Button
          key={filter.type}
          variant={galleryFilter === filter.type ? 'default' : 'outline'}
          size="sm"
          onClick={() => setGalleryFilter(filter.type)}
        >
          <i className={`fas ${filter.icon} mr-2`}></i>
          {t(`gallery.filter.${filter.type}`)}
        </Button>
      ))}
    </div>
  );
}
