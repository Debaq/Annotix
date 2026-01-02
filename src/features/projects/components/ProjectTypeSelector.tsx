import { useTranslation } from 'react-i18next';
import { ProjectType } from '@/lib/db';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ProjectTypeSelectorProps {
  value: ProjectType;
  onChange: (type: ProjectType) => void;
}

export function ProjectTypeSelector({ value, onChange }: ProjectTypeSelectorProps) {
  const { t } = useTranslation();

  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as ProjectType)}>
      <div className="flex items-center space-x-2 rounded-lg border p-4">
        <RadioGroupItem value="bbox" id="type-bbox" />
        <Label htmlFor="type-bbox" className="flex-1 cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <i className="fas fa-vector-square"></i>
            </div>
            <div>
              <p className="font-medium">{t('project.type.bbox')}</p>
              <p className="text-xs text-muted-foreground">
                {t('project.type.bboxDescription')}
              </p>
            </div>
          </div>
        </Label>
      </div>

      <div className="flex items-center space-x-2 rounded-lg border p-4">
        <RadioGroupItem value="mask" id="type-mask" />
        <Label htmlFor="type-mask" className="flex-1 cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 text-purple-600">
              <i className="fas fa-paintbrush"></i>
            </div>
            <div>
              <p className="font-medium">{t('project.type.mask')}</p>
              <p className="text-xs text-muted-foreground">
                {t('project.type.maskDescription')}
              </p>
            </div>
          </div>
        </Label>
      </div>
    </RadioGroup>
  );
}
