import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Button } from '@/components/ui/button';

interface SetupScreenProps {
  onComplete: () => void;
}

export function SetupScreen({ onComplete }: SetupScreenProps) {
  const { t } = useTranslation();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSelectFolder = async () => {
    const result = await open({
      directory: true,
      multiple: false,
      title: t('setup.selectFolder'),
    });

    if (result && typeof result === 'string') {
      setSelectedPath(result);
    }
  };

  const handleConfirm = async () => {
    if (!selectedPath) return;
    setLoading(true);
    try {
      await invoke('set_projects_dir', { path: selectedPath });
      onComplete();
    } catch (err) {
      console.error('Error setting projects dir:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-[var(--annotix-light)]">
      <div className="w-full max-w-lg rounded-xl border bg-white p-8 shadow-lg">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--annotix-primary)]/10">
            <i className="fas fa-folder-open text-3xl text-[var(--annotix-primary)]"></i>
          </div>
          <h1 className="text-2xl font-bold text-[var(--annotix-dark)]">
            {t('setup.welcome')}
          </h1>
          <p className="mt-3 text-sm text-[var(--annotix-gray)] leading-relaxed">
            {t('setup.description')}
          </p>
        </div>

        <div className="space-y-4">
          {selectedPath ? (
            <div className="rounded-lg border border-[var(--annotix-primary)]/30 bg-[var(--annotix-primary)]/5 p-4">
              <p className="text-xs font-medium text-[var(--annotix-gray)] mb-1">
                {t('setup.selectedFolder')}
              </p>
              <p className="text-sm font-mono text-[var(--annotix-dark)] truncate">
                {selectedPath}
              </p>
              <button
                onClick={handleSelectFolder}
                className="mt-2 text-xs text-[var(--annotix-primary)] hover:underline"
              >
                {t('setup.changeFolder')}
              </button>
            </div>
          ) : (
            <button
              onClick={handleSelectFolder}
              className="w-full rounded-lg border-2 border-dashed border-[var(--annotix-border)] p-6 text-center hover:border-[var(--annotix-primary)]/50 hover:bg-[var(--annotix-primary)]/5 transition-colors"
            >
              <i className="fas fa-folder-plus text-2xl text-[var(--annotix-gray)] mb-2"></i>
              <p className="text-sm font-medium text-[var(--annotix-gray)]">
                {t('setup.selectFolder')}
              </p>
            </button>
          )}

          <Button
            onClick={handleConfirm}
            disabled={!selectedPath || loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <i className="fas fa-spinner fa-spin mr-2"></i>
            ) : (
              <i className="fas fa-arrow-right mr-2"></i>
            )}
            {t('setup.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
