import { useTranslation } from 'react-i18next';
import { useDrawingTool } from '../hooks/useDrawingTool';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';

export function BrushSizeSlider() {
  const { t } = useTranslation();
  const { brushSize, setBrushSize } = useDrawingTool();

  return (
    <Card className="w-[200px] p-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t('canvas.brushSize')}</span>
          <span className="text-xs text-muted-foreground">{brushSize}px</span>
        </div>
        <Slider
          value={[brushSize]}
          onValueChange={([value]) => setBrushSize(value)}
          min={1}
          max={100}
          step={1}
        />
      </div>
    </Card>
  );
}
