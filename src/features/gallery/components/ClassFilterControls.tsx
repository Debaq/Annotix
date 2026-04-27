import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore, type ClassFilterMode } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const MODE_LABEL: Record<ClassFilterMode, string> = {
  has: 'tiene',
  lacks: 'no tiene',
  only: 'solo',
  min: '≥ N',
};

export function ClassFilterControls() {
  const { t } = useTranslation();
  const { currentProjectId, projectFilters, setProjectFilter } = useUIStore();
  const { project } = useCurrentProject();
  const [open, setOpen] = useState(false);
  const filter = currentProjectId ? projectFilters[currentProjectId]?.classFilter : undefined;
  const selectedIds = filter?.classIds ?? [];
  const mode: ClassFilterMode = filter?.mode ?? 'has';
  const minCount = filter?.minCount ?? 1;
  const active = selectedIds.length > 0;
  const [minCountDraft, setMinCountDraft] = useState<string>(String(minCount));
  useEffect(() => { setMinCountDraft(String(minCount)); }, [minCount]);

  if (!project || !currentProjectId) return null;

  const update = (patch: Partial<NonNullable<typeof filter>>) => {
    const next = { classIds: selectedIds, mode, minCount, ...patch };
    if (next.classIds.length === 0) {
      setProjectFilter(currentProjectId, { classFilter: undefined });
    } else {
      setProjectFilter(currentProjectId, { classFilter: next });
    }
  };

  const toggleClass = (id: number) => {
    const set = new Set(selectedIds);
    if (set.has(id)) set.delete(id); else set.add(id);
    update({ classIds: [...set] });
  };

  const clear = () => setProjectFilter(currentProjectId, { classFilter: undefined });

  return (
    <div className="mt-2 flex items-center gap-1 flex-wrap" style={{ fontSize: '0.7rem' }}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'annotix-btn annotix-btn-outline flex items-center gap-1',
              active && 'border-primary',
            )}
            style={{ fontSize: '0.7rem', padding: '4px 8px' }}
            title={t('filters.classFilter', 'Filtro por clase')}
          >
            <i className="fas fa-filter"></i>
            {active ? `${selectedIds.length}` : t('filters.classes', 'clases')}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
          <DropdownMenuLabel className="text-xs">
            {t('filters.selectClasses', 'Seleccionar clases')}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {project.classes.length === 0 ? (
            <div className="p-2 text-xs text-muted-foreground">
              {t('classes.empty', 'sin clases')}
            </div>
          ) : project.classes.map((cls) => (
            <DropdownMenuCheckboxItem
              key={cls.id}
              checked={selectedIds.includes(cls.id)}
              onCheckedChange={() => toggleClass(cls.id)}
              onSelect={(e) => e.preventDefault()}
              className="text-xs"
            >
              <div
                className="h-2.5 w-2.5 rounded-full mr-2"
                style={{ backgroundColor: cls.color }}
              />
              <span className="truncate">{cls.name}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <select
        value={mode}
        onChange={(e) => update({ mode: e.target.value as ClassFilterMode })}
        disabled={!active}
        className="annotix-btn annotix-btn-outline"
        style={{ fontSize: '0.7rem', padding: '4px 4px' }}
        title={t('filters.mode', 'Modo')}
      >
        <option value="has">{MODE_LABEL.has}</option>
        <option value="lacks">{MODE_LABEL.lacks}</option>
        <option value="only">{MODE_LABEL.only}</option>
        <option value="min">{MODE_LABEL.min}</option>
      </select>

      {mode === 'min' && active && (
        <input
          type="number"
          min={1}
          value={minCountDraft}
          onChange={(e) => setMinCountDraft(e.target.value)}
          onBlur={() => {
            const n = Math.max(1, parseInt(minCountDraft) || 1);
            setMinCountDraft(String(n));
            if (n !== minCount) update({ minCount: n });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="annotix-btn annotix-btn-outline"
          style={{ fontSize: '0.7rem', padding: '4px 4px', width: '48px' }}
          title={t('filters.minCount', 'Mínimo')}
        />
      )}

      {active && (
        <button
          onClick={clear}
          className="annotix-btn annotix-btn-outline"
          style={{ fontSize: '0.7rem', padding: '4px 6px' }}
          title={t('common.clear', 'Limpiar')}
        >
          <i className="fas fa-times"></i>
        </button>
      )}
    </div>
  );
}
