import { useTranslation } from 'react-i18next';
import { useCanvasTransform } from '../hooks/useCanvasTransform';
import { Button } from '@/components/ui/button';

export function ZoomControls() {
  const { t } = useTranslation();
  const { zoom, zoomIn, zoomOut, resetZoom } = useCanvasTransform();

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

      <Button variant="outline" size="sm" onClick={resetZoom}>
        <i className="fas fa-expand"></i>
      </Button>
    </div>
  );
}
