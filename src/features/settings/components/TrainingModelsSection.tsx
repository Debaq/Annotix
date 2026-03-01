import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ALL_MODELS, BACKEND_META,
  getBackendById, getModelById, getModelsByBackend,
} from '../data/backendsData';
import { BackendSidebar } from './training-models/BackendSidebar';
import { OverviewPanel } from './training-models/OverviewPanel';
import { BackendDetailPanel } from './training-models/BackendDetailPanel';
import { ModelDetailPanel } from './training-models/ModelDetailPanel';
import { ScriptViewerDialog } from './training-models/ScriptViewerDialog';

/* ─── View State ─────────────────────────────────────────────────────────── */

type ViewState =
  | { type: 'overview' }
  | { type: 'backend'; backendId: string }
  | { type: 'model'; backendId: string; modelId: string };

/* ─── Component ──────────────────────────────────────────────────────────── */

export function TrainingModelsSection() {
  const { t } = useTranslation();
  const [view, setView] = useState<ViewState>({ type: 'overview' });
  const [search, setSearch] = useState('');
  const [scriptBackendId, setScriptBackendId] = useState<string | null>(null);

  const scriptBackend = scriptBackendId ? getBackendById(scriptBackendId) ?? null : null;

  // When search changes and active backend has no matches, go back to overview
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (value.trim()) {
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
    setView({ type: 'backend', backendId });
  }, []);

  const handleSelectModel = useCallback((backendId: string, modelId: string) => {
    setView({ type: 'model', backendId, modelId });
  }, []);

  const handleBackToBackend = useCallback((backendId: string) => {
    setView({ type: 'backend', backendId });
  }, []);

  // Resolve current view data
  const currentBackend = (view.type === 'backend' || view.type === 'model') ? getBackendById(view.backendId) : null;
  const currentModel = view.type === 'model' ? getModelById(view.modelId) : null;
  const backendModels = useMemo(() =>
    currentBackend ? getModelsByBackend(currentBackend.id) : [],
    [currentBackend]
  );

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs" />
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder={t('settings.trainingModels.searchPlaceholder')}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--annotix-border)] bg-gray-50 focus:bg-white focus:border-[var(--annotix-primary)] focus:ring-1 focus:ring-[var(--annotix-primary)]/20 outline-none transition-all"
        />
        {search && (
          <button onClick={() => { setSearch(''); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-[var(--annotix-dark)]">
            <i className="fas fa-times text-xs" />
          </button>
        )}
      </div>

      {/* Master-detail layout */}
      <div className="rounded-lg border border-[var(--annotix-border)] bg-white overflow-hidden flex" style={{ height: '540px' }}>
        {/* Sidebar */}
        <BackendSidebar
          selectedBackendId={(view.type === 'backend' || view.type === 'model') ? view.backendId : null}
          search={search}
          onSelect={handleSelectBackend}
        />

        {/* Detail panel */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {view.type === 'overview' && (
            <OverviewPanel onSelectBackend={handleSelectBackend} />
          )}
          {view.type === 'backend' && currentBackend && (
            <BackendDetailPanel
              backend={currentBackend}
              models={backendModels}
              search={search}
              onSelectModel={(modelId) => handleSelectModel(currentBackend.id, modelId)}
              onViewScript={() => setScriptBackendId(currentBackend.id)}
            />
          )}
          {view.type === 'model' && currentBackend && currentModel && (
            <ModelDetailPanel
              model={currentModel}
              backend={currentBackend}
              onBack={() => handleBackToBackend(currentBackend.id)}
              onViewScript={() => setScriptBackendId(currentBackend.id)}
            />
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
