import { useTranslation } from 'react-i18next';
import { ExportFormat, FORMAT_INFO } from '../utils/formatMapping';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface FormatSelectorProps {
  value: ExportFormat;
  onChange: (format: ExportFormat) => void;
  validFormats: ExportFormat[];
}

export function FormatSelector({ value, onChange, validFormats }: FormatSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <Label>{t('export.format')}</Label>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as ExportFormat)}>
        {validFormats.map((format) => {
          const formatInfo = FORMAT_INFO[format];
          return (
            <div key={format} className="flex items-center space-x-2 rounded-lg border p-3">
              <RadioGroupItem value={format} id={`format-${format}`} />
              <Label htmlFor={`format-${format}`} className="flex-1 cursor-pointer">
                <div>
                  <p className="font-medium">{t(formatInfo.labelKey)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(formatInfo.descriptionKey)}
                  </p>
                </div>
              </Label>
            </div>
          );
        })}
      </RadioGroup>
    </div>
  );
}
