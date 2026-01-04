import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface ZoomControlsProps {
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export function ZoomControls({ onFit, onZoomIn, onZoomOut }: ZoomControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onZoomOut}>
        <i className="fas fa-minus"></i>
      </Button>

      <Button variant="outline" size="sm" onClick={onZoomIn}>
        <i className="fas fa-plus"></i>
      </Button>

      <Button variant="outline" size="sm" onClick={onFit} title={t('canvas.fitScreen')}>
        <i className="fas fa-expand"></i>
      </Button>
    </div>
  );
}
