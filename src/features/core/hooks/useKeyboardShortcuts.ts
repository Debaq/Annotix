import { useEffect, useRef } from 'react';
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
  const { annotations, selectedAnnotationIds, deleteAnnotation, updateAnnotation } = useAnnotations();

  const digitBufferRef = useRef('');
  const digitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      const applyClassByIndex = (idx: number) => {
        if (!project?.classes || !project.classes[idx]) return;
        const targetClassId = project.classes[idx].id;
        if (selectedAnnotationIds.size > 0) {
          for (const id of selectedAnnotationIds) {
            const ann = annotations.find((a) => a.id === id);
            if (ann && ann.classId !== targetClassId) {
              updateAnnotation(id, { classId: targetClassId });
            }
          }
        }
        setActiveClassId(targetClassId);
      };

      const cancelTimer = () => {
        if (digitTimerRef.current) {
          clearTimeout(digitTimerRef.current);
          digitTimerRef.current = null;
        }
      };

      const flushBuffer = () => {
        cancelTimer();
        const buf = digitBufferRef.current;
        digitBufferRef.current = '';
        if (!buf) return;
        const n = parseInt(buf, 10);
        if (project?.classes && n >= 1 && n <= project.classes.length) {
          applyClassByIndex(n - 1);
        }
      };

      // Multi-digit class shortcuts: digits 1-9 buffer, "0" alone = class 10 (legacy)
      if (/^[0-9]$/.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!project?.classes || project.classes.length === 0) return;
        e.preventDefault();
        const total = project.classes.length;

        if (digitBufferRef.current === '' && key === '0') {
          // legacy: "0" sola = clase 10
          if (total >= 10) applyClassByIndex(9);
          return;
        }

        const candidate = digitBufferRef.current + key;
        const nCand = parseInt(candidate, 10);

        if (nCand >= 1 && nCand <= total) {
          digitBufferRef.current = candidate;
          cancelTimer();
          // Si extender no puede dar número válido, aplicar ya
          if (nCand * 10 > total) {
            flushBuffer();
          } else {
            digitTimerRef.current = setTimeout(flushBuffer, 400);
          }
        } else {
          // Candidato inválido: flush buffer previo, luego procesar dígito solo
          flushBuffer();
          if (key === '0') {
            if (total >= 10) applyClassByIndex(9);
          } else {
            const nSolo = parseInt(key, 10);
            if (nSolo >= 1 && nSolo <= total) {
              digitBufferRef.current = key;
              if (nSolo * 10 > total) {
                flushBuffer();
              } else {
                digitTimerRef.current = setTimeout(flushBuffer, 400);
              }
            }
          }
        }
        return;
      }

      // Letra atajo: flush buffer pendiente y aplicar
      const classIndex = CLASS_SHORTCUTS.indexOf(key);
      if (classIndex !== -1 && !e.ctrlKey && !e.metaKey) {
        if (project?.classes && project.classes[classIndex]) {
          e.preventDefault();
          flushBuffer();
          applyClassByIndex(classIndex);
          return;
        }
      }

      // Cualquier otra tecla: flush buffer
      flushBuffer();

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
      } else if (matchesShortcut(e, 'tool-pan')) {
        e.preventDefault();
        setActiveTool('pan');
      }

      // Navigation (only if no annotation is selected)
      if (matchesShortcut(e, 'prev-image')) {
        if (selectedAnnotationIds.size === 0) {
          e.preventDefault();
          navigatePrevious();
        }
      } else if (matchesShortcut(e, 'next-image')) {
        if (selectedAnnotationIds.size === 0) {
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

      // Arrow keys to move selected annotations
      if (selectedAnnotationIds.size > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

        for (const id of selectedAnnotationIds) {
          const ann = annotations.find(a => a.id === id);
          if (!ann) continue;
          const data = ann.data as any;
          if (data.x !== undefined && data.y !== undefined) {
            updateAnnotation(id, { data: { ...data, x: data.x + dx, y: data.y + dy } });
          } else if (data.points) {
            updateAnnotation(id, {
              data: { ...data, points: data.points.map((p: any) => ({ x: p.x + dx, y: p.y + dy })) },
            });
          }
        }
      }

      // Delete selected annotations
      if (matchesShortcut(e, 'delete')) {
        if (selectedAnnotationIds.size > 0) {
          e.preventDefault();
          for (const id of selectedAnnotationIds) {
            void deleteAnnotation(id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (digitTimerRef.current) {
        clearTimeout(digitTimerRef.current);
        digitTimerRef.current = null;
      }
    };
  }, [project, setActiveTool, setActiveClassId, navigatePrevious, navigateNext, selectedAnnotationIds, annotations, deleteAnnotation, updateAnnotation]);
}
