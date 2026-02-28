import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { usePythonEnv } from '../hooks/usePythonEnv';

interface PythonEnvSetupProps {
  onReady: () => void;
}

export function PythonEnvSetup({ onReady }: PythonEnvSetupProps) {
  const { t } = useTranslation();
  const { envStatus, loading, setupProgress, error, checkEnv, setupEnv } = usePythonEnv();

  useEffect(() => {
    checkEnv().then((status) => {
      if (status?.installed) onReady();
    });
  }, [checkEnv, onReady]);

  if (loading && !setupProgress) {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <i className="fas fa-spinner fa-spin text-2xl text-blue-500" />
        <p className="text-sm text-muted-foreground">{t('training.env.checking')}</p>
      </div>
    );
  }

  if (setupProgress) {
    return (
      <div className="flex flex-col gap-4 p-8">
        <div className="flex items-center gap-3">
          <i className="fas fa-cog fa-spin text-blue-500" />
          <p className="text-sm font-medium">{setupProgress.message}</p>
        </div>
        <Progress value={setupProgress.progress} />
        <p className="text-xs text-muted-foreground">{t('training.env.setupHint')}</p>
      </div>
    );
  }

  if (envStatus?.installed) {
    return (
      <div className="flex flex-col gap-3 p-6 bg-green-500/10 border border-green-500/20 rounded-lg">
        <div className="flex items-center gap-2 text-green-600">
          <i className="fas fa-check-circle" />
          <span className="font-medium">{t('training.env.ready')}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>Ultralytics: {envStatus.ultralyticsVersion}</span>
          <span>PyTorch: {envStatus.torchVersion}</span>
          {envStatus.cudaAvailable && <span className="text-green-600">CUDA: Available</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 bg-amber-500/10 border border-amber-500/20 rounded-lg">
      <div className="flex items-center gap-2 text-amber-600">
        <i className="fas fa-exclamation-triangle" />
        <span className="font-medium">{t('training.env.notInstalled')}</span>
      </div>
      <p className="text-sm text-muted-foreground">{t('training.env.description')}</p>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      <Button onClick={setupEnv} disabled={loading}>
        <i className="fas fa-download mr-2" />
        {t('training.env.setup')}
      </Button>
    </div>
  );
}
