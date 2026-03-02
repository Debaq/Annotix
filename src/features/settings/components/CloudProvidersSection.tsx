import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { trainingService } from '../../training/services/trainingService';
import type { GcpConfig, KaggleConfig } from '../../training/types';

export function CloudProvidersSection() {
  const { t } = useTranslation();

  const [gcp, setGcp] = useState<GcpConfig>({});
  const [kaggle, setKaggle] = useState<KaggleConfig>({});
  const [gcpExpanded, setGcpExpanded] = useState(true);
  const [kaggleExpanded, setKaggleExpanded] = useState(true);
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<Record<string, 'success' | 'error' | null>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    trainingService.getCloudProvidersConfig().then((config) => {
      if (config.gcp) setGcp(config.gcp);
      if (config.kaggle) setKaggle(config.kaggle);
    }).catch(() => {});
  }, []);

  const handleSaveGcp = async () => {
    setSaving(true);
    try {
      await trainingService.saveCloudProviderConfig('gcp', gcp as unknown as Record<string, unknown>);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleSaveKaggle = async () => {
    setSaving(true);
    try {
      await trainingService.saveCloudProviderConfig('kaggle', kaggle as unknown as Record<string, unknown>);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleValidate = async (provider: string) => {
    setValidating(provider);
    setValidationResult((prev) => ({ ...prev, [provider]: null }));
    try {
      await trainingService.validateCloudCredentials(provider);
      setValidationResult((prev) => ({ ...prev, [provider]: 'success' }));
    } catch {
      setValidationResult((prev) => ({ ...prev, [provider]: 'error' }));
    }
    setValidating(null);
  };

  const handlePickSaFile = async () => {
    const file = await open({
      filters: [{ name: 'JSON', extensions: ['json'] }],
      multiple: false,
    });
    if (file) {
      setGcp((prev) => ({ ...prev, serviceAccountPath: file as string }));
    }
  };

  const GCP_REGIONS = [
    'us-central1', 'us-east1', 'us-west1', 'europe-west1', 'europe-west4',
    'asia-east1', 'asia-northeast1', 'asia-southeast1',
  ];

  return (
    <div className="space-y-6">
      {/* GCP Section */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setGcpExpanded(!gcpExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between bg-accent/30 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <i className="fab fa-google text-blue-500" />
            <span className="font-medium text-sm">{t('settings.cloud.gcp.title')}</span>
            {gcp.serviceAccountPath && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500">
                {t('training.cloud.configured')}
              </span>
            )}
          </div>
          <i className={`fas fa-chevron-${gcpExpanded ? 'up' : 'down'} text-xs text-muted-foreground`} />
        </button>

        {gcpExpanded && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">{t('settings.cloud.gcp.description')}</p>

            <div>
              <label className="text-xs font-medium block mb-1">{t('settings.cloud.gcp.serviceAccount')}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={gcp.serviceAccountPath || ''}
                  readOnly
                  placeholder={t('settings.cloud.gcp.serviceAccountPlaceholder')}
                  className="flex-1 px-3 py-2 text-xs rounded border border-border bg-background"
                />
                <button
                  onClick={handlePickSaFile}
                  className="px-3 py-2 text-xs rounded border border-border hover:bg-accent transition-colors"
                >
                  <i className="fas fa-folder-open mr-1" />
                  {t('common.browse')}
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">{t('settings.cloud.gcp.projectId')}</label>
              <input
                type="text"
                value={gcp.projectId || ''}
                onChange={(e) => setGcp((prev) => ({ ...prev, projectId: e.target.value }))}
                placeholder="my-gcp-project"
                className="w-full px-3 py-2 text-xs rounded border border-border bg-background"
              />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">{t('settings.cloud.gcp.region')}</label>
              <select
                value={gcp.region || 'us-central1'}
                onChange={(e) => setGcp((prev) => ({ ...prev, region: e.target.value }))}
                className="w-full px-3 py-2 text-xs rounded border border-border bg-background"
              >
                {GCP_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">{t('settings.cloud.gcp.bucket')}</label>
              <input
                type="text"
                value={gcp.gcsBucket || ''}
                onChange={(e) => setGcp((prev) => ({ ...prev, gcsBucket: e.target.value }))}
                placeholder="my-training-bucket"
                className="w-full px-3 py-2 text-xs rounded border border-border bg-background"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveGcp}
                disabled={saving}
                className="px-4 py-2 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              >
                {t('common.save')}
              </button>
              <button
                onClick={() => handleValidate('gcp')}
                disabled={!!validating || !gcp.serviceAccountPath}
                className="px-4 py-2 text-xs rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                {validating === 'gcp' ? (
                  <><i className="fas fa-spinner fa-spin mr-1" />{t('settings.cloud.validating')}</>
                ) : (
                  <><i className="fas fa-check-circle mr-1" />{t('settings.cloud.validate')}</>
                )}
              </button>
              {validationResult.gcp === 'success' && (
                <span className="text-xs text-emerald-500"><i className="fas fa-check mr-1" />{t('settings.cloud.valid')}</span>
              )}
              {validationResult.gcp === 'error' && (
                <span className="text-xs text-red-500"><i className="fas fa-times mr-1" />{t('settings.cloud.invalid')}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Kaggle Section */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setKaggleExpanded(!kaggleExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between bg-accent/30 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <i className="fab fa-kaggle text-sky-500" />
            <span className="font-medium text-sm">{t('settings.cloud.kaggle.title')}</span>
            {kaggle.username && kaggle.apiKey && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500">
                {t('training.cloud.configured')}
              </span>
            )}
          </div>
          <i className={`fas fa-chevron-${kaggleExpanded ? 'up' : 'down'} text-xs text-muted-foreground`} />
        </button>

        {kaggleExpanded && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              {t('settings.cloud.kaggle.description')}{' '}
              <a
                href="https://www.kaggle.com/settings/account"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-500 hover:underline"
              >
                {t('settings.cloud.kaggle.getKey')}
              </a>
            </p>

            <div>
              <label className="text-xs font-medium block mb-1">{t('settings.cloud.kaggle.username')}</label>
              <input
                type="text"
                value={kaggle.username || ''}
                onChange={(e) => setKaggle((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="your_username"
                className="w-full px-3 py-2 text-xs rounded border border-border bg-background"
              />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">{t('settings.cloud.kaggle.apiKey')}</label>
              <input
                type="password"
                value={kaggle.apiKey || ''}
                onChange={(e) => setKaggle((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="xxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 text-xs rounded border border-border bg-background"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveKaggle}
                disabled={saving}
                className="px-4 py-2 text-xs rounded bg-sky-600 hover:bg-sky-700 text-white transition-colors disabled:opacity-50"
              >
                {t('common.save')}
              </button>
              <button
                onClick={() => handleValidate('kaggle')}
                disabled={!!validating || !kaggle.username || !kaggle.apiKey}
                className="px-4 py-2 text-xs rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                {validating === 'kaggle' ? (
                  <><i className="fas fa-spinner fa-spin mr-1" />{t('settings.cloud.validating')}</>
                ) : (
                  <><i className="fas fa-check-circle mr-1" />{t('settings.cloud.validate')}</>
                )}
              </button>
              {validationResult.kaggle === 'success' && (
                <span className="text-xs text-emerald-500"><i className="fas fa-check mr-1" />{t('settings.cloud.valid')}</span>
              )}
              {validationResult.kaggle === 'error' && (
                <span className="text-xs text-red-500"><i className="fas fa-times mr-1" />{t('settings.cloud.invalid')}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
