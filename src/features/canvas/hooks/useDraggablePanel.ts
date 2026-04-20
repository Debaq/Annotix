import { useCallback, useEffect, useRef, useState } from 'react';

interface Position {
  left: number;
  top: number;
}

interface UseDraggablePanelResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleMouseDown: (e: React.MouseEvent) => void;
  position: Position | null;
  dragging: boolean;
  /** True si el último mousedown-mouseup fue un drag (movimiento >3px). Útil para suprimir clicks. */
  justDraggedRef: React.MutableRefObject<boolean>;
}

/**
 * Hook para paneles flotantes arrastrables con persistencia por proyecto en localStorage.
 * Si no hay posición guardada, `position` es null y el caller debe usar su estilo por defecto.
 */
export function useDraggablePanel(
  panelId: string,
  projectId: string | undefined,
): UseDraggablePanelResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStateRef = useRef<{ offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean } | null>(null);
  const justDraggedRef = useRef(false);

  const storageKey = projectId ? `annotix:panel:${projectId}:${panelId}` : null;

  useEffect(() => {
    if (!storageKey) {
      setPosition(null);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Position;
        if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
          setPosition(parsed);
          return;
        }
      }
    } catch {}
    setPosition(null);
  }, [storageKey]);

  const clampToViewport = (p: Position): Position => {
    const el = containerRef.current;
    if (!el) return p;
    const parent = el.offsetParent as HTMLElement | null;
    const pw = parent?.clientWidth ?? window.innerWidth;
    const ph = parent?.clientHeight ?? window.innerHeight;
    const rect = el.getBoundingClientRect();
    const maxLeft = Math.max(0, pw - rect.width);
    const maxTop = Math.max(0, ph - rect.height);
    return {
      left: Math.min(Math.max(0, p.left), maxLeft),
      top: Math.min(Math.max(0, p.top), maxTop),
    };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    const parent = el.offsetParent as HTMLElement | null;
    const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const rect = el.getBoundingClientRect();
    dragStateRef.current = {
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    justDraggedRef.current = false;
    e.preventDefault();

    const onMove = (ev: MouseEvent) => {
      const st = dragStateRef.current;
      if (!st) return;
      if (!st.moved) {
        const dx = ev.clientX - st.startX;
        const dy = ev.clientY - st.startY;
        if (dx * dx + dy * dy < 9) return; // umbral 3px
        st.moved = true;
        setDragging(true);
        const r = el.getBoundingClientRect();
        const pR = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect()
          ?? { left: 0, top: 0 };
        setPosition({
          left: r.left - pR.left,
          top: r.top - pR.top,
        });
      }
      const pRect = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect()
        ?? { left: 0, top: 0 };
      const next = clampToViewport({
        left: ev.clientX - st.offsetX - pRect.left,
        top: ev.clientY - st.offsetY - pRect.top,
      });
      setPosition(next);
    };
    const onUp = () => {
      const st = dragStateRef.current;
      const wasDrag = !!st?.moved;
      justDraggedRef.current = wasDrag;
      if (wasDrag) {
        setTimeout(() => { justDraggedRef.current = false; }, 50);
      }
      setDragging(false);
      dragStateRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (storageKey && wasDrag) {
        setPosition((p) => {
          if (p) {
            try { localStorage.setItem(storageKey, JSON.stringify(p)); } catch {}
          }
          return p;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [storageKey]);

  return { containerRef, handleMouseDown, position, dragging, justDraggedRef };
}
