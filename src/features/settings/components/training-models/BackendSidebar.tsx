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
    <div className="w-48 shrink-0 border-r border-[var(--annotix-border)] bg-gray-50/50 py-2">
      <div className="px-3 pb-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Backends</span>
      </div>
      <nav className="space-y-0.5 px-2">
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
                  ? BACKEND_COLORS[b.id] + ' font-medium'
                  : hasMatch
                    ? 'text-[var(--annotix-dark)] hover:bg-gray-100'
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
      <div className="mt-3 px-3 pt-2 border-t border-[var(--annotix-border)]">
        <span className="text-[10px] text-muted-foreground">
          {ALL_MODELS.length} {t('settings.trainingModels.totalModels').toLowerCase()}
        </span>
      </div>
    </div>
  );
}
