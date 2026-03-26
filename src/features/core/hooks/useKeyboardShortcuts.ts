import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useImageNavigation } from '../../gallery/hooks/useImageNavigation';
import { useAnnotations } from '../../canvas/hooks/useAnnotations';
import { CLASS_SHORTCUTS } from '../constants';
import { matchesShortcut } from '../utils/matchShortcut';

export function useKeyboardShortcuts() {
  const { setActiveTool, setActiveClassId } = useUIStore();
  const { project } = useCurrentProject();
  const { navigatePrevious, navigateNext } = useImageNavigation();
  const { selectedAnnotationId, deleteAnnotation } = useAnnotations();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const key = e.key.toLowerCase();

      // Class selection shortcuts (take precedence)
      const classIndex = CLASS_SHORTCUTS.indexOf(key);
      if (classIndex !== -1 && !e.ctrlKey && !e.metaKey) {
        if (project?.classes && project.classes[classIndex]) {
          e.preventDefault();
          setActiveClassId(project.classes[classIndex].id);
          return; // Stop processing other shortcuts
        }
      }

      // Tool shortcuts
      if (matchesShortcut(e, 'tool-box')) {
        e.preventDefault();
        if (project?.type === 'bbox') setActiveTool('bbox');
      } else if (matchesShortcut(e, 'tool-mask')) {
        e.preventDefault();
        if (project?.type === 'mask') setActiveTool('mask');
      } else if (matchesShortcut(e, 'tool-polygon')) {
        e.preventDefault();
        if (project?.type === 'polygon') setActiveTool('polygon');
      } else if (matchesShortcut(e, 'tool-keypoints')) {
        e.preventDefault();
        if (project?.type === 'keypoints') setActiveTool('keypoints');
      } else if (matchesShortcut(e, 'tool-landmarks')) {
        e.preventDefault();
        if (project?.type === 'landmarks') setActiveTool('landmarks');
      } else if (matchesShortcut(e, 'tool-obb')) {
        e.preventDefault();
        if (project?.type === 'obb') setActiveTool('obb');
      } else if (matchesShortcut(e, 'tool-select')) {
        e.preventDefault();
        setActiveTool('select');
      } else if (matchesShortcut(e, 'tool-pan')) {
        e.preventDefault();
        setActiveTool('pan');
      }

      // Navigation (only if no annotation is selected)
      if (matchesShortcut(e, 'prev-image')) {
        if (!selectedAnnotationId) {
          e.preventDefault();
          navigatePrevious();
        }
      } else if (matchesShortcut(e, 'next-image')) {
        if (!selectedAnnotationId) {
          e.preventDefault();
          navigateNext();
        }
      }

      // Save shortcut
      if (matchesShortcut(e, 'save')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('annotix:save'));
      }

      // Undo shortcut
      if (matchesShortcut(e, 'undo')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('annotix:undo'));
      }

      // Redo shortcut
      if (matchesShortcut(e, 'redo')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('annotix:redo'));
      }

      // Delete selected annotation
      if (matchesShortcut(e, 'delete')) {
        if (selectedAnnotationId) {
          e.preventDefault();
          void deleteAnnotation(selectedAnnotationId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project, setActiveTool, setActiveClassId, navigatePrevious, navigateNext, selectedAnnotationId, deleteAnnotation]);
}
