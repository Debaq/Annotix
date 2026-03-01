import { useTranslation } from 'react-i18next';
import { BACKEND_META, BACKEND_COLORS, getModelCount, ALL_MODELS } from '../../data/backendsData';

interface Props {
  selectedBackendId: string | null;
  search: string;
  onSelect: (backendId: string) => void;
}

export function BackendSidebar({ selectedBackendId, search, onSelect }: Props) {
  const { t } = useTranslation();
  const q = search.toLowerCase().trim();

  return (
    <div className="w-48 shrink-0 border-r border-[var(--annotix-border)] bg-[var(--annotix-light)] flex flex-col transition-colors">
      <div className="px-3 py-2 shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Backends</span>
      </div>
      
      <div className="px-2 pb-2 shrink-0 border-b border-[var(--annotix-border)] mb-1">
        {/* All Backends Option - Fixed at top */}
        <button
          onClick={() => onSelect('all')}
          className={`w-full text-left px-2.5 py-1.5 rounded-md text-[12px] transition-all flex items-center justify-between gap-2 ${
            selectedBackendId === 'all'
              ? 'bg-[var(--annotix-primary)] text-white font-medium shadow-sm'
              : 'text-[var(--annotix-dark)] hover:bg-[var(--annotix-gray-light)]'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <i className="fas fa-th-large text-[10px]" />
            <span className="truncate">{t('common.all')}</span>
          </div>
          <span className={`text-[10px] shrink-0 ${selectedBackendId === 'all' ? 'opacity-70' : 'text-muted-foreground'}`}>
            {ALL_MODELS.length}
          </span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto min-h-0 py-1 px-2 space-y-0.5 scrollbar-thin scrollbar-thumb-[var(--annotix-border)]">
        {BACKEND_META.map(b => {
          const count = getModelCount(b.id);
          const hasMatch = !q || ALL_MODELS.some(m =>
            m.backend === b.id &&
            (m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || b.name.toLowerCase().includes(q))
          );
          const isActive = selectedBackendId === b.id;

          return (
            <button
              key={b.id}
              onClick={() => onSelect(b.id)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-[12px] transition-all flex items-center justify-between gap-2 ${
                isActive
                  ? BACKEND_COLORS[b.id] + ' font-medium shadow-sm'
                  : hasMatch
                    ? 'text-[var(--annotix-dark)] hover:bg-[var(--annotix-gray-light)]'
                    : 'text-muted-foreground/40'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <i className={`${b.icon} text-[10px] ${isActive ? '' : b.iconColor}`} />
                <span className="truncate">{b.name}</span>
              </div>
              <span className={`text-[10px] shrink-0 ${isActive ? 'opacity-70' : 'text-muted-foreground'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-3 py-2 border-t border-[var(--annotix-border)] shrink-0">
        <span className="text-[10px] text-muted-foreground">
          {ALL_MODELS.length} {t('settings.trainingModels.totalModels').toLowerCase()}
        </span>
      </div>
    </div>
  );
}
