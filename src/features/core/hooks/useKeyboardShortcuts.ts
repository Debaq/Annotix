import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useImageNavigation } from '../../gallery/hooks/useImageNavigation';
import { useAnnotations } from '../../canvas/hooks/useAnnotations';
import { CLASS_SHORTCUTS } from '../constants';

export function useKeyboardShortcuts() {
  const { setActiveTool, setActiveClassId } = useUIStore();
  const { project } = useCurrentProject();
  const { navigatePrevious, navigateNext } = useImageNavigation();
  const { selectedAnnotationId } = useAnnotations();

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
      if (key === 'b' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.type === 'bbox') setActiveTool('bbox');
      } else if (key === 'm' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.type === 'mask') setActiveTool('mask');
      } else if (key === 'p' && !e.ctrlKey && !e.metaKey) {
        // Only if not used by class
        e.preventDefault();
        if (project?.type === 'polygon') setActiveTool('polygon');
      } else if (key === 'k' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.type === 'keypoints') setActiveTool('keypoints');
      } else if (key === 'l' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.type === 'landmarks') setActiveTool('landmarks');
      } else if (key === 'o' && !e.ctrlKey && !e.metaKey) {
        // Only if not used by class
        e.preventDefault();
        if (project?.type === 'obb') setActiveTool('obb');
      } else if (key === 'v' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setActiveTool('select');
      } else if (key === 'h' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setActiveTool('pan');
      }

      // Navigation (only if no annotation is selected)
      if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && !e.ctrlKey && !e.metaKey) {
        if (!selectedAnnotationId) {
          e.preventDefault();
          navigatePrevious();
        }
      } else if ((e.key === 'ArrowRight' || e.key === 'PageDown') && !e.ctrlKey && !e.metaKey) {
        if (!selectedAnnotationId) {
          e.preventDefault();
          navigateNext();
        }
      }

      // Save shortcut (Ctrl+S) - handled in canvas component
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        // Dispatch custom event for save
        window.dispatchEvent(new CustomEvent('annotix:save'));
      }

      // Undo shortcut (Ctrl+Z) - handled in canvas component
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        // Dispatch custom event for undo
        window.dispatchEvent(new CustomEvent('annotix:undo'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project, setActiveTool, setActiveClassId, navigatePrevious, navigateNext, selectedAnnotationId]);
}
