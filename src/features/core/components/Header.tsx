import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { StorageIndicator } from './StorageIndicator';
import { LanguageSelector } from './LanguageSelector';
import { useUIStore } from '../store/uiStore';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { Button } from '@/components/ui/button';
import { ExportDialog } from '@/features/export/components/ExportDialog';

export const Header: React.FC = () => {
  const { t } = useTranslation();
  const { setCurrentProjectId } = useUIStore();
  const { project } = useCurrentProject();

  return (
    <header className="annotix-header">
      {/* Left Section: Logo + Title */}
      <div className="flex items-center gap-3">
        <a
          href="https://www.uach.cl"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-opacity hover:opacity-80"
          title="Universidad Austral de Chile"
        >
          <img
            src="https://www.uach.cl/uach/_imag/uach/logo-v2.png"
            alt="UACH"
            className="h-8 object-contain"
          />
        </a>

        <div className="h-8 w-px bg-white/30" />

        <Link
          to="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
          onClick={() => setCurrentProjectId(null)}
        >
          <img src="/logo.png" alt="Annotix" className="h-8 w-8 object-contain" />
          <h1 className="text-lg font-semibold text-white tracking-tight">{t('app.title')}</h1>
        </Link>
      </div>

      {/* Center Section: Project Controls */}
      <div className="flex items-center gap-2">
        <StorageIndicator />

        {project && (
          <>
            <div className="h-6 w-px bg-white/30 mx-1" />
            <ExportDialog
              trigger={
                <button
                  className="h-9 px-3 rounded bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-all flex items-center gap-2"
                  title={t('common.exportDataset')}
                >
                  <i className="fas fa-download"></i>
                  <span className="hidden sm:inline">{t('export.title')}</span>
                </button>
              }
            />
            <button
              onClick={() => {
                // Save annotations trigger
                window.dispatchEvent(new CustomEvent('annotix:save'));
              }}
              className="h-9 px-3 rounded bg-white/10 border border-white/20 text-white text-sm hover:bg-white/20 transition-all flex items-center gap-2"
              title={t('shortcuts.save')}
            >
              <i className="fas fa-save"></i>
              <span className="hidden sm:inline">{t('common.save')}</span>
            </button>
          </>
        )}
      </div>

      {/* Right Section: Language + Help */}
      <div className="flex items-center gap-3">
        <button
          className="h-8 w-8 rounded flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-all"
          title={t('help.shortcuts')}
        >
          <i className="fas fa-keyboard"></i>
        </button>
        <LanguageSelector />
        <a
          href="https://github.com/yourusername/annotix"
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 w-8 rounded flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-all"
          title="GitHub"
        >
          <i className="fab fa-github"></i>
        </a>
      </div>
    </header>
  );
}
