import { useTranslation } from 'react-i18next';
import { useStorageEstimate } from '../hooks/useStorageEstimate';
import { Progress } from '@/components/ui/progress';

export function StorageIndicator() {
  const { t } = useTranslation();
  const { usage, quota, percentage } = useStorageEstimate();

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-xs text-muted-foreground">
          {t('storage.used')}: {formatBytes(usage)} / {formatBytes(quota)}
        </p>
        <Progress value={percentage} className="h-1 w-32" />
      </div>
      <i className="fas fa-database text-muted-foreground"></i>
    </div>
  );
}
