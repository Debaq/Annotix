import { useTranslation } from 'react-i18next';
import { BACKEND_META, BACKEND_COLORS, TASK_COLORS, TASK_LABELS, getModelsByBackend } from '../../data/backendsData';

interface Props {
  onSelectBackend: (backendId: string) => void;
}

export function OverviewPanel({ onSelectBackend }: Props) {
  const { t } = useTranslation();

  return (
    <div className="p-4">
      <p className="text-sm text-muted-foreground mb-4">{t('settings.trainingModels.selectBackend')}</p>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {BACKEND_META.map(b => {
          const models = getModelsByBackend(b.id);
          const tasks = [...new Set(models.flatMap(m => m.tasks))];
          return (
            <button
              key={b.id}
              onClick={() => onSelectBackend(b.id)}
              className="text-left p-4 rounded-xl border border-[var(--annotix-border)] bg-white hover:border-[var(--annotix-primary)]/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${BACKEND_COLORS[b.id]}`}>
                  <i className={`${b.icon} text-sm`} />
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--annotix-dark)] group-hover:text-[var(--annotix-primary)] transition-colors">{b.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {models.length} {t('settings.trainingModels.totalModels').toLowerCase()}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {tasks.map(task => (
                  <span key={task} className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${TASK_COLORS[task]}`}>
                    {TASK_LABELS[task]}
                  </span>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground">
                <i className="fas fa-database text-[8px] mr-1" />
                {b.datasetFormat}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
