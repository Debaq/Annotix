import { ReactNode, Suspense, lazy, useEffect, useState } from 'react';
import { useTrainingModalStore } from '../store/trainingModalStore';
import { useGlobalTrainingStatus } from '../hooks/useGlobalTrainingStatus';

const TrainingPanel = lazy(() =>
  import('./TrainingPanel').then((m) => ({ default: m.TrainingPanel })),
);

interface Props {
  trigger?: ReactNode;
}

/**
 * Wrapper ligero. Solo carga el bundle pesado de TrainingPanel cuando:
 *  - El usuario interactúa con el trigger (hover/focus/click), o
 *  - Llega una señal global para abrir el panel (job activo en otro proyecto).
 *
 * Mientras tanto el botón se renderiza al instante sin imports de
 * TrainingMonitor/BackendConfigPanel/etc.
 */
export function TrainingPanelLazy({ trigger }: Props) {
  const [load, setLoad] = useState(false);
  // Si el usuario hizo click directo, abrir el Dialog automáticamente al montar
  // el panel real (sin requerir un segundo click).
  const [autoOpen, setAutoOpen] = useState(false);
  const openSignal = useTrainingModalStore((s) => s.openActiveSignal);
  const status = useGlobalTrainingStatus();

  useEffect(() => {
    if (openSignal > 0) setLoad(true);
  }, [openSignal]);

  useEffect(() => {
    if (status.active && status.jobId) setLoad(true);
  }, [status.active, status.jobId]);

  if (load) {
    return (
      <Suspense fallback={<>{trigger}</>}>
        <TrainingPanel trigger={trigger} defaultOpen={autoOpen} />
      </Suspense>
    );
  }

  const handleActivate = () => {
    setAutoOpen(true);
    setLoad(true);
  };

  return (
    <span
      onMouseEnter={() => setLoad(true)}
      onFocus={() => setLoad(true)}
      onClick={handleActivate}
    >
      {trigger}
    </span>
  );
}
