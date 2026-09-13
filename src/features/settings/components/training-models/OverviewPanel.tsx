import { useTranslation } from 'react-i18next';
import { BACKEND_COLORS, TASK_COLORS, TASK_LABELS } from '../../data/backendsData';
import type { CatalogBackend, CatalogModel } from '../../hooks/useTrainingCatalog';

interface Props {
  onSelectBackend: (backendId: string) => void;
  backends: CatalogBackend[];
  models: CatalogModel[];
  /** `true` si esa familia está recomendada en biomedicina. */
  esBiomedica: (backend: string, family: string) => boolean;
}

export function OverviewPanel({ onSelectBackend, backends, models, esBiomedica }: Props) {
  const { t } = useTranslation();

  return (
    <div className="p-4">
      <p className="text-sm text-muted-foreground mb-4">{t('settings.trainingModels.selectBackend')}</p>
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
        {backends.map(b => {
          const propios = models.filter(m => m.backend === b.id);
          const tasks = [...new Set(propios.flatMap(m => m.tasks))];
          const biomedico = propios.some(m => esBiomedica(b.id, m.family));
          return (
            <button
              key={b.id}
              onClick={() => onSelectBackend(b.id)}
              className="text-left p-4 rounded-xl border border-[var(--annotix-border)] bg-[var(--annotix-white)] hover:border-[var(--annotix-primary)]/40 hover:shadow-sm transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${BACKEND_COLORS[b.id]}`}>
                  <i className={`${b.icon} text-sm`} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-[var(--annotix-dark)] group-hover:text-[var(--annotix-primary)] transition-colors">
                      {b.name}
                    </span>
                    {biomedico && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 font-medium">
                        {t('training.families.axes.domain.biomedical')}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {propios.length} {t('settings.trainingModels.totalModels').toLowerCase()}
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
