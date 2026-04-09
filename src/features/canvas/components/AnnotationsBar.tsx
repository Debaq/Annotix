import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { useAnnotations } from '../hooks/useAnnotations';
import { AnnotationThumbnailCard } from './AnnotationThumbnailCard';
import { cn } from '@/lib/utils';
import { CLASS_SHORTCUTS } from '@/features/core/constants';

interface AnnotationsBarProps {
  image: HTMLImageElement;
}

export const AnnotationsBar: React.FC<AnnotationsBarProps> = ({ image }) => {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { annotations, selectedAnnotationIds, selectAnnotation, deleteAnnotation } = useAnnotations();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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
  const uniqueTypes = new Set(annotations.map(a => a.type));
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
            ) : (
              annotations.map((ann) => {
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
          </span>
        )}
      </div>
    </div>
  );
};
