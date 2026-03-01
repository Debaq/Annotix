import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { settingsService } from '../services/settingsService';
import { trainingService } from '@/features/training/services/trainingService';
import type { VenvInfo, InstalledPackage, SystemGpuInfo, PackageUpdateProgress, PytorchInstallProgress } from '../types';
import { TerminalConsole } from './TerminalConsole';

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
  const [setupProgress, setSetupProgress] = useState<{ message: string; progress: number; log?: string } | null>(null);
  const [packageProgress, setPackageProgress] = useState<PackageUpdateProgress & { log?: string } | null>(null);
  const [pytorchProgress, setPytorchProgress] = useState<PytorchInstallProgress & { log?: string } | null>(null);
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  const [selectedCuda, setSelectedCuda] = useState<string>('cpu');
  const [selectedPython, setSelectedPython] = useState<string>('3.10');
  const [isDesktop, setIsDesktop] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Torch info from env check
  const [torchVersion, setTorchVersion] = useState<string | null>(null);
  const [cudaAvailable, setCudaAvailable] = useState(false);

  useEffect(() => {
    // Check if we are on a desktop platform
    // @ts-ignore
    const platform = window.__TAURI_INTERNALS__?.metadata?.platform || 'desktop';
    if (platform === 'android' || platform === 'ios') {
      setIsDesktop(false);
    }
  }, []);

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
    const unlistenSetup = listen<{ message: string; progress: number; log?: string }>(
      'training:env-setup-progress',
      (event) => {
        setSetupProgress(event.payload);
        if (event.payload.log) setInstallLogs(prev => [...prev, event.payload.log!]);
      }
    );
    const unlistenPkg = listen<PackageUpdateProgress & { log?: string }>(
      'settings:package-update-progress',
      (event) => {
        setPackageProgress(event.payload);
        if (event.payload.log) setInstallLogs(prev => [...prev, event.payload.log!]);
      }
    );
    const unlistenPytorch = listen<PytorchInstallProgress & { log?: string }>(
      'settings:pytorch-install-progress',
      (event) => {
        setPytorchProgress(event.payload);
        if (event.payload.log) setInstallLogs(prev => [...prev, event.payload.log!]);
      }
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
    setInstallLogs([]);
    try {
      await trainingService.setupPythonEnv(selectedPython);
      setSetupProgress(null);
      await loadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setCreatingVenv(false);
    }
  };

  const handleRemoveVenv = async () => {
    if (!confirm(t('common.deleteConfirm'))) return;
    setRemovingVenv(true);
    try {
      await settingsService.removeVenv();
      await loadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setRemovingVenv(false);
    }
  };

  const handleUpdatePackages = async () => {
    setUpdatingPackages(true);
    setInstallLogs([]);
    try {
      const names = packages.map(p => p.name);
      await settingsService.updatePackages(names);
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
    setInstallLogs([]);
    try {
      await settingsService.installPytorch(selectedCuda);
      await loadAll();
    } catch (e) {
      setError(String(e));
    } finally {
      setInstallingPytorch(false);
      setPytorchProgress(null);
    }
  };

  if (loading && !venvInfo) {
    return <div className="p-8 text-center text-muted-foreground">{t('common.loading')}</div>;
  }

  if (!isDesktop) {
    return (
      <div className="p-8 text-center bg-amber-50 border border-amber-100 rounded-xl max-w-2xl mx-auto">
        <i className="fas fa-desktop text-4xl text-amber-400 mb-4" />
        <h3 className="text-lg font-bold text-amber-900">Característica no disponible</h3>
        <p className="text-amber-800 mt-2">
          La gestión de entornos Python locales y el entrenamiento de modelos solo están disponibles en las versiones de escritorio (Windows, macOS, Linux).
        </p>
      </div>
    );
  }

  const isBusy = creatingVenv || updatingPackages || installingPytorch;

  return (
    <div className="space-y-6 max-w-4xl">
      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm flex items-center gap-2">
          <i className="fas fa-exclamation-circle" />
          {error}
        </div>
      )}

      {/* Card 1: Virtual Environment Status */}
      <div className="rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] p-5 transition-colors">
        <h3 className="text-sm font-semibold text-[var(--annotix-dark)] mb-3 flex items-center gap-2">
          <i className="fas fa-box text-purple-500" />
          {t('settings.pythonEnv.venv')}
        </h3>

        {creatingVenv ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <i className="fas fa-cog fa-spin text-[var(--annotix-primary)]" />
              <p className="text-sm font-medium">
                {setupProgress?.message || t('common.starting')}
              </p>
            </div>
            <Progress value={setupProgress?.progress ?? 5} className="h-2" />
            <p className="text-[10px] text-muted-foreground animate-pulse italic">
              {t('settings.pythonEnv.pleaseWait')}
            </p>
            <TerminalConsole logs={installLogs} />
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
                <span className="ml-2 font-mono text-[10px] break-all text-[var(--annotix-dark)] opacity-70">{venvInfo.path}</span>
              </div>
            </div>
            <div className="pt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveVenv}
                disabled={isBusy || removingVenv}
              >
                {removingVenv ? <i className="fas fa-spinner fa-spin mr-2" /> : <i className="fas fa-trash mr-2" />}
                {t('settings.pythonEnv.removeVenv')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-center py-6 bg-[var(--annotix-light)] rounded-lg border border-dashed border-[var(--annotix-border)]">
            <div className="max-w-xs mx-auto space-y-3">
              <p className="text-sm text-muted-foreground px-4">{t('settings.pythonEnv.venvNotExists')}</p>
              
              <div className="text-left bg-[var(--annotix-white)] p-3 rounded-lg border border-[var(--annotix-border)]">
                <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">Versión de Python</span>
                <select 
                  value={selectedPython}
                  onChange={(e) => setSelectedPython(e.target.value)}
                  className="w-full h-9 rounded-md border border-[var(--annotix-border)] bg-[var(--annotix-white)] text-sm px-2 outline-none focus:border-[var(--annotix-primary)]"
                  disabled={isBusy}
                >
                  <option value="3.9">Python 3.9 (Estable ML)</option>
                  <option value="3.10">Python 3.10 (Recomendado)</option>
                  <option value="3.11">Python 3.11 (Más rápido)</option>
                </select>
              </div>

              <Button
                onClick={handleCreateVenv}
                disabled={isBusy}
                className="w-full"
              >
                <i className="fas fa-plus mr-2" />
                {t('settings.pythonEnv.createVenv')}
              </Button>
              
              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-medium">Powered by</span>
                <div className="flex items-center gap-1 opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all cursor-default">
                  <i className="fas fa-snake text-[10px] text-yellow-500" />
                  <span className="text-[10px] font-bold bg-gradient-to-r from-yellow-600 to-green-600 bg-clip-text text-transparent">micromamba</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Card 2: PyTorch & GPU Hardware */}
      {venvInfo?.exists && (
        <div className="rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] p-5 transition-colors">
          <h3 className="text-sm font-semibold text-[var(--annotix-dark)] mb-3 flex items-center gap-2">
            <i className="fas fa-microchip text-red-500" />
            PyTorch & Hardware
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="p-3 rounded-lg bg-[var(--annotix-light)] border border-[var(--annotix-border)]">
              <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">Entorno Actual</span>
              <div className="flex items-center justify-between">
                <span className="text-sm font-mono">{torchVersion || 'No instalado'}</span>
                {cudaAvailable && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-bold">CUDA OK</span>
                )}
              </div>
            </div>
            
            <div className="p-3 rounded-lg bg-[var(--annotix-light)] border border-[var(--annotix-border)]">
              <span className="text-[10px] text-muted-foreground uppercase font-bold block mb-1">Hardware Detectado</span>
              <div className="flex items-center gap-2">
                {gpuInfo?.hasNvidia ? (
                  <i className="fas fa-check-circle text-green-600 text-xs" />
                ) : (
                  <i className="fas fa-info-circle text-blue-500 text-xs" />
                )}
                <span className="text-xs">
                  {gpuInfo?.hasNvidia ? `NVIDIA (${gpuInfo.nvidiaDriverVersion})` : 'Solo CPU / Integrada'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <span className="text-xs text-muted-foreground block mb-1">Variante de Instalación</span>
                <select 
                  value={selectedCuda}
                  onChange={(e) => setSelectedCuda(e.target.value)}
                  className="w-full h-9 rounded-md border border-[var(--annotix-border)] bg-[var(--annotix-white)] text-sm px-2 outline-none focus:border-[var(--annotix-primary)]"
                  disabled={isBusy}
                >
                  <option value="cpu">CPU (Universal)</option>
                  <option value="12.1">CUDA 12.1 (NVIDIA)</option>
                  <option value="12.4">CUDA 12.4 (NVIDIA)</option>
                </select>
              </div>
              <Button 
                onClick={handleInstallPytorch}
                disabled={isBusy}
                className="mt-5"
              >
                {installingPytorch ? <i className="fas fa-spinner fa-spin mr-2" /> : <i className="fas fa-download mr-2" />}
                {torchVersion ? 'Reinstalar' : 'Instalar'}
              </Button>
            </div>

            {installingPytorch && (
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span>{pytorchProgress?.message || 'Iniciando...'}</span>
                  <span>{Math.round(pytorchProgress?.progress || 0)}%</span>
                </div>
                <Progress value={pytorchProgress?.progress ?? 5} className="h-1.5" />
                <TerminalConsole logs={installLogs} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Card 3: Packages Table */}
      {venvInfo?.exists && (
        <div className="rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] p-5 transition-colors">
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
              disabled={isBusy || updatingPackages}
            >
              {updatingPackages ? <i className="fas fa-spinner fa-spin mr-2" /> : <i className="fas fa-sync mr-2" />}
              {t('settings.packages.updateAll')}
            </Button>
          </div>

          {updatingPackages && (
            <div className="mb-3 space-y-2">
              <Progress value={packageProgress?.progress ?? 5} className="h-1.5" />
              <TerminalConsole logs={installLogs} maxHeight="120px" />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto border border-[var(--annotix-border)] rounded transition-colors">
            <table className="w-full text-xs">
              <thead className="bg-[var(--annotix-light)] sticky top-0 transition-colors">
                <tr>
                  <th className="text-left p-2 font-medium text-muted-foreground">{t('settings.packages.name')}</th>
                  <th className="text-left p-2 font-medium text-muted-foreground text-right">{t('settings.packages.version')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--annotix-border)]">
                {packages.map((pkg) => (
                  <tr key={pkg.name} className="hover:bg-[var(--annotix-light)] transition-colors">
                    <td className="p-2 font-mono">{pkg.name}</td>
                    <td className="p-2 font-mono text-right text-muted-foreground">{pkg.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
