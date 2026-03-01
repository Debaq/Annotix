import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PythonEnvironmentSection } from './PythonEnvironmentSection';

type SettingsSection = 'python-env';

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeSection] = useState<SettingsSection>('python-env');

  return (
    <div className="flex h-full bg-[var(--annotix-light)]">
      {/* Sidebar */}
      <div className="w-56 border-r border-[var(--annotix-border)] bg-white flex flex-col">
        <div className="p-4 border-b border-[var(--annotix-border)]">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-[var(--annotix-dark)] transition-colors"
          >
            <i className="fas fa-arrow-left" />
            {t('settings.back')}
          </button>
        </div>

        <nav className="flex-1 p-2">
          <button
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${
              activeSection === 'python-env'
                ? 'bg-[var(--annotix-primary)]/10 text-[var(--annotix-primary)] font-medium'
                : 'text-muted-foreground hover:bg-gray-100'
            }`}
          >
            <i className="fab fa-python text-[13px]" />
            {t('settings.sections.pythonEnv')}
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-8">
          <h2 className="text-xl font-semibold text-[var(--annotix-dark)] mb-6">
            {t('settings.sections.pythonEnv')}
          </h2>

          {activeSection === 'python-env' && <PythonEnvironmentSection />}
        </div>
      </div>
    </div>
  );
}
