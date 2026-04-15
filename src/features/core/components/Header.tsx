import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Copy } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';

import { ShortcutsModal } from './ShortcutsModal';
import { useUIStore } from '../store/uiStore';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { ExportDialog } from '@/features/export/components/ExportDialog';
import { TrainingPanel } from '@/features/training/components/TrainingPanel';
import { P2pStatusIndicator } from '@/features/p2p/components/P2pStatusIndicator';
import { P2pGuard } from '@/features/p2p/components/P2pGuard';
import { ServeButton } from '@/features/serve/components/ServeButton';

const appWindow = getCurrentWindow();

export const Header: React.FC = () => {
  const { t } = useTranslation();
  const { setCurrentProjectId, currentImageId } = useUIStore();
  const { project } = useCurrentProject();
  const navigate = useNavigate();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  React.useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const handleMinimize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    appWindow.minimize();
  }, []);

  const handleMaximize = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    appWindow.toggleMaximize();
  }, []);

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    appWindow.close();
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, [role="button"]')) return;
    e.preventDefault();
    if (e.detail === 2) {
      appWindow.toggleMaximize();
    } else {
      appWindow.startDragging();
    }
  }, []);

  return (
    <header
      className="annotix-header"
      onMouseDown={handleDragStart}
    >
      {/* Left Section: Logo + Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => openUrl('https://www.uach.cl')}
          className="transition-opacity hover:opacity-80"
          title="Universidad Austral de Chile"
        >
          <img
            src="https://www.uach.cl/uach/_imag/uach/logo-v2.png"
            alt="UACH"
            className="h-8 object-contain"
          />
        </button>

        <div className="h-8 w-px bg-white/30" />

        <Link
          to="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
          onClick={() => setCurrentProjectId(null)}
        >
          <img src="logo.png" alt="Annotix" className="h-8 w-8 object-contain" />
          <h1 className="text-lg font-semibold text-white tracking-tight">{t('app.title')}</h1>
        </Link>
      </div>

      {/* Center Section: Project Controls */}
      <div className="flex items-center gap-2">
        <ServeButton projectId={project?.id ?? null} />
        {project && (
          <>
            <div className="h-6 w-px bg-white/30 mx-1" />
            <P2pGuard permission="export">
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
            </P2pGuard>
            <TrainingPanel
              trigger={
                <button
                  className="h-9 px-3 rounded bg-emerald-600/80 border border-emerald-500/30 text-white text-sm hover:bg-emerald-600 transition-all flex items-center gap-2"
                  title={t('training.title')}
                >
                  <i className="fas fa-brain"></i>
                  <span className="hidden sm:inline">{t('training.title')}</span>
                </button>
              }
            />
            <button
              onClick={() => {
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

      {/* Right Section: Tools + Window Controls */}
      <div className="flex items-center gap-1">
        <P2pStatusIndicator />
        <button
          onClick={() => setShowShortcuts(true)}
          className="window-header-btn"
          title={t('help.shortcuts')}
        >
          <i className="fas fa-keyboard text-[13px]"></i>
        </button>
        <button
          onClick={() => openUrl('https://github.com/Debaq/Annotix')}
          className="window-header-btn"
          title="GitHub"
        >
          <i className="fab fa-github text-[13px]"></i>
        </button>
        <button
          onClick={() => navigate('/settings')}
          className="window-header-btn"
          title={t('settings.title')}
        >
          <i className="fas fa-cog text-[13px]"></i>
        </button>

        {/* Separator */}
        <div className="h-5 w-px bg-white/30 mx-1.5" />

        {/* Window Controls */}
        <button
          onClick={handleMinimize}
          className="window-control-btn hover:bg-white/20"
          title={t('window.minimize', 'Minimizar')}
        >
          <Minus size={14} strokeWidth={2} />
        </button>
        <button
          onClick={handleMaximize}
          className="window-control-btn hover:bg-white/20"
          title={t('window.maximize', 'Maximizar')}
        >
          {isMaximized ? <Copy size={12} strokeWidth={2} /> : <Square size={12} strokeWidth={2} />}
        </button>
        <button
          onClick={handleClose}
          className="window-control-btn hover:bg-red-500"
          title={t('window.close', 'Cerrar')}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <ShortcutsModal open={showShortcuts} onOpenChange={setShowShortcuts} />
    </header>
  );
}
