import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useImageNavigation } from '../../gallery/hooks/useImageNavigation';

export function useKeyboardShortcuts() {
  const { setActiveTool, setActiveClassId } = useUIStore();
  const { project } = useCurrentProject();
  const { navigatePrevious, navigateNext } = useImageNavigation();

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

      // Tool shortcuts
      if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.type === 'bbox') {
          setActiveTool('bbox');
        }
      } else if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.type === 'mask') {
          setActiveTool('mask');
        }
      } else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.type === 'polygon') {
          setActiveTool('polygon');
        }
      } else if (e.key.toLowerCase() === 'k' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.type === 'keypoints') {
          setActiveTool('keypoints');
        }
      } else if (e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.type === 'landmarks') {
          setActiveTool('landmarks');
        }
      } else if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.type === 'obb') {
          setActiveTool('obb');
        }
      } else if (e.key.toLowerCase() === 'v' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setActiveTool('select');
      } else if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setActiveTool('pan');
      }

      // Class selection (1-9)
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 9 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (project?.classes && project.classes[num - 1]) {
          setActiveClassId(project.classes[num - 1].id);
        }
      }

      // Navigation
      if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigatePrevious();
      } else if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        navigateNext();
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
  }, [project, setActiveTool, setActiveClassId, navigatePrevious, navigateNext]);
}
