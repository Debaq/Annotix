import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { CloudProvider, CloudTrainingConfig, CloudProviderConfig } from '../types';
import { trainingService } from '../services/trainingService';

interface CloudProviderSelectorProps {
  selected: CloudProvider | null;
  onSelect: (provider: CloudProvider) => void;
  config: CloudTrainingConfig | null;
  onConfigChange: (config: CloudTrainingConfig) => void;
}

const PROVIDERS: { id: CloudProvider; icon: string; color: string }[] = [
  { id: 'kaggle', icon: 'fab fa-kaggle', color: 'sky' },
  { id: 'vertex_ai_custom', icon: 'fas fa-server', color: 'blue' },
  { id: 'colab_enterprise', icon: 'fas fa-laptop-code', color: 'amber' },
  { id: 'vertex_ai_gemini_tuning', icon: 'fas fa-gem', color: 'purple' },
];

const GCP_MACHINE_TYPES = [
  'n1-standard-4', 'n1-standard-8', 'n1-standard-16',
  'n1-highmem-4', 'n1-highmem-8',
  'a2-highgpu-1g', 'a2-highgpu-2g',
];

const GCP_ACCELERATORS = [
  'NVIDIA_TESLA_T4', 'NVIDIA_TESLA_V100', 'NVIDIA_TESLA_A100',
  'NVIDIA_A100_80GB', 'NVIDIA_H100_80GB',
];

const KAGGLE_ACCELERATORS = ['gpu', 'tpu', 'none'];

export function CloudProviderSelector({
  selected,
  onSelect,
  config,
  onConfigChange,
}: CloudProviderSelectorProps) {
  const { t } = useTranslation();
  const [cloudProviderConfig, setCloudProviderConfig] = useState<CloudProviderConfig>({});

  useEffect(() => {
    trainingService.getCloudProvidersConfig().then(setCloudProviderConfig).catch(() => {});
  }, []);

  const handleSelect = (provider: CloudProvider) => {
    onSelect(provider);
    const defaults: CloudTrainingConfig = {
      provider,
      machineType: 'n1-standard-4',
      acceleratorType: 'NVIDIA_TESLA_T4',
      acceleratorCount: 1,
      kaggleAccelerator: 'gpu',
      maxRuntimeSeconds: 21600,
    };
    onConfigChange(defaults);
  };

  const isConfigured = (provider: CloudProvider): boolean => {
    if (provider === 'kaggle') {
      return !!(cloudProviderConfig.kaggle?.username && cloudProviderConfig.kaggle?.apiKey);
    }
    return !!(cloudProviderConfig.gcp?.serviceAccountPath && cloudProviderConfig.gcp?.projectId);
  };

  const isGcpProvider = selected === 'vertex_ai_custom' || selected === 'colab_enterprise' || selected === 'vertex_ai_gemini_tuning';

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-medium mb-1">{t('training.cloud.selectProvider')}</h4>
        <p className="text-xs text-muted-foreground">{t('training.cloud.selectProviderDesc')}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => handleSelect(p.id)}
            className={`p-3 rounded-lg border-2 text-left transition-all ${
              selected === p.id
                ? `border-${p.color}-500 bg-${p.color}-500/10`
                : 'border-border hover:bg-accent/50'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <i className={`${p.icon} text-${p.color}-500`} />
                <span className="font-semibold text-xs">{t(`training.cloud.providers.${p.id}`)}</span>
              </div>
              {isConfigured(p.id) ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500">
                  {t('training.cloud.configured')}
                </span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">
                  {t('training.cloud.needsSetup')}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">{t(`training.cloud.providerDesc.${p.id}`)}</p>
          </button>
        ))}
      </div>

      {/* Provider-specific config */}
      {selected && config && (
        <div className="space-y-3 p-3 rounded-lg bg-accent/30">
          {isGcpProvider && (
            <>
              <div>
                <label className="text-xs font-medium">{t('training.cloud.machineType')}</label>
                <select
                  value={config.machineType || 'n1-standard-4'}
                  onChange={(e) => onConfigChange({ ...config, machineType: e.target.value })}
                  className="w-full mt-1 px-2 py-1.5 text-xs rounded border border-border bg-background"
                >
                  {GCP_MACHINE_TYPES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">{t('training.cloud.accelerator')}</label>
                <select
                  value={config.acceleratorType || 'NVIDIA_TESLA_T4'}
                  onChange={(e) => onConfigChange({ ...config, acceleratorType: e.target.value })}
                  className="w-full mt-1 px-2 py-1.5 text-xs rounded border border-border bg-background"
                >
                  {GCP_ACCELERATORS.map((a) => (
                    <option key={a} value={a}>{a.replace('NVIDIA_', '').replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">{t('training.cloud.acceleratorCount')}</label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={config.acceleratorCount || 1}
                  onChange={(e) => onConfigChange({ ...config, acceleratorCount: parseInt(e.target.value) || 1 })}
                  className="w-full mt-1 px-2 py-1.5 text-xs rounded border border-border bg-background"
                />
              </div>
            </>
          )}

          {selected === 'kaggle' && (
            <div>
              <label className="text-xs font-medium">{t('training.cloud.kaggleGpu')}</label>
              <select
                value={config.kaggleAccelerator || 'gpu'}
                onChange={(e) => onConfigChange({ ...config, kaggleAccelerator: e.target.value })}
                className="w-full mt-1 px-2 py-1.5 text-xs rounded border border-border bg-background"
              >
                {KAGGLE_ACCELERATORS.map((a) => (
                  <option key={a} value={a}>{a === 'gpu' ? 'GPU (T4/P100)' : a === 'tpu' ? 'TPU v3-8' : 'CPU'}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium">{t('training.cloud.maxRuntime')}</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={1}
                max={72}
                value={Math.round((config.maxRuntimeSeconds || 21600) / 3600)}
                onChange={(e) => onConfigChange({ ...config, maxRuntimeSeconds: (parseInt(e.target.value) || 6) * 3600 })}
                className="w-20 px-2 py-1.5 text-xs rounded border border-border bg-background"
              />
              <span className="text-xs text-muted-foreground">{t('training.cloud.hours')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
