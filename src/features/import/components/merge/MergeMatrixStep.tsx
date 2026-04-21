import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AnalyzeClass,
  AnalyzeResult,
  Assignment,
  AssignmentMap,
  CanonicalClass,
  ChipKey,
  DEFAULT_COLORS,
  autofillByName,
  autofillFuzzy,
  chipKey,
  countByState,
  fmt,
  initFromProject,
  initFromUnion,
  makeCanonical,
  parseChipKey,
} from './types';

const DRAG_CHIP = 'application/x-annotix-chip';
const DRAG_ROW = 'application/x-annotix-row';

interface Props {
  analysis: AnalyzeResult;
  canonical: CanonicalClass[];
  setCanonical: React.Dispatch<React.SetStateAction<CanonicalClass[]>>;
  assignments: AssignmentMap;
  setAssignments: React.Dispatch<React.SetStateAction<AssignmentMap>>;
}

export const MergeMatrixStep: React.FC<Props> = ({
  analysis,
  canonical,
  setCanonical,
  assignments,
  setAssignments,
}) => {
  const { t } = useTranslation();
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [showPending, setShowPending] = useState(true);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Tipo de drag activo ('chip' | 'row' | null). Sirve para resaltar zonas válidas.
  const [dragKind, setDragKind] = useState<'chip' | 'row' | null>(null);

  // ─── Helpers locales (usan props) ───────────────────────────────────────
  const classesByKey = useMemo(() => {
    const m = new Map<ChipKey, { pi: number; cls: AnalyzeClass }>();
    analysis.projects.forEach((p, pi) =>
      p.classes.forEach((cls) => m.set(chipKey(pi, cls.id), { pi, cls })),
    );
    return m;
  }, [analysis]);

  const cellsByCanon = useMemo(() => {
    // canonLocalId → pi → ChipKey[]
    const out: Record<string, Record<number, ChipKey[]>> = {};
    canonical.forEach((c) => {
      out[c.localId] = {};
      analysis.projects.forEach((_, pi) => {
        out[c.localId][pi] = [];
      });
    });
    Object.entries(assignments).forEach(([k, a]) => {
      if (a.state !== 'assigned' || !a.canonLocalId) return;
      const bucket = out[a.canonLocalId];
      if (!bucket) return;
      const [pi] = parseChipKey(k);
      if (bucket[pi]) bucket[pi].push(k);
    });
    return out;
  }, [canonical, assignments, analysis]);

  const pendingByProject = useMemo(() => {
    const out: ChipKey[][] = analysis.projects.map(() => []);
    Object.entries(assignments).forEach(([k, a]) => {
      if (a.state !== 'pending') return;
      const [pi] = parseChipKey(k);
      out[pi]?.push(k);
    });
    return out;
  }, [assignments, analysis]);

  const discardedByProject = useMemo(() => {
    const out: ChipKey[][] = analysis.projects.map(() => []);
    Object.entries(assignments).forEach(([k, a]) => {
      if (a.state !== 'discarded') return;
      const [pi] = parseChipKey(k);
      out[pi]?.push(k);
    });
    return out;
  }, [assignments, analysis]);

  const canonTotals = useMemo(() => {
    const out: Record<string, number> = {};
    canonical.forEach((c) => (out[c.localId] = 0));
    Object.entries(assignments).forEach(([k, a]) => {
      if (a.state !== 'assigned' || !a.canonLocalId) return;
      const c = classesByKey.get(k);
      if (c && out[a.canonLocalId] != null) out[a.canonLocalId] += c.cls.annotationCount;
    });
    return out;
  }, [canonical, assignments, classesByKey]);

  const projectTotals = useMemo(() => {
    return analysis.projects.map((p) => {
      let anns = 0;
      p.classes.forEach((c) => (anns += c.annotationCount));
      return anns;
    });
  }, [analysis]);

  const counts = useMemo(() => countByState(assignments), [assignments]);

  // ─── Acciones ──────────────────────────────────────────────────────────
  const assignChip = (k: ChipKey, canonLocalId: string) => {
    setAssignments((m) => ({ ...m, [k]: { state: 'assigned', canonLocalId } }));
  };
  const sendToPending = (k: ChipKey) => {
    setAssignments((m) => ({ ...m, [k]: { state: 'pending', canonLocalId: null } }));
  };
  const discardChip = (k: ChipKey) => {
    setAssignments((m) => ({ ...m, [k]: { state: 'discarded', canonLocalId: null } }));
  };

  const promoteToCanonical = (k: ChipKey) => {
    const info = classesByKey.get(k);
    if (!info) return;
    const c = makeCanonical({
      name: info.cls.name,
      color: info.cls.color || DEFAULT_COLORS[canonical.length % DEFAULT_COLORS.length],
      description: info.cls.description ?? null,
    });
    setCanonical((arr) => [...arr, c]);
    setAssignments((m) => ({ ...m, [k]: { state: 'assigned', canonLocalId: c.localId } }));
  };

  const addEmptyCanonical = () => {
    const c = makeCanonical({
      name: `class_${canonical.length}`,
      color: DEFAULT_COLORS[canonical.length % DEFAULT_COLORS.length],
    });
    setCanonical((arr) => [...arr, c]);
  };

  const updateCanonical = (localId: string, patch: Partial<CanonicalClass>) => {
    setCanonical((arr) => arr.map((c) => (c.localId === localId ? { ...c, ...patch } : c)));
  };

  const removeCanonical = (localId: string) => {
    if (canonical.length <= 1) return;
    setCanonical((arr) => arr.filter((c) => c.localId !== localId));
    // Sus chips vuelven a pending (NO se descartan: principio no negociable).
    setAssignments((m) => {
      const next: AssignmentMap = {};
      for (const [k, a] of Object.entries(m)) {
        next[k] =
          a.state === 'assigned' && a.canonLocalId === localId
            ? { state: 'pending', canonLocalId: null }
            : a;
      }
      return next;
    });
  };

  const moveCanonical = (localId: string, dir: -1 | 1) => {
    setCanonical((arr) => {
      const idx = arr.findIndex((c) => c.localId === localId);
      if (idx < 0) return arr;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      const copy = [...arr];
      [copy[idx], copy[newIdx]] = [copy[newIdx], copy[idx]];
      return copy;
    });
  };

  /** Reordena `localId` para que termine en la posición `targetIdx`. */
  const moveCanonicalToIndex = (localId: string, targetIdx: number) => {
    setCanonical((arr) => {
      const from = arr.findIndex((c) => c.localId === localId);
      if (from < 0) return arr;
      const copy = [...arr];
      const [item] = copy.splice(from, 1);
      const dst = Math.max(0, Math.min(copy.length, targetIdx));
      copy.splice(dst, 0, item);
      return copy;
    });
  };

  const rebaseFromProject = (pi: number) => {
    const { canonical: c, assignments: a } = initFromProject(analysis, pi);
    setCanonical(c);
    setAssignments(a);
  };
  const rebaseFromUnion = () => {
    const { canonical: c, assignments: a } = initFromUnion(analysis);
    setCanonical(c);
    setAssignments(a);
  };

  const runAutofill = () => {
    const { assignments: next } = autofillByName(canonical, assignments, analysis);
    setAssignments(next);
  };
  const runAutofillFuzzy = () => {
    const { assignments: next } = autofillFuzzy(canonical, assignments, analysis, 0.85);
    setAssignments(next);
  };

  // ─── Render ────────────────────────────────────────────────────────────
  const Chip: React.FC<{ k: ChipKey; bgColor?: string }> = ({ k, bgColor }) => {
    const info = classesByKey.get(k);
    if (!info) return null;
    const { cls } = info;
    return (
      <span
        className="group inline-flex items-center gap-0.5 rounded-full border pl-0.5 pr-0.5 py-0.5 text-[11px] max-w-full bg-white dark:bg-gray-900 hover:ring-2 hover:ring-sky-400/40 select-none"
        style={{
          borderColor: bgColor ?? '#d1d5db',
          background: bgColor ? `${bgColor}14` : undefined,
        }}
      >
        <span
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_CHIP, k);
            e.dataTransfer.effectAllowed = 'move';
            setDragKind('chip');
          }}
          onDragEnd={() => {
            setDragKind(null);
            setDropTarget(null);
          }}
          onMouseDown={(e) => e.preventDefault()}
          className="inline-flex items-center gap-1 px-1 cursor-grab active:cursor-grabbing select-none"
          style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
          title={`${cls.name} #${cls.id} — ${fmt(cls.annotationCount)} · ${t('merge.dragHint', 'arrastra')}`}
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cls.color }} />
          <span className="truncate max-w-[90px] font-medium">{cls.name}</span>
          <span className="text-[9px] font-mono opacity-60">#{cls.id}</span>
          <span className="text-[10px] opacity-70">· {fmt(cls.annotationCount)}</span>
        </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="px-1 py-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-[10px] opacity-70 hover:opacity-100"
            title={t('merge.menu', 'Menú')}
          >
            <i className="fas fa-chevron-down"></i>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px] z-[10000]">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-gray-500">
            {cls.name} #{cls.id} · {fmt(cls.annotationCount)}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <i className="fas fa-arrow-right-arrow-left mr-1.5 text-xs"></i>
              {t('merge.moveTo', 'Mover a canónica')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[260px] overflow-y-auto z-[10001]">
              {canonical.map((c, i) => (
                <DropdownMenuItem key={c.localId} onClick={() => assignChip(k, c.localId)}>
                  <span className="w-2.5 h-2.5 rounded-full mr-2" style={{ background: c.color }} />
                  <span className="text-[10px] font-mono text-gray-500 mr-1">#{i}</span>
                  <span className="truncate">{c.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onClick={() => promoteToCanonical(k)}>
            <i className="fas fa-plus-circle mr-1.5 text-emerald-500 text-xs"></i>
            {t('merge.promote', 'Crear canónica con esta clase')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => sendToPending(k)}>
            <i className="fas fa-inbox mr-1.5 text-amber-500 text-xs"></i>
            {t('merge.toPending', 'Enviar a pendientes')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600 dark:text-red-400 focus:text-red-700"
            onClick={() => discardChip(k)}
          >
            <i className="fas fa-trash mr-1.5 text-xs"></i>
            {t('merge.discardExplicit', 'Descartar (tirar marcas)')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      </span>
    );
  };

  const CellAddButton: React.FC<{ canonLocalId: string; pi: number }> = ({ canonLocalId, pi }) => {
    const pending = pendingByProject[pi] ?? [];
    if (pending.length === 0) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 dark:border-gray-700 px-2 py-0.5 text-[10px] text-gray-500 hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400"
            title={t('merge.addFromPending', 'Añadir desde pendientes')}
          >
            <i className="fas fa-plus text-[9px]"></i>
            <span>{pending.length}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[240px] max-h-[300px] overflow-y-auto z-[10000]">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-gray-500">
            {t('merge.pendingOfProject', 'Pendientes de')} {analysis.projects[pi].name}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {pending.map((k) => {
            const info = classesByKey.get(k);
            if (!info) return null;
            const { cls } = info;
            return (
              <DropdownMenuItem key={k} onClick={() => assignChip(k, canonLocalId)}>
                <span
                  className="w-2.5 h-2.5 rounded-full mr-2"
                  style={{ background: cls.color }}
                />
                <span className="truncate">{cls.name}</span>
                <span className="ml-auto text-[10px] text-gray-500">
                  #{cls.id} · {fmt(cls.annotationCount)}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // ───────────────────────────────────────────────────────────────────────
  const tableMinWidth = 260 + analysis.projects.length * 200;

  return (
    <div className="space-y-3">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold">
            <i className="fas fa-table-cells mr-1.5 text-sky-500"></i>
            {t('merge.matrix', 'Matriz de fusión')}
          </span>
          <span className="text-gray-500">
            · {canonical.length} {t('common.classes', 'clases')}
          </span>
          <span className="text-emerald-600 dark:text-emerald-400">
            · {counts.assigned} {t('merge.assigned', 'asignadas')}
          </span>
          {counts.pending > 0 && (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              · {counts.pending} {t('merge.pending', 'pendientes')}
            </span>
          )}
          {counts.discarded > 0 && (
            <span className="text-red-500">
              · {counts.discarded} {t('merge.discardedCount', 'descartadas')}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Select
            onValueChange={(v) => {
              if (v === '__union__') rebaseFromUnion();
              else rebaseFromProject(Number(v));
            }}
          >
            <SelectTrigger className="h-8 w-[200px] text-xs">
              <SelectValue placeholder={t('merge.rebaseFrom', 'Re-base desde…')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__union__">
                <span className="flex items-center gap-2">
                  <i className="fas fa-object-group"></i>
                  {t('merge.rebaseUnion', 'Unión de nombres')}
                </span>
              </SelectItem>
              {analysis.projects.map((p, pi) => (
                <SelectItem key={pi} value={String(pi)}>
                  {p.name} ({p.classes.length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={runAutofill} title={t('merge.autofillHelp', 'Asigna pendientes por nombre exacto')}>
            <i className="fas fa-magic-wand-sparkles mr-1"></i>
            {t('merge.autofill', 'Autofill')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={runAutofillFuzzy}
            title={t('merge.autofillFuzzyHelp', 'Asigna pendientes por similitud (≥ 0.85)')}
          >
            <i className="fas fa-wand-sparkles mr-1"></i>
            {t('merge.autofillFuzzy', 'Autofill ~')}
          </Button>
          <Button size="sm" variant="outline" onClick={addEmptyCanonical}>
            <i className="fas fa-plus mr-1"></i>
            {t('merge.addCanonical', 'Canónica')}
          </Button>
        </div>
      </div>

      {/* ── Matriz ─────────────────────────────────────────────────── */}
      <div className="border border-gray-200 dark:border-gray-800 rounded-md overflow-auto max-h-[52vh] relative">
        <table className="border-collapse" style={{ minWidth: tableMinWidth }}>
          <thead className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-900 shadow-sm">
            <tr>
              <th className="sticky left-0 z-30 bg-gray-50 dark:bg-gray-900 text-left px-3 py-2 text-[11px] uppercase tracking-wide text-gray-500 border-b border-r border-gray-200 dark:border-gray-800 min-w-[260px] w-[260px]">
                {t('merge.canonicalCol', 'Salida canónica')}
              </th>
              {analysis.projects.map((p, pi) => (
                <th
                  key={pi}
                  className="text-left px-3 py-2 border-b border-r border-gray-200 dark:border-gray-800 min-w-[200px]"
                >
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold truncate" title={p.name}>
                      {p.name}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {p.projectType} · {p.imageCount} img · {fmt(projectTotals[pi])}{' '}
                      {t('merge.annotations', 'anotaciones')}
                    </p>
                    <div className="flex gap-1 text-[10px]">
                      {pendingByProject[pi]?.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                          {pendingByProject[pi].length} {t('merge.pendingShort', 'pend.')}
                        </span>
                      )}
                      {discardedByProject[pi]?.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                          {discardedByProject[pi].length} {t('merge.discardedShort', 'desc.')}
                        </span>
                      )}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {canonical.map((c, idx) => {
              const rowDropId = `row:${c.localId}`;
              const rowDropActive = dropTarget === rowDropId && dragKind === 'row';
              return (
              <tr key={c.localId} className="group">
                {/* Primera col sticky: canónica editable + drop zone de filas */}
                <td
                  className={`sticky left-0 z-10 bg-white dark:bg-gray-950 align-top px-2 py-2 border-b border-r border-gray-200 dark:border-gray-800 ${
                    rowDropActive ? 'outline outline-2 -outline-offset-2 outline-sky-400' : ''
                  }`}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(DRAG_ROW)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDropTarget(rowDropId);
                    }
                  }}
                  onDragLeave={() => {
                    if (dropTarget === rowDropId) setDropTarget(null);
                  }}
                  onDrop={(e) => {
                    const draggedId = e.dataTransfer.getData(DRAG_ROW);
                    if (draggedId && draggedId !== c.localId) {
                      moveCanonicalToIndex(draggedId, idx);
                    }
                    setDropTarget(null);
                    setDragKind(null);
                  }}
                >
                  <div className="flex items-start gap-2">
                    <div
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DRAG_ROW, c.localId);
                        e.dataTransfer.effectAllowed = 'move';
                        setDragKind('row');
                      }}
                      onDragEnd={() => {
                        setDragKind(null);
                        setDropTarget(null);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
                      className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mt-1 px-1 select-none"
                      title={t('merge.dragRow', 'Arrastra para reordenar')}
                    >
                      <i className="fas fa-grip-vertical text-[11px]"></i>
                    </div>
                    <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 shrink-0 mt-1">
                      #{idx}
                    </span>
                    <input
                      type="color"
                      value={c.color}
                      onChange={(e) => updateCanonical(c.localId, { color: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer border border-gray-300 shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <Input
                        value={c.name}
                        onChange={(e) => updateCanonical(c.localId, { name: e.target.value })}
                        className="h-7 text-xs px-2"
                      />
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] text-gray-500">
                          <i className="fas fa-tag mr-1"></i>
                          {fmt(canonTotals[c.localId] || 0)}
                        </span>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => moveCanonical(c.localId, -1)}
                            disabled={idx === 0}
                            className="w-5 h-5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                            title={t('common.moveUp', 'Subir')}
                          >
                            <i className="fas fa-arrow-up text-[9px]"></i>
                          </button>
                          <button
                            onClick={() => moveCanonical(c.localId, 1)}
                            disabled={idx === canonical.length - 1}
                            className="w-5 h-5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30"
                            title={t('common.moveDown', 'Bajar')}
                          >
                            <i className="fas fa-arrow-down text-[9px]"></i>
                          </button>
                          <button
                            onClick={() => removeCanonical(c.localId)}
                            disabled={canonical.length <= 1}
                            className="w-5 h-5 rounded hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 disabled:opacity-30"
                            title={t('merge.removeCanonical', 'Quitar (chips → pendientes)')}
                          >
                            <i className="fas fa-times text-[9px]"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>

                {/* Celdas por proyecto */}
                {analysis.projects.map((_, pi) => {
                  const chips = cellsByCanon[c.localId]?.[pi] ?? [];
                  const empty = chips.length === 0;
                  const cellId = `cell:${c.localId}:${pi}`;
                  const cellActive = dropTarget === cellId && dragKind === 'chip';
                  return (
                    <td
                      key={pi}
                      className={`align-top px-2 py-2 border-b border-r border-gray-200 dark:border-gray-800 ${
                        cellActive
                          ? 'bg-sky-50 dark:bg-sky-950/30 outline outline-2 -outline-offset-2 outline-sky-400'
                          : dragKind === 'chip'
                          ? 'bg-sky-50/30 dark:bg-sky-950/10'
                          : ''
                      }`}
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes(DRAG_CHIP)) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDropTarget(cellId);
                        }
                      }}
                      onDragLeave={() => {
                        if (dropTarget === cellId) setDropTarget(null);
                      }}
                      onDrop={(e) => {
                        const k = e.dataTransfer.getData(DRAG_CHIP) as ChipKey;
                        if (k) assignChip(k, c.localId);
                        setDropTarget(null);
                        setDragKind(null);
                      }}
                    >
                      <div className="flex flex-wrap gap-1 min-h-[28px]">
                        {chips.map((k) => (
                          <Chip key={k} k={k} bgColor={c.color} />
                        ))}
                        {empty && !cellActive && (
                          <span className="text-gray-300 dark:text-gray-700 text-xs select-none">
                            —
                          </span>
                        )}
                        <CellAddButton canonLocalId={c.localId} pi={pi} />
                      </div>
                    </td>
                  );
                })}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pendientes ──────────────────────────────────────────────── */}
      <section
        className={`rounded-md border p-2 transition-colors ${
          dropTarget === 'pending' && dragKind === 'chip'
            ? 'border-amber-500 ring-2 ring-amber-300 bg-amber-100/50 dark:bg-amber-900/30'
            : counts.pending > 0
            ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20'
            : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40'
        }`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_CHIP)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropTarget('pending');
          }
        }}
        onDragLeave={() => {
          if (dropTarget === 'pending') setDropTarget(null);
        }}
        onDrop={(e) => {
          const k = e.dataTransfer.getData(DRAG_CHIP) as ChipKey;
          if (k) sendToPending(k);
          setDropTarget(null);
          setDragKind(null);
        }}
      >
        <button
          onClick={() => setShowPending((v) => !v)}
          className="flex items-center gap-2 w-full text-left text-sm font-medium"
        >
          <i
            className={`fas fa-chevron-${showPending ? 'down' : 'right'} text-[10px] text-gray-400`}
          ></i>
          <i
            className={`fas fa-inbox ${
              counts.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'
            }`}
          ></i>
          <span>{t('merge.pendingSection', 'Pendientes sin asignar')}</span>
          {counts.pending > 0 ? (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-800/60 text-amber-900 dark:text-amber-100 font-semibold">
              {counts.pending}
            </span>
          ) : (
            <span className="ml-auto text-xs text-gray-500">
              {t('merge.allAssigned', 'Todo asignado ✓')}
            </span>
          )}
        </button>
        {showPending && counts.pending > 0 && (
          <div className="mt-2 space-y-2">
            {analysis.projects.map((p, pi) => {
              const list = pendingByProject[pi] ?? [];
              if (list.length === 0) return null;
              return (
                <div key={pi}>
                  <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {p.name}
                    <span className="text-gray-400 ml-1">({list.length})</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((k) => (
                      <Chip key={k} k={k} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Descartadas ─────────────────────────────────────────────── */}
      <section
        className={`rounded-md border p-2 transition-colors ${
          dropTarget === 'discarded' && dragKind === 'chip'
            ? 'border-red-500 ring-2 ring-red-300 bg-red-100/50 dark:bg-red-900/30'
            : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40'
        }`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(DRAG_CHIP)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDropTarget('discarded');
          }
        }}
        onDragLeave={() => {
          if (dropTarget === 'discarded') setDropTarget(null);
        }}
        onDrop={(e) => {
          const k = e.dataTransfer.getData(DRAG_CHIP) as ChipKey;
          if (k) discardChip(k);
          setDropTarget(null);
          setDragKind(null);
        }}
      >
        <button
          onClick={() => setShowDiscarded((v) => !v)}
          className="flex items-center gap-2 w-full text-left text-sm font-medium"
        >
          <i
            className={`fas fa-chevron-${showDiscarded ? 'down' : 'right'} text-[10px] text-gray-400`}
          ></i>
          <i
            className={`fas fa-trash ${
              counts.discarded > 0 ? 'text-red-500' : 'text-gray-400'
            }`}
          ></i>
          <span>{t('merge.discardedSection', 'Descartadas')}</span>
          <span className="ml-auto text-xs text-gray-500">{counts.discarded}</span>
        </button>
        {showDiscarded && counts.discarded > 0 && (
          <div className="mt-2 space-y-2">
            {analysis.projects.map((p, pi) => {
              const list = discardedByProject[pi] ?? [];
              if (list.length === 0) return null;
              return (
                <div key={pi}>
                  <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {p.name}
                    <span className="text-gray-400 ml-1">({list.length})</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((k) => (
                      <Chip key={k} k={k} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
