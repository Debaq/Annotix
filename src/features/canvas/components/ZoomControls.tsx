import { useTranslation } from 'react-i18next';
import { useCanvasTransform } from '../hooks/useCanvasTransform';
import { Button } from '@/components/ui/button';

interface ZoomControlsProps {
  onFit?: () => void;
}

export function ZoomControls({ onFit }: ZoomControlsProps) {
  const { t } = useTranslation();
  const { zoom, zoomIn, zoomOut, resetZoom } = useCanvasTransform();

  const handleReset = () => {
    if (onFit) {
      onFit();
    } else {
      resetZoom();
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={zoomOut}>
        <i className="fas fa-minus"></i>
      </Button>

      <span className="min-w-[60px] text-center text-sm font-medium">
        {Math.round(zoom * 100)}%
      </span>

      <Button variant="outline" size="sm" onClick={zoomIn}>
        <i className="fas fa-plus"></i>
      </Button>

      <Button variant="outline" size="sm" onClick={handleReset} title={onFit ? t('canvas.fitScreen') : t('canvas.resetZoom')}>
        <i className="fas fa-expand"></i>
      </Button>
    </div>
  );
}
