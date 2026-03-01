import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { availableLanguages } from '@/lib/i18n';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

type ColorMode = 'light' | 'dark' | 'system';

const COLOR_MODE_KEY = 'annotix-color-mode';

function getSystemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getSavedColorMode(): ColorMode {
  const saved = localStorage.getItem(COLOR_MODE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'light';
}

function applyColorMode(mode: ColorMode) {
  const isDark = mode === 'dark' || (mode === 'system' && getSystemPrefersDark());
  document.documentElement.classList.toggle('dark', isDark);
  localStorage.setItem(COLOR_MODE_KEY, mode);
}

export function GeneralSection() {
  const { t, i18n } = useTranslation();
  const [colorMode, setColorMode] = useState<ColorMode>(getSavedColorMode);
  const [projectsDir, setProjectsDir] = useState<string>('');
  const [changingDir, setChangingDir] = useState(false);

  useEffect(() => {
    invoke<{ projects_dir: string | null }>('get_config').then((cfg) => {
      if (cfg.projects_dir) setProjectsDir(cfg.projects_dir);
    });
  }, []);

  useEffect(() => {
    applyColorMode(colorMode);

    if (colorMode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyColorMode('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [colorMode]);

  const handleChangeDir = async () => {
    const result = await open({
      directory: true,
      multiple: false,
      title: t('settings.general.changeWorkDir'),
    });
    if (result && typeof result === 'string') {
      setChangingDir(true);
      try {
        await invoke('set_projects_dir', { path: result });
        setProjectsDir(result);
      } catch (err) {
        console.error('Error changing projects dir:', err);
      } finally {
        setChangingDir(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Color Mode */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <i className="fas fa-palette text-[var(--annotix-primary)]" />
          {t('settings.general.colorMode')}
        </div>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as ColorMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setColorMode(mode)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all ${
                colorMode === mode
                  ? 'border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/10 text-[var(--annotix-primary)] font-medium'
                  : 'border-[var(--annotix-border)] hover:border-[var(--annotix-gray)] text-muted-foreground'
              }`}
            >
              <i className={`fas ${mode === 'light' ? 'fa-sun' : mode === 'dark' ? 'fa-moon' : 'fa-desktop'}`} />
              {t(`settings.general.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Language */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <i className="fas fa-language text-[var(--annotix-primary)]" />
          {t('settings.general.language')}
        </div>
        <Select value={i18n.language} onValueChange={(lang) => i18n.changeLanguage(lang)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableLanguages.map((lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="flex items-center gap-2">
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Working Directory */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <i className="fas fa-folder-open text-[var(--annotix-primary)]" />
          {t('settings.general.workDir')}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono truncate" title={projectsDir}>
            {projectsDir || '—'}
          </div>
          <Button variant="outline" size="sm" onClick={handleChangeDir} disabled={changingDir}>
            {changingDir ? (
              <i className="fas fa-spinner fa-spin mr-1" />
            ) : (
              <i className="fas fa-pen mr-1" />
            )}
            {t('settings.general.change')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('settings.general.workDirHelp')}
        </p>
      </div>

    </div>
  );
}
