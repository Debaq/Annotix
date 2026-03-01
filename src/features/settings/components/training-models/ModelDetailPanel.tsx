import { useTranslation } from 'react-i18next';
import {
  TASK_COLORS, TASK_LABELS, SIZE_LABELS, BACKEND_COLORS,
  type BackendMeta, type ModelEntry,
} from '../../data/backendsData';
import { ParamsTable } from './ParamsTable';

interface Props {
  model: ModelEntry;
  backend: BackendMeta;
  onBack: () => void;
  onViewScript: () => void;
}

export function ModelDetailPanel({ model, backend, onBack, onViewScript }: Props) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="px-4 py-2.5 border-b border-[var(--annotix-border)] bg-[var(--annotix-light)] shrink-0 transition-colors">
        <div className="flex items-center gap-1.5 text-[12px]">
          <button onClick={onBack} className="text-[var(--annotix-primary)] hover:underline">
            {backend.name}
          </button>
          <i className="fas fa-chevron-right text-[8px] text-muted-foreground" />
          <span className="text-[var(--annotix-dark)] font-medium">{model.name}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Title section */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-[var(--annotix-dark)]">{model.name}</h3>
              {model.recommended && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1">
                  <i className="fas fa-star text-[8px]" />
                  {t('settings.trainingModels.recommended')}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
          </div>
          {model.params && (
            <span className="text-sm font-mono text-muted-foreground bg-[var(--annotix-gray-light)] px-2 py-1 rounded shrink-0 transition-colors">
              {model.params}
            </span>
          )}
        </div>

        {/* Tasks */}
        <div>
          <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {t('settings.trainingModels.supportedTasks')}
          </h4>
          <div className="flex gap-1.5 flex-wrap">
            {model.tasks.map(task => (
              <span key={task} className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${TASK_COLORS[task]}`}>
                {TASK_LABELS[task]}
              </span>
            ))}
          </div>
        </div>

        {/* Sizes */}
        {model.sizes && (
          <div>
            <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {t('settings.trainingModels.availableSizes')}
            </h4>
            <div className="flex gap-1.5 flex-wrap">
              {model.sizes.map(s => (
                <span key={s} className="text-[11px] px-2.5 py-1 rounded-md bg-[var(--annotix-gray-light)] text-[var(--annotix-dark)] font-mono transition-colors">
                  <span className="uppercase font-semibold">{s}</span>
                  <span className="text-muted-foreground ml-1 text-[10px]">{SIZE_LABELS[s]}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Backend info */}
        <div className="flex items-center gap-4 text-[12px] text-muted-foreground p-3 rounded-lg bg-[var(--annotix-light)] border border-[var(--annotix-border)] transition-colors">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center ${BACKEND_COLORS[backend.id]}`}>
            <i className={`${backend.icon} text-xs`} />
          </div>
          <div className="flex-1 flex items-center gap-4">
            <span>
              <i className="fas fa-database text-[9px] mr-1" />
              {t('settings.trainingModels.datasetFormat')}: <strong className="text-[var(--annotix-dark)]">{backend.datasetFormat}</strong>
            </span>
            <span>
              <i className="fab fa-python text-[9px] mr-1" />
              {t('settings.trainingModels.pipPackages')}: <span className="font-mono">{backend.pipPackages.join(', ')}</span>
            </span>
          </div>
          <button
            onClick={onViewScript}
            className="text-[11px] px-2.5 py-1 rounded border border-[var(--annotix-border)] hover:text-[var(--annotix-primary)] hover:border-[var(--annotix-primary)] transition-colors flex items-center gap-1"
          >
            <i className="fas fa-code text-[9px]" />
            {t('settings.trainingModels.viewScript')}
          </button>
        </div>

        {/* Default params table */}
        <div>
          <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {t('settings.trainingModels.defaultConfig')}
          </h4>
          <ParamsTable backendId={backend.id} />
        </div>
      </div>
    </div>
  );
}
