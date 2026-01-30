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
  const tixFormats = validFormats.filter((format) => format === 'tix');
  const otherFormats = validFormats.filter((format) => format !== 'tix');

  return (
    <div className="space-y-2">
      <Label>{t('export.format')}</Label>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as ExportFormat)} className="space-y-4">
        {tixFormats.length > 0 && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
              {t('export.formats.tixGroupTitle')}
            </p>
            {tixFormats.map((format) => {
              const formatInfo = FORMAT_INFO[format];
              return (
                <div key={format} className="flex items-center space-x-2 rounded-lg border border-primary/30 bg-white/60 p-3">
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
          </div>
        )}

        {otherFormats.length > 0 && (
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('export.formats.trainingGroupTitle')}
            </p>
            <div className="grid max-h-[45vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {otherFormats.map((format) => {
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
            </div>
          </div>
        )}
      </RadioGroup>
    </div>
  );
}
