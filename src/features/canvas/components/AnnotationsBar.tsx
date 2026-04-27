import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { useUIStore } from '@/features/core/store/uiStore';
import { useAnnotations } from '../hooks/useAnnotations';
import { AnnotationThumbnailCard } from './AnnotationThumbnailCard';
import { cn } from '@/lib/utils';
import { CLASS_SHORTCUTS } from '@/features/core/constants';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface AnnotationsBarProps {
  image: HTMLImageElement;
}

export const AnnotationsBar: React.FC<AnnotationsBarProps> = ({ image }) => {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const currentImageId = useUIStore((s) => s.currentImageId);
  const { annotations, selectedAnnotationIds, selectAnnotation, deleteAnnotation } = useAnnotations();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [classIdFilter, setClassIdFilter] = useState<Set<number>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Reset filtros marks al cambiar imagen (opción B: marks = puntual)
  useEffect(() => {
    setSearch('');
    setClassIdFilter(new Set());
    setTypeFilter(new Set());
  }, [currentImageId]);

  const presentClassIds = useMemo(() => {
    const s = new Set<number>();
    annotations.forEach((a) => s.add(a.classId));
    return [...s];
  }, [annotations]);
  const presentTypes = useMemo(() => {
    const s = new Set<string>();
    annotations.forEach((a) => s.add(a.type));
    return [...s];
  }, [annotations]);

  const filteredAnnotations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return annotations.filter((a) => {
      if (classIdFilter.size > 0 && !classIdFilter.has(a.classId)) return false;
      if (typeFilter.size > 0 && !typeFilter.has(a.type)) return false;
      if (q) {
        const cls = project?.classes.find((c) => c.id === a.classId);
        if (!cls?.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [annotations, classIdFilter, typeFilter, search, project]);

  const filterActive = search.length > 0 || classIdFilter.size > 0 || typeFilter.size > 0;
  const clearFilters = () => {
    setSearch('');
    setClassIdFilter(new Set());
    setTypeFilter(new Set());
  };
  const toggleClassId = (id: number) => {
    setClassIdFilter((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleType = (type: string) => {
    setTypeFilter((prev) => {
      const n = new Set(prev);
      if (n.has(type)) n.delete(type); else n.add(type);
      return n;
    });
  };

  // Scroll horizontal con rueda del mouse
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!listRef.current) return;
    e.preventDefault();
    listRef.current.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
  }, []);

  // Auto-scroll al thumbnail seleccionado
  useEffect(() => {
    if (selectedAnnotationIds.size !== 1) return;
    const selectedId = [...selectedAnnotationIds][0];
    const card = cardRefs.current.get(selectedId);
    if (!card || !listRef.current) return;

    const list = listRef.current;
    const cardLeft = card.offsetLeft;
    const cardRight = cardLeft + card.offsetWidth;
    const listLeft = list.scrollLeft;
    const listRight = listLeft + list.clientWidth;

    // Si el card no es visible, hacer scroll para centrarlo
    if (cardLeft < listLeft || cardRight > listRight) {
      const targetScroll = cardLeft - list.clientWidth / 2 + card.offsetWidth / 2;
      list.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  }, [selectedAnnotationIds]);

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(id, el);
    } else {
      cardRefs.current.delete(id);
    }
  }, []);

  // Ocultar badge de tipo si todas las anotaciones son del mismo tipo
  const uniqueTypes = new Set(filteredAnnotations.map(a => a.type));
  const hideTypeBadge = uniqueTypes.size <= 1;

  if (!project) return null;

  return (
    <div className={cn('annotix-annotations-bar', isCollapsed && 'collapsed')}>
      <div className="flex items-center h-full gap-2">
        {/* Collapse Button */}
        <button
          className="annotix-collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? t('annotations.expand') : t('annotations.collapse')}
        >
          <i className={cn('fas', isCollapsed ? 'fa-chevron-up' : 'fa-chevron-down')}></i>
        </button>

        {/* Filtros */}
        {!isCollapsed && annotations.length > 0 && (
          <div className="flex items-center gap-1 shrink-0" style={{ fontSize: '0.7rem' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('filters.search', 'Buscar...')}
              className="rounded border bg-background px-2 py-1"
              style={{ fontSize: '0.7rem', width: '90px' }}
            />
            <DropdownMenu open={filterOpen} onOpenChange={setFilterOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn('annotix-btn annotix-btn-outline', filterActive && 'border-primary')}
                  style={{ fontSize: '0.7rem', padding: '4px 8px' }}
                  title={t('filters.classFilter', 'Filtro')}
                >
                  <i className="fas fa-filter"></i>
                  {filterActive ? ` ${classIdFilter.size + typeFilter.size}` : ''}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 max-h-80 overflow-y-auto">
                <DropdownMenuLabel className="text-xs">{t('filters.classes', 'Clases')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {presentClassIds.length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">—</div>
                ) : presentClassIds.map((cid) => {
                  const cls = project?.classes.find((c) => c.id === cid);
                  if (!cls) return null;
                  return (
                    <DropdownMenuCheckboxItem
                      key={cid}
                      checked={classIdFilter.has(cid)}
                      onCheckedChange={() => toggleClassId(cid)}
                      onSelect={(e) => e.preventDefault()}
                      className="text-xs"
                    >
                      <div className="h-2.5 w-2.5 rounded-full mr-2" style={{ backgroundColor: cls.color }} />
                      <span className="truncate">{cls.name}</span>
                    </DropdownMenuCheckboxItem>
                  );
                })}
                {presentTypes.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs">{t('filters.types', 'Tipos')}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {presentTypes.map((tp) => (
                      <DropdownMenuCheckboxItem
                        key={tp}
                        checked={typeFilter.has(tp)}
                        onCheckedChange={() => toggleType(tp)}
                        onSelect={(e) => e.preventDefault()}
                        className="text-xs"
                      >
                        {tp}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {filterActive && (
              <button
                onClick={clearFilters}
                className="annotix-btn annotix-btn-outline"
                style={{ fontSize: '0.7rem', padding: '4px 6px' }}
                title={t('common.clear', 'Limpiar')}
              >
                <i className="fas fa-times"></i>
              </button>
            )}
            <span className="text-xs tabular-nums" style={{ color: 'var(--annotix-gray)' }}>
              {filteredAnnotations.length}/{annotations.length}
            </span>
          </div>
        )}

        {/* Annotations List */}
        {!isCollapsed && (
          <div
            ref={listRef}
            className="annotix-annotations-list"
            onWheel={handleWheel}
          >
            {annotations.length === 0 ? (
              <div className="flex items-center justify-center flex-1 text-sm" style={{ color: 'var(--annotix-gray)' }}>
                <i className="fas fa-inbox mr-2"></i>
                {t('annotations.empty')}
              </div>
            ) : filteredAnnotations.length === 0 ? (
              <div className="flex items-center justify-center flex-1 text-sm" style={{ color: 'var(--annotix-gray)' }}>
                <i className="fas fa-filter mr-2"></i>
                {t('filters.noMatches', 'sin coincidencias')}
              </div>
            ) : (
              filteredAnnotations.map((ann) => {
                const classInfo = project.classes.find(c => c.id === ann.classId);
                if (!classInfo) return null;
                const classIndex = project.classes.findIndex(c => c.id === ann.classId);
                const classShortcut = classIndex >= 0 ? CLASS_SHORTCUTS[classIndex] : undefined;

                return (
                  <div key={ann.id} ref={(el) => setCardRef(ann.id, el)}>
                    <AnnotationThumbnailCard
                      annotation={ann}
                      image={image}
                      classColor={classInfo.color}
                      className={classInfo.name}
                      classShortcut={classShortcut}
                      isSelected={selectedAnnotationIds.has(ann.id)}
                      hideTypeBadge={hideTypeBadge}
                      onSelect={() => selectAnnotation(ann.id)}
                      onDelete={() => deleteAnnotation(ann.id)}
                    />
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Annotation Count (when collapsed) */}
        {isCollapsed && (
          <span className="text-xs font-medium ml-2" style={{ color: 'var(--annotix-dark)' }}>
            {t('annotations.title')}: {annotations.length}
            {filterActive && ` (${filteredAnnotations.length} filtradas)`}
          </span>
        )}
      </div>
    </div>
  );
};
