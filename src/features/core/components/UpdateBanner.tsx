import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { X, Download } from 'lucide-react';
import type { UpdateInfo } from '../hooks/useUpdateCheck';

interface Props {
  info: UpdateInfo;
  onDismiss: () => void;
}

export function UpdateBanner({ info, onDismiss }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center gap-3 bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white">
      <i className="fas fa-arrow-circle-up"></i>
      <span>
        {t('common.updateAvailable', 'New version available')}: <strong>v{info.latestVersion}</strong>
        {' '}
        <span className="opacity-80">
          ({t('common.updateCurrent', 'current')}: v{info.currentVersion})
        </span>
      </span>
      <button
        onClick={() => openUrl(info.releaseUrl)}
        className="flex items-center gap-1.5 rounded bg-white/15 px-2.5 py-0.5 text-xs hover:bg-white/25 transition-colors"
      >
        <Download size={12} />
        {t('common.updateDownload', 'Download')}
      </button>
      <button
        onClick={onDismiss}
        className="rounded p-0.5 hover:bg-white/15 transition-colors"
        title={t('common.updateDismiss', 'Dismiss')}
      >
        <X size={14} />
      </button>
    </div>
  );
}
