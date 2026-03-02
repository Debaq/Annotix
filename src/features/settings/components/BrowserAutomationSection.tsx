import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { open } from '@tauri-apps/plugin-dialog';
import { automationSettingsService } from '../services/automationSettingsService';
import type { BrowserAutomationConfig, DetectedBrowser, ProviderSelectorSummary } from '../types';

const DEFAULT_CONFIG: BrowserAutomationConfig = {
  preferredBrowserPath: null,
  preferredBrowserName: null,
  defaultProvider: null,
  stepTimeoutMs: 5000,
  maxRetries: 2,
  userActionTimeoutSecs: 300,
  llmResponseTimeoutSecs: 120,
  userDataDir: null,
  windowWidth: 1280,
  windowHeight: 900,
};

const LLM_PROVIDERS = [
  { key: 'kimi', icon: 'fas fa-moon', color: 'text-purple-500' },
  { key: 'qwen', icon: 'fas fa-comment-dots', color: 'text-cyan-500' },
  { key: 'deepseek', icon: 'fas fa-water', color: 'text-indigo-500' },
  { key: 'huggingchat', icon: 'fas fa-face-smile', color: 'text-amber-500' },
];

export function BrowserAutomationSection() {
  const { t } = useTranslation();

  const [config, setConfig] = useState<BrowserAutomationConfig>(DEFAULT_CONFIG);
  const [browsers, setBrowsers] = useState<DetectedBrowser[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Secciones expandibles
  const [browsersExpanded, setBrowsersExpanded] = useState(true);
  const [providerExpanded, setProviderExpanded] = useState(true);
  const [selectorsExpanded, setSelectorsExpanded] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  // Selectores
  const [selectorProviders, setSelectorProviders] = useState<ProviderSelectorSummary[]>([]);
  const [activeSelector, setActiveSelector] = useState<string>('colab_free');
  const [selectorContent, setSelectorContent] = useState('');
  const [selectorDirty, setSelectorDirty] = useState(false);
  const [selectorError, setSelectorError] = useState<string | null>(null);
  const [savingSelector, setSavingSelector] = useState(false);

  useEffect(() => {
    automationSettingsService.getConfig().then(setConfig).catch(() => {});
  }, []);

  const handleDetectBrowsers = useCallback(async () => {
    setDetecting(true);
    try {
      const found = await automationSettingsService.detectBrowsers();
      setBrowsers(found);
    } catch {
      setBrowsers([]);
    }
    setDetecting(false);
  }, []);

  const handleSelectBrowser = useCallback((browser: DetectedBrowser) => {
    setConfig(prev => ({
      ...prev,
      preferredBrowserPath: browser.path,
      preferredBrowserName: browser.name,
    }));
    setTestResult(null);
  }, []);

  const handleTestBrowser = useCallback(async () => {
    if (!config.preferredBrowserPath) return;
    setTesting(true);
    setTestResult(null);
    try {
      const version = await automationSettingsService.testLaunchBrowser(config.preferredBrowserPath);
      setTestResult({ ok: true, message: version });
    } catch (e) {
      setTestResult({ ok: false, message: String(e) });
    }
    setTesting(false);
  }, [config.preferredBrowserPath]);

  const handleSaveConfig = useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      await automationSettingsService.saveConfig(config);
      setSaveMessage('ok');
    } catch {
      setSaveMessage('error');
    }
    setSaving(false);
    setTimeout(() => setSaveMessage(null), 3000);
  }, [config]);

  const handleResetDefaults = useCallback(() => {
    setConfig(prev => ({
      ...DEFAULT_CONFIG,
      preferredBrowserPath: prev.preferredBrowserPath,
      preferredBrowserName: prev.preferredBrowserName,
      defaultProvider: prev.defaultProvider,
    }));
  }, []);

  // Selectores
  const handleLoadSelectors = useCallback(async () => {
    try {
      const list = await automationSettingsService.listProviderSelectors();
      setSelectorProviders(list);
    } catch {
      setSelectorProviders([]);
    }
  }, []);

  useEffect(() => {
    if (selectorsExpanded) {
      handleLoadSelectors();
    }
  }, [selectorsExpanded, handleLoadSelectors]);

  const handleLoadSelectorContent = useCallback(async (provider: string) => {
    setActiveSelector(provider);
    setSelectorDirty(false);
    setSelectorError(null);
    try {
      const content = await automationSettingsService.getProviderSelectors(provider);
      setSelectorContent(content);
    } catch {
      setSelectorContent('');
    }
  }, []);

  useEffect(() => {
    if (selectorsExpanded && activeSelector) {
      handleLoadSelectorContent(activeSelector);
    }
  }, [selectorsExpanded, activeSelector, handleLoadSelectorContent]);

  const handleSaveSelector = useCallback(async () => {
    setSavingSelector(true);
    setSelectorError(null);
    try {
      await automationSettingsService.saveProviderSelectors(activeSelector, selectorContent);
      setSelectorDirty(false);
      handleLoadSelectors();
    } catch (e) {
      setSelectorError(String(e));
    }
    setSavingSelector(false);
  }, [activeSelector, selectorContent, handleLoadSelectors]);

  const handlePickDataDir = useCallback(async () => {
    const dir = await open({ directory: true, multiple: false });
    if (dir) {
      setConfig(prev => ({ ...prev, userDataDir: dir as string }));
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* 1. Detección de navegadores */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setBrowsersExpanded(!browsersExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between bg-accent/30 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <i className="fas fa-globe text-blue-500" />
            <span className="font-medium text-sm">{t('settings.automation.browsers.title')}</span>
            {config.preferredBrowserName && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-500">
                {config.preferredBrowserName}
              </span>
            )}
          </div>
          <i className={`fas fa-chevron-${browsersExpanded ? 'up' : 'down'} text-xs text-muted-foreground`} />
        </button>

        {browsersExpanded && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">{t('settings.automation.browsers.description')}</p>

            <button
              onClick={handleDetectBrowsers}
              disabled={detecting}
              className="px-4 py-2 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
            >
              {detecting ? (
                <><i className="fas fa-spinner fa-spin mr-1" />{t('settings.automation.browsers.detecting')}</>
              ) : (
                <><i className="fas fa-search mr-1" />{t('settings.automation.browsers.detect')}</>
              )}
            </button>

            {browsers.length > 0 && (
              <div className="space-y-2">
                {browsers.map((b) => (
                  <label
                    key={b.path}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      config.preferredBrowserPath === b.path
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-border hover:bg-accent/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="browser"
                      checked={config.preferredBrowserPath === b.path}
                      onChange={() => handleSelectBrowser(b)}
                      className="accent-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{b.name}</span>
                        {config.preferredBrowserPath === b.path && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500">
                            {t('settings.automation.browsers.preferred')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{b.path}</p>
                      {b.version && <p className="text-xs text-muted-foreground">{b.version}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {config.preferredBrowserPath && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTestBrowser}
                  disabled={testing}
                  className="px-4 py-2 text-xs rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {testing ? (
                    <><i className="fas fa-spinner fa-spin mr-1" />{t('settings.automation.browsers.testing')}</>
                  ) : (
                    <><i className="fas fa-play mr-1" />{t('settings.automation.browsers.testLaunch')}</>
                  )}
                </button>
                {testResult && (
                  <span className={`text-xs ${testResult.ok ? 'text-emerald-500' : 'text-red-500'}`}>
                    <i className={`fas fa-${testResult.ok ? 'check' : 'times'} mr-1`} />
                    {testResult.message}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Proveedor por defecto */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setProviderExpanded(!providerExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between bg-accent/30 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <i className="fas fa-brain text-purple-500" />
            <span className="font-medium text-sm">{t('settings.automation.provider.title')}</span>
            {config.defaultProvider && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-500">
                {config.defaultProvider}
              </span>
            )}
          </div>
          <i className={`fas fa-chevron-${providerExpanded ? 'up' : 'down'} text-xs text-muted-foreground`} />
        </button>

        {providerExpanded && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">{t('settings.automation.provider.description')}</p>

            <div className="grid grid-cols-1 gap-2">
              {LLM_PROVIDERS.map((p) => (
                <label
                  key={p.key}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    config.defaultProvider === p.key
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-border hover:bg-accent/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    checked={config.defaultProvider === p.key}
                    onChange={() => setConfig(prev => ({ ...prev, defaultProvider: p.key }))}
                    className="accent-purple-500"
                  />
                  <i className={`${p.icon} ${p.color}`} />
                  <span className="text-sm">{t(`settings.automation.provider.${p.key}`)}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Editor de selectores CSS */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setSelectorsExpanded(!selectorsExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between bg-accent/30 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <i className="fas fa-code text-emerald-500" />
            <span className="font-medium text-sm">{t('settings.automation.selectors.title')}</span>
          </div>
          <i className={`fas fa-chevron-${selectorsExpanded ? 'up' : 'down'} text-xs text-muted-foreground`} />
        </button>

        {selectorsExpanded && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">{t('settings.automation.selectors.description')}</p>

            {/* Tabs de proveedores */}
            <div className="flex gap-1 border-b border-border">
              {selectorProviders.map((sp) => (
                <button
                  key={sp.key}
                  onClick={() => handleLoadSelectorContent(sp.key)}
                  className={`px-3 py-2 text-xs transition-colors border-b-2 ${
                    activeSelector === sp.key
                      ? 'border-emerald-500 text-emerald-500'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {sp.name}
                  <span className="ml-1 text-[10px] opacity-60">({sp.selectorCount})</span>
                </button>
              ))}
            </div>

            <textarea
              value={selectorContent}
              onChange={(e) => {
                setSelectorContent(e.target.value);
                setSelectorDirty(true);
                setSelectorError(null);
              }}
              className="w-full h-64 px-3 py-2 text-xs font-mono rounded border border-border bg-background resize-y"
              spellCheck={false}
            />

            {selectorError && (
              <p className="text-xs text-red-500"><i className="fas fa-exclamation-triangle mr-1" />{selectorError}</p>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveSelector}
                disabled={!selectorDirty || savingSelector}
                className="px-4 py-2 text-xs rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50"
              >
                {savingSelector ? (
                  <><i className="fas fa-spinner fa-spin mr-1" />{t('common.saving')}</>
                ) : (
                  <><i className="fas fa-save mr-1" />{t('common.save')}</>
                )}
              </button>
              <button
                onClick={() => handleLoadSelectorContent(activeSelector)}
                disabled={!selectorDirty}
                className="px-4 py-2 text-xs rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
              >
                <i className="fas fa-undo mr-1" />{t('settings.automation.selectors.restore')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Configuración avanzada */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setAdvancedExpanded(!advancedExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between bg-accent/30 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <i className="fas fa-sliders text-orange-500" />
            <span className="font-medium text-sm">{t('settings.automation.advanced.title')}</span>
          </div>
          <i className={`fas fa-chevron-${advancedExpanded ? 'up' : 'down'} text-xs text-muted-foreground`} />
        </button>

        {advancedExpanded && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">{t('settings.automation.advanced.description')}</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium block mb-1">{t('settings.automation.advanced.stepTimeout')}</label>
                <input
                  type="number"
                  value={config.stepTimeoutMs}
                  onChange={(e) => setConfig(prev => ({ ...prev, stepTimeoutMs: parseInt(e.target.value) || 0 }))}
                  min={1000}
                  step={1000}
                  className="w-full px-3 py-2 text-xs rounded border border-border bg-background"
                />
                <p className="text-[10px] text-muted-foreground mt-1">ms</p>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">{t('settings.automation.advanced.maxRetries')}</label>
                <input
                  type="number"
                  value={config.maxRetries}
                  onChange={(e) => setConfig(prev => ({ ...prev, maxRetries: parseInt(e.target.value) || 0 }))}
                  min={0}
                  max={10}
                  className="w-full px-3 py-2 text-xs rounded border border-border bg-background"
                />
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">{t('settings.automation.advanced.userActionTimeout')}</label>
                <input
                  type="number"
                  value={config.userActionTimeoutSecs}
                  onChange={(e) => setConfig(prev => ({ ...prev, userActionTimeoutSecs: parseInt(e.target.value) || 0 }))}
                  min={30}
                  step={30}
                  className="w-full px-3 py-2 text-xs rounded border border-border bg-background"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{t('settings.automation.advanced.seconds')}</p>
              </div>

              <div>
                <label className="text-xs font-medium block mb-1">{t('settings.automation.advanced.llmResponseTimeout')}</label>
                <input
                  type="number"
                  value={config.llmResponseTimeoutSecs}
                  onChange={(e) => setConfig(prev => ({ ...prev, llmResponseTimeoutSecs: parseInt(e.target.value) || 0 }))}
                  min={30}
                  step={30}
                  className="w-full px-3 py-2 text-xs rounded border border-border bg-background"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{t('settings.automation.advanced.seconds')}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">{t('settings.automation.advanced.userDataDir')}</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={config.userDataDir || ''}
                  readOnly
                  placeholder={t('settings.automation.advanced.userDataDirPlaceholder')}
                  className="flex-1 px-3 py-2 text-xs rounded border border-border bg-background"
                />
                <button
                  onClick={handlePickDataDir}
                  className="px-3 py-2 text-xs rounded border border-border hover:bg-accent transition-colors"
                >
                  <i className="fas fa-folder-open mr-1" />
                  {t('common.browse')}
                </button>
                {config.userDataDir && (
                  <button
                    onClick={() => setConfig(prev => ({ ...prev, userDataDir: null }))}
                    className="px-3 py-2 text-xs rounded border border-border hover:bg-accent transition-colors text-muted-foreground"
                  >
                    <i className="fas fa-times" />
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1">{t('settings.automation.advanced.windowSize')}</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={config.windowWidth}
                  onChange={(e) => setConfig(prev => ({ ...prev, windowWidth: parseInt(e.target.value) || 0 }))}
                  min={800}
                  className="w-24 px-3 py-2 text-xs rounded border border-border bg-background"
                />
                <span className="text-xs text-muted-foreground">x</span>
                <input
                  type="number"
                  value={config.windowHeight}
                  onChange={(e) => setConfig(prev => ({ ...prev, windowHeight: parseInt(e.target.value) || 0 }))}
                  min={600}
                  className="w-24 px-3 py-2 text-xs rounded border border-border bg-background"
                />
                <span className="text-xs text-muted-foreground">px</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleSaveConfig}
                disabled={saving}
                className="px-4 py-2 text-xs rounded bg-orange-600 hover:bg-orange-700 text-white transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <><i className="fas fa-spinner fa-spin mr-1" />{t('common.saving')}</>
                ) : (
                  <><i className="fas fa-save mr-1" />{t('common.save')}</>
                )}
              </button>
              <button
                onClick={handleResetDefaults}
                className="px-4 py-2 text-xs rounded border border-border hover:bg-accent transition-colors"
              >
                <i className="fas fa-undo mr-1" />{t('settings.automation.advanced.restoreDefaults')}
              </button>
              {saveMessage === 'ok' && (
                <span className="text-xs text-emerald-500"><i className="fas fa-check mr-1" />{t('settings.automation.saved')}</span>
              )}
              {saveMessage === 'error' && (
                <span className="text-xs text-red-500"><i className="fas fa-times mr-1" />{t('settings.automation.saveError')}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
