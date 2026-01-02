import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../core/store/uiStore';
import { ClassSelector } from './ClassSelector';
import { BrushSizeSlider } from './BrushSizeSlider';

export function CanvasToolbar() {
  const { t } = useTranslation();
  const { activeTool } = useUIStore();

  return (
    <div className="absolute left-4 top-4 space-y-2">
      <ClassSelector />
      {activeTool === 'mask' && <BrushSizeSlider />}
    </div>
  );
}
