import { useTranslation } from 'react-i18next';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ClassDefinition } from '@/lib/db';

interface LabelSelectorProps {
  classes: ClassDefinition[];
  selectedLabels: number[];
  onToggle: (classId: number) => void;
  multiLabel?: boolean;
}

export function LabelSelector({
  classes,
  selectedLabels,
  onToggle,
  multiLabel = false,
}: LabelSelectorProps) {
  const { t } = useTranslation();

  if (multiLabel) {
    return (
      <div className="space-y-3">
        <Label className="text-sm font-medium">
          {t('classification.selectLabels')}
        </Label>
        <div className="space-y-2">
          {classes.map((cls) => (
            <div key={cls.id} className="flex items-center space-x-3">
              <Checkbox
                id={`class-${cls.id}`}
                checked={selectedLabels.includes(cls.id)}
                onCheckedChange={() => onToggle(cls.id)}
              />
              <label
                htmlFor={`class-${cls.id}`}
                className="flex items-center gap-2 cursor-pointer text-sm"
              >
                <div
                  className="w-4 h-4 rounded border"
                  style={{ backgroundColor: cls.color }}
                />
                <span>{cls.name}</span>
              </label>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{t('classification.selectLabel')}</Label>
      <RadioGroup
        value={selectedLabels[0]?.toString() || ''}
        onValueChange={(value) => onToggle(parseInt(value))}
      >
        {classes.map((cls) => (
          <div key={cls.id} className="flex items-center space-x-3">
            <RadioGroupItem value={cls.id.toString()} id={`radio-${cls.id}`} />
            <label
              htmlFor={`radio-${cls.id}`}
              className="flex items-center gap-2 cursor-pointer text-sm"
            >
              <div
                className="w-4 h-4 rounded border"
                style={{ backgroundColor: cls.color }}
              />
              <span>{cls.name}</span>
            </label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );
}
