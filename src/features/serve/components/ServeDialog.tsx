import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ServeInfo {
  projectIds: string[];
  port: number;
  urls: string[];
  active: boolean;
  reachable: boolean;
  firewallHelp: string;
  autoSave: boolean;
}

interface ProjectSummary {
  id: string;
  name: string;
  type: string;
  imageCount: number;
}

interface Props {
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ServeDialog: React.FC<Props> = ({ projectId, open, onOpenChange }) => {
  const [status, setStatus] = useState<ServeInfo | null>(null);
  const [port, setPort] = useState(8090);
  const [autoSave, setAutoSave] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFirewallHelp, setShowFirewallHelp] = useState(false);

  // Multi-proyecto
  const [allProjects, setAllProjects] = useState<ProjectSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isMultiMode = projectId === null;

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const s = await invoke<ServeInfo | null>('get_serve_status');
      setStatus(s);
      if (s) {
        setPort(s.port);
        setAutoSave(s.autoSave);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    if (!isMultiMode) return;
    try {
      const projects = await invoke<ProjectSummary[]>('list_projects');
      setAllProjects(projects);
      // Pre-seleccionar todos
      setSelectedIds(new Set(projects.map(p => p.id)));
    } catch { /* ignore */ }
  }, [isMultiMode]);

  useEffect(() => {
    if (open) {
      setShowFirewallHelp(false);
      setError(null);
      fetchStatus();
      fetchProjects();
    }
  }, [open, fetchStatus, fetchProjects]);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const ids = isMultiMode ? Array.from(selectedIds) : [projectId!];
      const info = await invoke<ServeInfo>('start_serve', { projectIds: ids, port, autoSave });
      setStatus(info);
      if (!info.reachable) setShowFirewallHelp(true);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await invoke('stop_serve');
      setStatus(null);
    } catch (e: any) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAutoSave = async (value: boolean) => {
    setAutoSave(value);
    if (status?.active) {
      try { await invoke('set_serve_auto_save', { value }); } catch { /* ignore */ }
    }
  };

  const toggleProject = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(allProjects.map(p => p.id)));
  const selectNone = () => setSelectedIds(new Set());

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="bg-[#1e293b] border border-white/10 rounded-lg shadow-xl w-[480px] max-w-[95vw] max-h-[90vh] overflow-y-auto p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Compartir en red</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="text-white/50 hover:text-white text-xl leading-none"
          >&times;</button>
        </div>

        {!status?.active ? (
          <>
            <p className="text-sm text-slate-400 mb-4">
              {isMultiMode
                ? 'Selecciona los proyectos que quieres compartir en la red local.'
                : 'Inicia un servidor para que dispositivos en tu red local puedan anotar imágenes.'}
            </p>

            {/* Selector de proyectos (modo multi) */}
            {isMultiMode && allProjects.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Proyectos ({selectedIds.size}/{allProjects.length})</span>
                  <div className="flex gap-2">
                    <button onClick={selectAll} className="text-xs text-indigo-400 hover:text-indigo-300">Marcar todo</button>
                    <button onClick={selectNone} className="text-xs text-slate-500 hover:text-slate-400">Desmarcar todo</button>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {allProjects.map(p => (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 p-2.5 rounded cursor-pointer transition-colors ${
                        selectedIds.has(p.id) ? 'bg-indigo-900/30 border border-indigo-500/30' : 'bg-slate-800/40 border border-transparent hover:bg-slate-800/70'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleProject(p.id)}
                        className="w-4 h-4 rounded border-slate-500 text-indigo-600 focus:ring-indigo-500 bg-slate-700"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.type} · {p.imageCount} imágenes</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Puerto */}
            <div className="flex items-center gap-3 mb-3">
              <label className="text-sm text-slate-300">Puerto:</label>
              <input
                type="number" value={port} onChange={e => setPort(Number(e.target.value))}
                className="w-24 h-9 px-3 rounded bg-slate-700 border border-white/10 text-white text-sm"
                min={1024} max={65535}
              />
            </div>

            {/* Toggle auto-save */}
            <label className="flex items-center justify-between p-3 rounded bg-slate-800/60 border border-white/5 mb-4 cursor-pointer">
              <div>
                <div className="text-sm text-slate-200 font-medium">Guardado automático</div>
                <div className="text-xs text-slate-400 mt-0.5">Las anotaciones se sincronizan al instante</div>
              </div>
              <div
                className={`relative w-11 h-6 rounded-full transition-colors ${autoSave ? 'bg-indigo-600' : 'bg-slate-600'}`}
                onClick={() => setAutoSave(!autoSave)}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoSave ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </div>
            </label>

            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <button
              onClick={handleStart}
              disabled={loading || (isMultiMode && selectedIds.size === 0)}
              className="w-full h-10 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Iniciando...' : `Iniciar servidor${isMultiMode ? ` (${selectedIds.size} proyecto${selectedIds.size !== 1 ? 's' : ''})` : ''}`}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 p-2.5 rounded bg-green-900/30 border border-green-500/30">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
              <span className="text-sm text-green-400 font-medium">
                Servidor activo · {status.projectIds.length} proyecto{status.projectIds.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="space-y-2 mb-3">
              {status.urls.map(url => (
                <div key={url} className="flex items-center gap-2 p-3 rounded bg-slate-800 border border-white/10">
                  <span className="text-sm text-white font-mono flex-1 select-all">{url}</span>
                  <button
                    onClick={() => copyUrl(url)}
                    className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white transition-colors flex-shrink-0"
                  >{copied ? 'Copiado' : 'Copiar'}</button>
                </div>
              ))}
            </div>

            {/* Toggle auto-save (en vivo) */}
            <label className="flex items-center justify-between p-3 rounded bg-slate-800/60 border border-white/5 mb-3 cursor-pointer">
              <div>
                <div className="text-sm text-slate-200 font-medium">Guardado automático</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {autoSave ? 'Cambios se sincronizan al instante' : 'Los usuarios guardan manualmente'}
                </div>
              </div>
              <div
                className={`relative w-11 h-6 rounded-full transition-colors ${autoSave ? 'bg-indigo-600' : 'bg-slate-600'}`}
                onClick={() => handleToggleAutoSave(!autoSave)}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${autoSave ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </div>
            </label>

            {/* Firewall help */}
            <div className="mb-3">
              <button
                onClick={() => setShowFirewallHelp(!showFirewallHelp)}
                className="w-full text-left flex items-center gap-2 p-2.5 rounded bg-slate-800/60 border border-white/5 hover:bg-slate-800 transition-colors"
              >
                <span className="text-sm">{showFirewallHelp ? '▾' : '▸'}</span>
                <span className="text-sm text-amber-400">Los dispositivos no pueden conectarse?</span>
              </button>
              {showFirewallHelp && (
                <div className="mt-1 p-3 rounded bg-slate-800 border border-amber-500/20">
                  <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed font-mono">{status.firewallHelp}</p>
                  <div className="mt-3 pt-2 border-t border-white/5">
                    <button onClick={fetchStatus} disabled={loading}
                      className="h-8 px-3 rounded bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                    >{loading ? 'Verificando...' : 'Re-verificar conexión'}</button>
                  </div>
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <button onClick={handleStop} disabled={loading}
              className="w-full h-10 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >{loading ? 'Deteniendo...' : 'Detener servidor'}</button>
          </>
        )}
      </div>
    </div>
  );
};
