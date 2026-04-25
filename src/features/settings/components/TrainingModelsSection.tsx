import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ALL_MODELS, TASK_LABELS,
  getBackendById, getModelById, getModelsByBackend,
} from '../data/backendsData';
import { BackendSidebar } from './training-models/BackendSidebar';
import { OverviewPanel } from './training-models/OverviewPanel';
import { BackendDetailPanel } from './training-models/BackendDetailPanel';
import { ModelDetailPanel } from './training-models/ModelDetailPanel';
import { ScriptViewerDialog } from './training-models/ScriptViewerDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

/* ─── View State ─────────────────────────────────────────────────────────── */

type ViewState =
  | { type: 'overview' }
  | { type: 'all' }
  | { type: 'backend'; backendId: string }
  | { type: 'model'; backendId: string; modelId: string };

/* ─── Component ──────────────────────────────────────────────────────────── */

export function TrainingModelsSection() {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewState>({ type: 'overview' });
  const [search, setSearch] = useState('');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [scriptBackendId, setScriptBackendId] = useState<string | null>(null);

  const scriptBackend = scriptBackendId ? getBackendById(scriptBackendId) ?? null : null;

  // All unique tasks for filtering
  const allTasks = useMemo(() => Object.keys(TASK_LABELS), []);

  // When search changes and active backend has no matches, go back to overview
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (value.trim() && view.type !== 'all') {
      const q = value.toLowerCase().trim();
      if (view.type === 'backend' || view.type === 'model') {
        const backendId = view.backendId;
        const backend = getBackendById(backendId);
        const hasMatch = ALL_MODELS.some(m =>
          m.backend === backendId &&
          (m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q) || (backend?.name.toLowerCase().includes(q) ?? false))
        );
        if (!hasMatch) setView({ type: 'overview' });
      }
    }
  }, [view]);

  const handleSelectBackend = useCallback((backendId: string) => {
    if (backendId === 'all') {
      setView({ type: 'all' });
    } else {
      setView({ type: 'backend', backendId });
    }
  }, []);

  const handleSelectModel = useCallback((backendId: string, modelId: string) => {
    setView({ type: 'model', backendId, modelId });
  }, []);

  const handleBackToBackend = useCallback((backendId: string) => {
    setView({ type: 'backend', backendId });
  }, []);

  const toggleTask = (task: string) => {
    setSelectedTasks(prev => 
      prev.includes(task) ? prev.filter(t => t !== task) : [...prev, task]
    );
  };

  // Resolve current view data
  const currentBackend = (view.type === 'backend' || view.type === 'model') ? getBackendById(view.backendId) : null;
  const currentModel = view.type === 'model' ? getModelById(view.modelId) : null;
  
  const allFilteredModels = useMemo(() => {
    const q = search.toLowerCase().trim();
    return ALL_MODELS.filter(m => {
      const matchesSearch = !q || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
      const matchesTasks = selectedTasks.length === 0 || m.tasks.some(t => selectedTasks.includes(t));
      return matchesSearch && matchesTasks;
    });
  }, [search, selectedTasks]);

  const backendModels = useMemo(() => {
    if (!currentBackend) return [];
    const models = getModelsByBackend(currentBackend.id);
    return models.filter(m => selectedTasks.length === 0 || m.tasks.some(t => selectedTasks.includes(t)));
  }, [currentBackend, selectedTasks]);

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
      {/* Search and Filters bar */}
      <div className="flex gap-2 mb-3 shrink-0">
        <div className="relative flex-1">
          <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder={t('settings.trainingModels.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] focus:border-[var(--annotix-primary)] focus:ring-1 focus:ring-[var(--annotix-primary)]/20 outline-none transition-all"
          />
          {search && (
            <button onClick={() => { setSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-[var(--annotix-primary)]">
              <i className="fas fa-times text-xs" />
            </button>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-[38px] px-3 gap-2">
              <i className="fas fa-filter text-xs" />
              {t('common.filters')}
              {selectedTasks.length > 0 && (
                <span className="bg-[var(--annotix-primary)] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                  {selectedTasks.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t('settings.trainingModels.filterByTask')}
            </div>
            <DropdownMenuSeparator />
            {allTasks.map(task => (
              <DropdownMenuCheckboxItem
                key={task}
                checked={selectedTasks.includes(task)}
                onCheckedChange={() => toggleTask(task)}
              >
                {TASK_LABELS[task]}
              </DropdownMenuCheckboxItem>
            ))}
            {selectedTasks.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-center justify-center text-[var(--annotix-primary)] font-medium"
                  onClick={() => setSelectedTasks([])}
                >
                  {t('common.clear')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Master-detail layout */}
      <div className="flex-1 min-h-0 rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] overflow-hidden flex transition-colors shadow-sm">
        {/* Sidebar */}
        <BackendSidebar
          selectedBackendId={
            view.type === 'all' ? 'all' : 
            (view.type === 'backend' || view.type === 'model') ? view.backendId : null
          }
          search={search}
          onSelect={handleSelectBackend}
        />

        {/* Detail panel */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {view.type === 'overview' && (
            <div className="flex-1 overflow-y-auto">
              <OverviewPanel onSelectBackend={handleSelectBackend} />
            </div>
          )}

          {view.type === 'all' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-[var(--annotix-border)] bg-[var(--annotix-light)] shrink-0 transition-colors">
                <h3 className="text-base font-semibold text-[var(--annotix-dark)]">
                  {t('settings.trainingModels.allModels', 'Todos los modelos')}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {allFilteredModels.length} {t('settings.trainingModels.totalModels').toLowerCase()}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-2.5">
                  {allFilteredModels.map(m => {
                    const backend = getBackendById(m.backend);
                    return (
                      <button
                        key={`${m.backend}-${m.id}`}
                        onClick={() => handleSelectModel(m.backend, m.id)}
                        className="text-left p-3 rounded-lg border border-[var(--annotix-border)] bg-[var(--annotix-white)] hover:border-[var(--annotix-primary)]/40 hover:shadow-sm transition-all group"
                      >
                        <div className="flex items-center justify-between gap-1.5 mb-1">
                          <span className="text-[13px] font-medium text-[var(--annotix-dark)] group-hover:text-[var(--annotix-primary)] transition-colors truncate">
                            {m.name}
                          </span>
                          {backend && (
                            <i className={`${backend.icon} text-[10px] text-muted-foreground`} title={backend.name} />
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-tight mb-2 line-clamp-2 h-7">
                          {m.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-0.5 flex-wrap">
                            {m.tasks.slice(0, 2).map(task => (
                              <span key={task} className="text-[8px] px-1.5 py-0.5 rounded-full bg-[var(--annotix-primary)]/10 text-[var(--annotix-primary)] font-medium">
                                {TASK_LABELS[task]}
                              </span>
                            ))}
                            {m.tasks.length > 2 && <span className="text-[8px] text-muted-foreground">+{m.tasks.length - 2}</span>}
                          </div>
                          {m.params && (
                            <span className="text-[9px] font-mono text-muted-foreground">{m.params}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {view.type === 'backend' && currentBackend && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <BackendDetailPanel
                backend={currentBackend}
                models={backendModels}
                search={search}
                onSelectModel={(modelId) => handleSelectModel(currentBackend.id, modelId)}
                onViewScript={() => setScriptBackendId(currentBackend.id)}
              />
            </div>
          )}

          {view.type === 'model' && currentBackend && currentModel && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <ModelDetailPanel
                model={currentModel}
                backend={currentBackend}
                onBack={() => handleBackToBackend(currentBackend.id)}
                onViewScript={() => setScriptBackendId(currentBackend.id)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Script viewer dialog */}
      <ScriptViewerDialog
        backend={scriptBackend}
        open={!!scriptBackend}
        onClose={() => setScriptBackendId(null)}
      />
    </div>
  );
}
