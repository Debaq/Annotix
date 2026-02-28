import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import type { GpuInfo } from '../types';

interface GpuIndicatorProps {
  gpuInfo: GpuInfo | null;
  loading?: boolean;
}

export function GpuIndicator({ gpuInfo, loading }: GpuIndicatorProps) {
  const { t } = useTranslation();

  if (loading) {
    return <Badge variant="secondary"><i className="fas fa-spinner fa-spin mr-1" /> {t('training.gpu.detecting')}</Badge>;
  }

  if (!gpuInfo) return null;

  if (gpuInfo.cudaAvailable && gpuInfo.gpus.length > 0) {
    const gpu = gpuInfo.gpus[0];
    return (
      <Badge variant="default" className="bg-green-600">
        <i className="fas fa-microchip mr-1" />
        {gpu.name} (CUDA {gpuInfo.cudaVersion})
      </Badge>
    );
  }

  if (gpuInfo.mpsAvailable) {
    return (
      <Badge variant="default" className="bg-blue-600">
        <i className="fas fa-microchip mr-1" /> Apple MPS
      </Badge>
    );
  }

  return (
    <Badge variant="secondary">
      <i className="fas fa-desktop mr-1" /> CPU
    </Badge>
  );
}
