import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import {
  TASK_COLORS, TASK_LABELS, BACKEND_COLORS,
  type BackendMeta, type ModelEntry,
} from '../../data/backendsData';
import { trainingService } from '@/features/training/services/trainingService';
import { TerminalConsole } from '../TerminalConsole';
import { Progress } from '@/components/ui/progress';

interface Props {
  backend: BackendMeta;
  models: ModelEntry[];
  search: string;
  onSelectModel: (modelId: string) => void;
  onViewScript: () => void;
}

export function BackendDetailPanel({ backend, models, search, onSelectModel, onViewScript }: Props) {
  const { t } = useTranslation();
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<{ message: string; progress: number } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return models;
    return models.filter(m =>
      m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
    );
  }, [models, search]);

  useEffect(() => {
    if (!preparing) return;
    const unlisten = listen<{ message: string; progress: number; log?: string }>('training:env-setup-progress', (event) => {
      setProgress(event.payload);
      if (event.payload.log) setLogs(prev => [...prev, event.payload.log!]);
    });
    return () => { unlisten.then(f => f()); };
  }, [preparing]);

  const handlePrepare = async () => {
    setPreparing(true);
    setLogs([]);
    try {
      await trainingService.installBackendPackages(backend.id);
      alert('Backend preparado con éxito');
    } catch (e) {
      alert(`Error: ${e}`);
    } finally {
      setPreparing(false);
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-[var(--annotix-border)] bg-[var(--annotix-light)] shrink-0 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${BACKEND_COLORS[backend.id]}`}>
              <i className={`${backend.icon} text-lg`} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-[var(--annotix-dark)]">{backend.name}</h3>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                <span>
                  <i className="fas fa-database text-[9px] mr-1" />
                  {t('settings.trainingModels.datasetFormat')}: <strong>{backend.datasetFormat}</strong>
                </span>
                <span>
                  <i className="fab fa-python text-[9px] mr-1" />
                  <span className="font-mono">{backend.pipPackages.join(', ')}</span>
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrepare}
              disabled={preparing}
              className="text-[12px] px-3 py-1.5 rounded-lg bg-[var(--annotix-primary)] text-white hover:bg-[var(--annotix-primary)]/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {preparing ? <i className="fas fa-spinner fa-spin text-[10px]" /> : <i className="fas fa-tools text-[10px]" />}
              {t('settings.trainingModels.prepareBackend', 'Preparar Backend')}
            </button>
            <button
              onClick={onViewScript}
              className="text-[12px] px-3 py-1.5 rounded-lg border border-[var(--annotix-border)] text-muted-foreground hover:text-[var(--annotix-primary)] hover:border-[var(--annotix-primary)] transition-colors flex items-center gap-1.5"
            >
              <i className="fas fa-code text-[10px]" />
              {t('settings.trainingModels.viewScript')}
            </button>
          </div>
        </div>

        {preparing && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium">{progress?.message || 'Iniciando...'}</span>
              <span className="text-muted-foreground">{Math.round(progress?.progress || 0)}%</span>
            </div>
            <Progress value={progress?.progress ?? 5} className="h-1" />
            <TerminalConsole logs={logs} maxHeight="150px" />
          </div>
        )}
      </div>

      {/* Model cards */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[11px] text-muted-foreground mb-3">
          {filtered.length} / {models.length} {t('settings.trainingModels.totalModels').toLowerCase()}
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            <i className="fas fa-search text-lg mb-2 block opacity-30" />
            {t('settings.trainingModels.noResults')}
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5">
            {filtered.map(m => (
              <button
                key={m.id}
                onClick={() => onSelectModel(m.id)}
                className="text-left p-3 rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] hover:border-[var(--annotix-primary)]/40 hover:shadow-sm transition-all group"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[13px] font-medium text-[var(--annotix-dark)] group-hover:text-[var(--annotix-primary)] transition-colors">{m.name}</span>
                  {m.recommended && <i className="fas fa-star text-amber-400 text-[9px]" title={t('settings.trainingModels.recommended')} />}
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight mb-2">{m.description}</p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-0.5 flex-wrap">
                    {m.tasks.map(task => (
                      <span key={task} className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${TASK_COLORS[task]}`}>
                        {TASK_LABELS[task]}
                      </span>
                    ))}
                  </div>
                  {m.params && (
                    <span className="text-[10px] font-mono text-muted-foreground">{m.params}</span>
                  )}
                </div>
                {m.sizes && (
                  <div className="flex gap-0.5 mt-1.5">
                    {m.sizes.map(s => (
                      <span key={s} className="text-[9px] w-[16px] h-[16px] rounded flex items-center justify-center bg-[var(--annotix-gray-light)] text-muted-foreground font-mono uppercase">{s}</span>
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
