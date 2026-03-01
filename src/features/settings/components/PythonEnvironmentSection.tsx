import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { settingsService } from '../services/settingsService';
import { trainingService } from '@/features/training/services/trainingService';
import type { VenvInfo, InstalledPackage, SystemGpuInfo, PackageUpdateProgress, PytorchInstallProgress } from '../types';

export function PythonEnvironmentSection() {
  const { t } = useTranslation();

  // State
  const [venvInfo, setVenvInfo] = useState<VenvInfo | null>(null);
  const [packages, setPackages] = useState<InstalledPackage[]>([]);
  const [gpuInfo, setGpuInfo] = useState<SystemGpuInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingVenv, setCreatingVenv] = useState(false);
  const [removingVenv, setRemovingVenv] = useState(false);
  const [updatingPackages, setUpdatingPackages] = useState(false);
  const [installingPytorch, setInstallingPytorch] = useState(false);
  const [setupProgress, setSetupProgress] = useState<{ message: string; progress: number } | null>(null);
  const [packageProgress, setPackageProgress] = useState<PackageUpdateProgress | null>(null);
  const [pytorchProgress, setPytorchProgress] = useState<PytorchInstallProgress | null>(null);
  const [selectedCuda, setSelectedCuda] = useState<string>('cpu');
  const [error, setError] = useState<string | null>(null);

  // Torch info from env check
  const [torchVersion, setTorchVersion] = useState<string | null>(null);
  const [cudaAvailable, setCudaAvailable] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [info, gpu] = await Promise.all([
        settingsService.getVenvInfo(),
        settingsService.detectSystemGpu(),
      ]);
      setVenvInfo(info);
      setGpuInfo(gpu);

      if (gpu.suggestedCuda) {
        setSelectedCuda(gpu.suggestedCuda);
      }

      if (info.exists) {
        const pkgs = await settingsService.listInstalledPackages();
        setPackages(pkgs);

        // Get torch/cuda info via training env check
        try {
          const envInfo = await trainingService.checkPythonEnv();
          setTorchVersion(envInfo.env.torchVersion);
          setCudaAvailable(envInfo.env.cudaAvailable);
        } catch {
          // torch info not critical
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Listen for progress events
  useEffect(() => {
    const unlistenSetup = listen<{ message: string; progress: number }>(
      'training:env-setup-progress',
      (event) => setSetupProgress(event.payload)
    );
    const unlistenPkg = listen<PackageUpdateProgress>(
      'settings:package-update-progress',
      (event) => setPackageProgress(event.payload)
    );
    const unlistenPytorch = listen<PytorchInstallProgress>(
      'settings:pytorch-install-progress',
      (event) => setPytorchProgress(event.payload)
    );

    return () => {
      unlistenSetup.then(fn => fn());
      unlistenPkg.then(fn => fn());
      unlistenPytorch.then(fn => fn());
    };
  }, []);

  const handleCreateVenv = async () => {
    setCreatingVenv(true);
    setError(null);
    try {
      await trainingService.setupPythonEnv();
      setSetupProgress(null);
      await loadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreatingVenv(false);
      setSetupProgress(null);
    }
  };

  const handleRemoveVenv = async () => {
    setRemovingVenv(true);
    setError(null);
    try {
      await settingsService.removeVenv();
      setPackages([]);
      setTorchVersion(null);
      setCudaAvailable(false);
      await loadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setRemovingVenv(false);
    }
  };

  const handleUpdatePackages = async () => {
    setUpdatingPackages(true);
    setError(null);
    try {
      await settingsService.updatePackages(['ultralytics', 'torch', 'torchvision', 'torchaudio']);
      setPackageProgress(null);
      await loadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setUpdatingPackages(false);
      setPackageProgress(null);
    }
  };

  const handleInstallPytorch = async () => {
    setInstallingPytorch(true);
    setError(null);
    try {
      await settingsService.installPytorch(selectedCuda);
      setPytorchProgress(null);
      await loadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setInstallingPytorch(false);
      setPytorchProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 p-12">
        <i className="fas fa-spinner fa-spin text-2xl text-blue-500" />
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 text-sm">
          <i className="fas fa-exclamation-circle mr-2" />
          {error}
        </div>
      )}

      {/* Card 1: System Python */}
      <div className="rounded-lg border border-[var(--annotix-border)] bg-white p-5">
        <h3 className="text-sm font-semibold text-[var(--annotix-dark)] mb-3 flex items-center gap-2">
          <i className="fas fa-terminal text-blue-500" />
          {t('settings.pythonEnv.systemPython')}
        </h3>
        {venvInfo?.systemPython ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <i className="fas fa-check-circle" />
            <span>{t('settings.pythonEnv.systemPythonFound', { python: venvInfo.systemPython })}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <i className="fas fa-exclamation-triangle" />
            <span>{t('settings.pythonEnv.systemPythonNotFound')}</span>
          </div>
        )}
      </div>

      {/* Card 2: Virtual Environment */}
      <div className="rounded-lg border border-[var(--annotix-border)] bg-white p-5">
        <h3 className="text-sm font-semibold text-[var(--annotix-dark)] mb-3 flex items-center gap-2">
          <i className="fas fa-box text-purple-500" />
          {t('settings.pythonEnv.venv')}
        </h3>

        {creatingVenv && setupProgress ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <i className="fas fa-cog fa-spin text-blue-500" />
              <p className="text-sm">{setupProgress.message}</p>
            </div>
            <Progress value={setupProgress.progress} />
          </div>
        ) : venvInfo?.exists ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">{t('settings.pythonEnv.status')}:</span>
                <span className="ml-2 text-green-600 font-medium">{t('settings.pythonEnv.active')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('settings.pythonEnv.pythonVersion')}:</span>
                <span className="ml-2 font-mono">{venvInfo.pythonVersion || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('settings.pythonEnv.diskUsage')}:</span>
                <span className="ml-2 font-mono">{venvInfo.diskUsageHuman}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">{t('settings.pythonEnv.path')}:</span>
                <span className="ml-2 font-mono text-xs break-all">{venvInfo.path}</span>
              </div>
            </div>
            <div className="pt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveVenv}
                disabled={removingVenv}
              >
                {removingVenv ? (
                  <i className="fas fa-spinner fa-spin mr-2" />
                ) : (
                  <i className="fas fa-trash mr-2" />
                )}
                {t('settings.pythonEnv.removeVenv')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('settings.pythonEnv.venvNotExists')}</p>
            <Button
              onClick={handleCreateVenv}
              disabled={creatingVenv || !venvInfo?.systemPython}
            >
              {creatingVenv ? (
                <i className="fas fa-spinner fa-spin mr-2" />
              ) : (
                <i className="fas fa-plus mr-2" />
              )}
              {t('settings.pythonEnv.createVenv')}
            </Button>
          </div>
        )}
      </div>

      {/* Card 3: Installed Packages (solo si venv existe) */}
      {venvInfo?.exists && (
        <div className="rounded-lg border border-[var(--annotix-border)] bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[var(--annotix-dark)] flex items-center gap-2">
              <i className="fas fa-cubes text-orange-500" />
              {t('settings.packages.title')}
              <span className="text-xs font-normal text-muted-foreground">({packages.length})</span>
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUpdatePackages}
              disabled={updatingPackages}
            >
              {updatingPackages ? (
                <i className="fas fa-spinner fa-spin mr-2" />
              ) : (
                <i className="fas fa-sync mr-2" />
              )}
              {t('settings.packages.updateAll')}
            </Button>
          </div>

          {updatingPackages && packageProgress && (
            <div className="mb-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <i className="fas fa-cog fa-spin text-blue-500" />
                <span>{packageProgress.message}</span>
              </div>
              <Progress value={packageProgress.progress} />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto border border-[var(--annotix-border)] rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium text-muted-foreground">{t('settings.packages.name')}</th>
                  <th className="text-left p-2 font-medium text-muted-foreground">{t('settings.packages.version')}</th>
                </tr>
              </thead>
              <tbody>
                {packages.map((pkg) => (
                  <tr key={pkg.name} className="border-t border-[var(--annotix-border)] hover:bg-gray-50">
                    <td className="p-2 font-mono text-xs">{pkg.name}</td>
                    <td className="p-2 font-mono text-xs">{pkg.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Card 4: PyTorch (solo si venv existe) */}
      {venvInfo?.exists && (
        <div className="rounded-lg border border-[var(--annotix-border)] bg-white p-5">
          <h3 className="text-sm font-semibold text-[var(--annotix-dark)] mb-3 flex items-center gap-2">
            <i className="fas fa-fire text-red-500" />
            {t('settings.pytorch.title')}
          </h3>

          {/* Current torch info */}
          {torchVersion && (
            <div className="mb-4 p-3 rounded bg-gray-50 text-sm space-y-1">
              <div>
                <span className="text-muted-foreground">PyTorch:</span>
                <span className="ml-2 font-mono">{torchVersion}</span>
              </div>
              <div>
                <span className="text-muted-foreground">CUDA:</span>
                <span className={`ml-2 font-medium ${cudaAvailable ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {cudaAvailable ? t('settings.pytorch.cudaActive') : t('settings.pytorch.cpuOnly')}
                </span>
              </div>
            </div>
          )}

          {/* System GPU detection */}
          {gpuInfo && (
            <div className="mb-4 p-3 rounded bg-gray-50 text-sm">
              {gpuInfo.hasNvidia ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-green-600">
                    <i className="fas fa-microchip" />
                    <span className="font-medium">{t('settings.pytorch.nvidiaDetected')}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {t('settings.pytorch.driverVersion')}: <span className="font-mono">{gpuInfo.nvidiaDriverVersion}</span>
                  </div>
                  {gpuInfo.suggestedCuda && (
                    <div className="text-muted-foreground">
                      {t('settings.pytorch.suggestedCuda')}: <span className="font-mono">CUDA {gpuInfo.suggestedCuda}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <i className="fas fa-desktop" />
                  <span>{t('settings.pytorch.noNvidia')}</span>
                </div>
              )}
            </div>
          )}

          {/* CUDA variant selector */}
          <div className="mb-4 space-y-2">
            <label className="text-sm font-medium text-[var(--annotix-dark)]">
              {t('settings.pytorch.selectVariant')}
            </label>
            <div className="flex gap-3">
              {[
                { value: 'cpu', label: 'CPU Only' },
                { value: '12.1', label: 'CUDA 12.1' },
                { value: '12.4', label: 'CUDA 12.4' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm ${
                    selectedCuda === opt.value
                      ? 'border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/10 text-[var(--annotix-primary)]'
                      : 'border-[var(--annotix-border)] hover:border-[var(--annotix-primary)]/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="cuda-variant"
                    value={opt.value}
                    checked={selectedCuda === opt.value}
                    onChange={(e) => setSelectedCuda(e.target.value)}
                    className="sr-only"
                  />
                  <div className={`w-3 h-3 rounded-full border-2 ${
                    selectedCuda === opt.value
                      ? 'border-[var(--annotix-primary)] bg-[var(--annotix-primary)]'
                      : 'border-gray-300'
                  }`} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {installingPytorch && pytorchProgress ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <i className="fas fa-cog fa-spin text-blue-500" />
                <span>{pytorchProgress.message}</span>
              </div>
              <Progress value={pytorchProgress.progress} />
            </div>
          ) : (
            <Button onClick={handleInstallPytorch} disabled={installingPytorch}>
              {installingPytorch ? (
                <i className="fas fa-spinner fa-spin mr-2" />
              ) : (
                <i className="fas fa-download mr-2" />
              )}
              {torchVersion ? t('settings.pytorch.reinstall') : t('settings.pytorch.install')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
