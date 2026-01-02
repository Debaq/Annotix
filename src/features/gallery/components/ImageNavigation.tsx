import { useTranslation } from 'react-i18next';
import { useImageNavigation } from '../hooks/useImageNavigation';
import { Button } from '@/components/ui/button';

export function ImageNavigation() {
  const { t } = useTranslation();
  const { currentIndex, total, canNavigatePrevious, canNavigateNext, navigatePrevious, navigateNext } =
    useImageNavigation();

  if (total === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={navigatePrevious}
        disabled={!canNavigatePrevious}
      >
        <i className="fas fa-chevron-left mr-2"></i>
        {t('navigation.previous')}
      </Button>

      <span className="text-sm text-muted-foreground">
        {currentIndex + 1} / {total}
      </span>

      <Button
        variant="outline"
        size="sm"
        onClick={navigateNext}
        disabled={!canNavigateNext}
      >
        {t('navigation.next')}
        <i className="fas fa-chevron-right ml-2"></i>
      </Button>
    </div>
  );
}
