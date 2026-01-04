import { useTranslation } from 'react-i18next';
import { useImageNavigation } from '../hooks/useImageNavigation';

export function ImageNavigation() {
  const { t } = useTranslation();
  const { canNavigatePrevious, canNavigateNext, navigatePrevious, navigateNext } =
    useImageNavigation();

  return (
    <>
      {/* Previous Button (Left) */}
      <button
        onClick={navigatePrevious}
        disabled={!canNavigatePrevious}
        className="w-12 h-12 rounded-full flex items-center justify-center transition-all pointer-events-auto"
        style={{
          background: 'var(--annotix-white)',
          border: 'none',
          boxShadow: '0 4px 12px var(--annotix-shadow)',
          color: canNavigatePrevious ? 'var(--annotix-dark)' : 'var(--annotix-gray)',
          opacity: canNavigatePrevious ? 1 : 0.3,
          cursor: canNavigatePrevious ? 'pointer' : 'not-allowed',
        }}
        onMouseEnter={(e) => {
          if (canNavigatePrevious) {
            e.currentTarget.style.background = 'var(--annotix-primary)';
            e.currentTarget.style.color = 'white';
            e.currentTarget.style.transform = 'scale(1.1)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--annotix-white)';
          e.currentTarget.style.color = canNavigatePrevious ? 'var(--annotix-dark)' : 'var(--annotix-gray)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        title={t('navigation.previous')}
      >
        <i className="fas fa-chevron-left text-lg"></i>
      </button>

      {/* Next Button (Right) */}
      <button
        onClick={navigateNext}
        disabled={!canNavigateNext}
        className="w-12 h-12 rounded-full flex items-center justify-center transition-all pointer-events-auto"
        style={{
          background: 'var(--annotix-white)',
          border: 'none',
          boxShadow: '0 4px 12px var(--annotix-shadow)',
          color: canNavigateNext ? 'var(--annotix-dark)' : 'var(--annotix-gray)',
          opacity: canNavigateNext ? 1 : 0.3,
          cursor: canNavigateNext ? 'pointer' : 'not-allowed',
        }}
        onMouseEnter={(e) => {
          if (canNavigateNext) {
            e.currentTarget.style.background = 'var(--annotix-primary)';
            e.currentTarget.style.color = 'white';
            e.currentTarget.style.transform = 'scale(1.1)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--annotix-white)';
          e.currentTarget.style.color = canNavigateNext ? 'var(--annotix-dark)' : 'var(--annotix-gray)';
          e.currentTarget.style.transform = 'scale(1)';
        }}
        title={t('navigation.next')}
      >
        <i className="fas fa-chevron-right text-lg"></i>
      </button>
    </>
  );
}
