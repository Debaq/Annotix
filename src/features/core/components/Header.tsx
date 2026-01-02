import { useTranslation } from 'react-i18next';
import { LanguageSelector } from './LanguageSelector';
import { StorageIndicator } from './StorageIndicator';

export function Header() {
  const { t } = useTranslation();

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
          <i className="fas fa-draw-polygon text-sm"></i>
        </div>
        <h1 className="text-xl font-bold">{t('app.title')}</h1>
      </div>

      <div className="flex items-center gap-4">
        <StorageIndicator />
        <LanguageSelector />
      </div>
    </header>
  );
}
