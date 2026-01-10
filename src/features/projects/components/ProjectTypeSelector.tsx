import { useTranslation } from 'react-i18next';
import { ProjectType } from '@/lib/db';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import '@/styles/projects.css';

interface ProjectTypeSelectorProps {
  value: ProjectType;
  onChange: (type: ProjectType) => void;
}

interface ProjectTypeOption {
  value: ProjectType;
  icon: string;
  colorClass: string;
}

export function ProjectTypeSelector({ value, onChange }: ProjectTypeSelectorProps) {
  const { t } = useTranslation();

  const imageTypes: ProjectTypeOption[] = [
    { value: 'bbox', icon: 'fa-vector-square', colorClass: 'bg-blue-100 text-blue-600' },
    { value: 'mask', icon: 'fa-paintbrush', colorClass: 'bg-purple-100 text-purple-600' },
    { value: 'polygon', icon: 'fa-draw-polygon', colorClass: 'bg-green-100 text-green-600' },
    { value: 'keypoints', icon: 'fa-sitemap', colorClass: 'bg-orange-100 text-orange-600' },
    { value: 'landmarks', icon: 'fa-location-dot', colorClass: 'bg-red-100 text-red-600' },
    { value: 'obb', icon: 'fa-rotate', colorClass: 'bg-indigo-100 text-indigo-600' },
  ];

  const classificationTypes: ProjectTypeOption[] = [
    { value: 'classification', icon: 'fa-tag', colorClass: 'bg-yellow-100 text-yellow-600' },
    { value: 'multi-label-classification', icon: 'fa-tags', colorClass: 'bg-amber-100 text-amber-600' },
  ];

  const timeSeriesTypes: ProjectTypeOption[] = [
    { value: 'timeseries-classification', icon: 'fa-chart-line', colorClass: 'bg-cyan-100 text-cyan-600' },
    { value: 'timeseries-forecasting', icon: 'fa-chart-area', colorClass: 'bg-teal-100 text-teal-600' },
    { value: 'anomaly-detection', icon: 'fa-exclamation-triangle', colorClass: 'bg-rose-100 text-rose-600' },
    { value: 'timeseries-segmentation', icon: 'fa-layer-group', colorClass: 'bg-emerald-100 text-emerald-600' },
    { value: 'pattern-recognition', icon: 'fa-waveform', colorClass: 'bg-violet-100 text-violet-600' },
    { value: 'event-detection', icon: 'fa-bolt', colorClass: 'bg-fuchsia-100 text-fuchsia-600' },
    { value: 'timeseries-regression', icon: 'fa-chart-scatter', colorClass: 'bg-sky-100 text-sky-600' },
    { value: 'clustering', icon: 'fa-circle-nodes', colorClass: 'bg-lime-100 text-lime-600' },
    { value: 'imputation', icon: 'fa-fill-drip', colorClass: 'bg-pink-100 text-pink-600' },
  ];

  const renderOption = (option: ProjectTypeOption) => (
    <div key={option.value} className="project-type-card">
      <RadioGroupItem value={option.value} id={`type-${option.value}`}  />
      <Label htmlFor={`type-${option.value}`} className="flex-1 cursor-pointer">
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${option.colorClass}`}>
            <i className={`fas ${option.icon} text-sm`}></i>
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">{t(`project.types.${option.value}.name`)}</p>
            <p className="text-xs text-muted-foreground">
              {t(`project.types.${option.value}.description`)}
            </p>
          </div>
        </div>
      </Label>
    </div>
  );

  return (
    <div className="space-y-3">
      <RadioGroup value={value} onValueChange={(v) => onChange(v as ProjectType)} >
        {/* Image Annotation Types */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground px-1">
            {t('project.categories.images')}
          </h4>
          <div className="project-type-grid">
            {imageTypes.map(renderOption)}
          </div>
        </div>

        <Separator className="my-4" />

        {/* Classification Types */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground px-1">
            {t('project.categories.classification')}
          </h4>
          <div className="project-type-grid">
            {classificationTypes.map(renderOption)}
          </div>
        </div>

        <Separator className="my-4" />

        {/* Time Series Types */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground px-1">
            {t('project.categories.timeSeries')}
          </h4>
          <div className="project-type-grid">
            {timeSeriesTypes.map(renderOption)}
          </div>
        </div>
      </RadioGroup>
    </div>
  );
}
