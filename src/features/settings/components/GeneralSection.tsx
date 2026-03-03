import { useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { availableLanguages } from '@/lib/i18n';
import { BUILD_CODE, BUILD_DATE } from '@/lib/buildInfo';
import { CHANGELOG } from '@/lib/changelog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';

type ColorMode = 'light' | 'dark' | 'dracula' | 'system';

const COLOR_MODE_KEY = 'annotix-color-mode';

function getSystemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getSavedColorMode(): ColorMode {
  const saved = localStorage.getItem(COLOR_MODE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'dracula' || saved === 'system') return saved;
  return 'light';
}

function applyColorMode(mode: ColorMode) {
  const isDark = mode === 'dark' || mode === 'dracula' || (mode === 'system' && getSystemPrefersDark());
  const isDracula = mode === 'dracula';
  
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('dracula', isDracula);
  
  localStorage.setItem(COLOR_MODE_KEY, mode);
}

export function GeneralSection() {
  const { t, i18n } = useTranslation();
  const [colorMode, setColorMode] = useState<ColorMode>(getSavedColorMode);
  const [projectsDir, setProjectsDir] = useState<string>('');
  const [changingDir, setChangingDir] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    invoke<{ projects_dir: string | null }>('get_config').then((cfg) => {
      if (cfg.projects_dir) setProjectsDir(cfg.projects_dir);
    });
    getVersion().then(setAppVersion);
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
          {(['light', 'dark', 'dracula', 'system'] as ColorMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setColorMode(mode)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-all ${
                colorMode === mode
                  ? 'border-[var(--annotix-primary)] bg-[var(--annotix-primary)]/10 text-[var(--annotix-primary)] font-medium'
                  : 'border-[var(--annotix-border)] hover:border-[var(--annotix-gray)] text-muted-foreground'
              }`}
            >
              <i className={`fas ${
                mode === 'light' ? 'fa-sun' : 
                mode === 'dark' ? 'fa-moon' : 
                mode === 'dracula' ? 'fa-vampire' :
                'fa-desktop'
              }`} />
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

      {/* About */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <i className="fas fa-info-circle text-[var(--annotix-primary)]" />
          {t('settings.general.about')}
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-semibold">
            Annotix v{appVersion}{BUILD_CODE && ` (${BUILD_CODE})`}
          </span>
          {BUILD_DATE && (
            <span className="text-muted-foreground text-xs">
              {t('settings.general.buildDate')}: {new Date(BUILD_DATE).toLocaleString()}
            </span>
          )}
        </div>

        {/* Proyecto */}
        <div className="space-y-2 pt-2 border-t">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <Trans i18nKey="settings.general.aboutDescription" components={{ strong: <strong /> }} />
          </p>
          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('settings.general.team')}
            </span>
            <div className="grid grid-cols-1 gap-0.5 text-xs text-muted-foreground">
              <span><strong>Nicolás Baier</strong> — {t('settings.general.roleNicolas')}</span>
              <span><strong>Dra. Fernanda López</strong></span>
              <span><strong>TM. Vanessa Uribe</strong></span>
              <span><strong>DR(c) Haydee Barrientos</strong></span>
              <span><strong>Mg. Carolina Almendras</strong></span>
              <span><strong>Felipe Brana</strong> — {t('settings.general.roleFelipe')}</span>
            </div>
          </div>
        </div>

        {CHANGELOG.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t('settings.general.changelog')}
            </span>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {CHANGELOG.map((c) => (
                <div key={c.hash} className="flex items-center gap-2 text-xs font-mono leading-5">
                  <span className="shrink-0 text-[var(--annotix-primary)]">{c.hash}</span>
                  <span className="truncate text-muted-foreground">{c.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
