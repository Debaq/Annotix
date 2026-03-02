import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { GeneralSection } from './GeneralSection';
import { PythonEnvironmentSection } from './PythonEnvironmentSection';
import { TrainingModelsSection } from './TrainingModelsSection';
import { CloudProvidersSection } from './CloudProvidersSection';

type SettingsSection = 'general' | 'python-env' | 'training-models' | 'cloud-providers';

export function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SettingsSection>('general');

  const sections: { id: SettingsSection; icon: string; labelKey: string }[] = [
    { id: 'general', icon: 'fas fa-cog', labelKey: 'settings.sections.general' },
    { id: 'python-env', icon: 'fab fa-python', labelKey: 'settings.sections.pythonEnv' },
    { id: 'training-models', icon: 'fas fa-brain', labelKey: 'settings.sections.trainingModels' },
    { id: 'cloud-providers', icon: 'fas fa-cloud', labelKey: 'settings.sections.cloudProviders' },
  ];

  const activeLabelKey = sections.find(s => s.id === activeSection)?.labelKey ?? sections[0].labelKey;

  return (
    <div className="flex h-full bg-[var(--annotix-light)] text-[var(--annotix-dark)] transition-colors">
      {/* Sidebar */}
      <div className="w-56 border-r border-[var(--annotix-border)] bg-[var(--annotix-white)] flex flex-col transition-colors">
        <div className="p-4 border-b border-[var(--annotix-border)]">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-[var(--annotix-primary)] transition-colors"
          >
            <i className="fas fa-arrow-left" />
            {t('settings.back')}
          </button>
        </div>

        <nav className="flex-1 p-2">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all flex items-center gap-2 ${
                activeSection === section.id
                  ? 'bg-[var(--annotix-primary)]/10 text-[var(--annotix-primary)] font-medium shadow-sm'
                  : 'text-muted-foreground hover:bg-[var(--annotix-gray-light)] hover:text-[var(--annotix-dark)]'
              }`}
            >
              <i className={`${section.icon} text-[13px]`} />
              {t(section.labelKey)}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className={`mx-auto p-8 ${activeSection === 'training-models' ? 'max-w-5xl' : 'max-w-3xl'}`}>
          <h2 className="text-xl font-semibold text-[var(--annotix-dark)] mb-6">
            {t(activeLabelKey)}
          </h2>

          {activeSection === 'general' && <GeneralSection />}
          {activeSection === 'python-env' && <PythonEnvironmentSection />}
          {activeSection === 'training-models' && <TrainingModelsSection />}
          {activeSection === 'cloud-providers' && <CloudProvidersSection />}
        </div>
      </div>
    </div>
  );
}
