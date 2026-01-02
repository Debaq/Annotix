import { useTranslation } from 'react-i18next';
import { ExportFormat } from './ExportDialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface FormatSelectorProps {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
}

export function FormatSelector({ value, onChange }: FormatSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <Label>{t('export.format')}</Label>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as ExportFormat)}>
        <div className="flex items-center space-x-2 rounded-lg border p-3">
          <RadioGroupItem value="yolo-detection" id="format-yolo-detection" />
          <Label htmlFor="format-yolo-detection" className="flex-1 cursor-pointer">
            <div>
              <p className="font-medium">{t('export.formats.yoloDetection')}</p>
              <p className="text-xs text-muted-foreground">
                {t('export.formats.yoloDetectionDesc')}
              </p>
            </div>
          </Label>
        </div>

        <div className="flex items-center space-x-2 rounded-lg border p-3">
          <RadioGroupItem value="yolo-segmentation" id="format-yolo-segmentation" />
          <Label htmlFor="format-yolo-segmentation" className="flex-1 cursor-pointer">
            <div>
              <p className="font-medium">{t('export.formats.yoloSegmentation')}</p>
              <p className="text-xs text-muted-foreground">
                {t('export.formats.yoloSegmentationDesc')}
              </p>
            </div>
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}
