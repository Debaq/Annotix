import { useEffect, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

interface Options {
  active: boolean;
  extensions: string[];
  onDrop: (paths: string[]) => void;
}

interface DropState {
  isDragging: boolean;
}

function getExt(p: string): string {
  return p.split('.').pop()?.toLowerCase() ?? '';
}

export function useTauriPathDrop({ active, extensions, onDrop }: Options): DropState {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!active) {
      setIsDragging(false);
      return;
    }

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    const accepts = (p: string) => extensions.includes(getExt(p));

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === 'enter') {
          if (payload.paths.some(accepts)) setIsDragging(true);
        } else if (payload.type === 'drop') {
          setIsDragging(false);
          const matched = payload.paths.filter(accepts);
          if (matched.length > 0) onDrop(matched);
        } else {
          setIsDragging(false);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
      setIsDragging(false);
    };
  }, [active, extensions.join('|'), onDrop]);

  return { isDragging };
}
