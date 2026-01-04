import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentProject } from '@/features/projects/hooks/useCurrentProject';
import { useAnnotations } from '../hooks/useAnnotations';
import { AnnotationThumbnailCard } from './AnnotationThumbnailCard';
import { cn } from '@/lib/utils';

interface AnnotationsBarProps {
  image: HTMLImageElement;
}

export const AnnotationsBar: React.FC<AnnotationsBarProps> = ({ image }) => {
  const { t } = useTranslation();
  const { project } = useCurrentProject();
  const { annotations, selectedAnnotationId, selectAnnotation, deleteAnnotation } = useAnnotations();
  const [isCollapsed, setIsCollapsed] = useState(false);

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
          <div className="annotix-annotations-list">
            {annotations.length === 0 ? (
              <div className="flex items-center justify-center flex-1 text-sm" style={{ color: 'var(--annotix-gray)' }}>
                <i className="fas fa-inbox mr-2"></i>
                {t('annotations.empty')}
              </div>
            ) : (
              annotations.map((ann) => {
                const classInfo = project.classes.find(c => c.id === ann.classId);
                if (!classInfo) return null;

                return (
                  <AnnotationThumbnailCard
                    key={ann.id}
                    annotation={ann}
                    image={image}
                    classColor={classInfo.color}
                    className={classInfo.name}
                    isSelected={selectedAnnotationId === ann.id}
                    onSelect={() => selectAnnotation(ann.id)}
                    onDelete={() => {
                      if (confirm(t('annotations.confirmDelete'))) {
                        deleteAnnotation(ann.id);
                      }
                    }}
                  />
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
