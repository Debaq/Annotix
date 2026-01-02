import { useTranslation } from 'react-i18next';
import { Progress } from '@/components/ui/progress';

interface ExportProgressProps {
  progress: number;
}

export function ExportProgress({ progress }: ExportProgressProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{t('export.progress')}</span>
        <span className="font-medium">{Math.round(progress)}%</span>
      </div>
      <Progress value={progress} />
    </div>
  );
}
