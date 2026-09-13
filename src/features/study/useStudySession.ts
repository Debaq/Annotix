// Arranque de la sesión de estudio y detección de inactividad (3.6).
// Headless: no dibuja nada ni cambia el comportamiento de la app.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { studyLog } from './studyLog';
import { resetStudySession, setRouteStep } from './studySession';
import type { StudyStep } from './studySteps';

/** Umbral de inactividad de la sección 3.6. */
const IDLE_MS = 60_000;

/**
 * Paso que corresponde a cada ruta. Los pasos que no son una pantalla
 * (`configure_training`, `train`, `evaluate`, `export`, `review_assisted`,
 * `create_project`, `configure_classes`) los apila el componente que los
 * gobierna con `pushStep` / `popStep`.
 */
function stepForPath(path: string): StudyStep | null {
  if (/^\/projects\/[^/]+\/(images|videos|timeseries|audio|tts)\//.test(path)) return 'annotate';
  if (/^\/projects\/[^/]+\/tts$/.test(path)) return 'annotate';
  if (/^\/projects\/[^/]+$/.test(path)) return 'import_data';
  return null;
}

export function useStudySession(): void {
  const location = useLocation();

  // Reabrir la sesión si el modo estudio quedó activado.
  useEffect(() => {
    studyLog
      .resume()
      .then((s) => {
        if (s.active) resetStudySession();
      })
      .catch(() => {});
  }, []);

  // Paso activo según la ruta.
  useEffect(() => {
    setRouteStep(stepForPath(location.pathname));
  }, [location.pathname]);

  // Inactividad: ausencia de teclado, ratón y rueda. Sin señal visible.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let idleSince = 0;

    const wake = () => {
      if (idleSince > 0) {
        studyLog.emit('idle.end', { duration_ms: Math.round(performance.now() - idleSince) });
        idleSince = 0;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        idleSince = performance.now();
        studyLog.emit('idle.start', {});
      }, IDLE_MS);
    };

    const events: (keyof WindowEventMap)[] = [
      'keydown',
      'mousedown',
      'mousemove',
      'wheel',
      'touchstart',
    ];
    for (const e of events) window.addEventListener(e, wake, { passive: true });
    wake();

    return () => {
      for (const e of events) window.removeEventListener(e, wake);
      if (timer) clearTimeout(timer);
    };
  }, []);
}
