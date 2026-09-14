import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { p2pService } from '../services/p2pService';
import type { ReadingsSummary } from '../types';

interface Props {
  projectId: string;
  imageId: string;
}

/**
 * Estado de las lecturas de la imagen abierta, en sesiones de lectura múltiple.
 *
 * No aparece en una sesión normal ni fuera de una sesión: con una sola lectura no
 * hay nada que contar, y enseñar un contador «1 de 1» sería ruido.
 *
 * El botón de entregar existe porque entregar es un acto del evaluador: hasta que
 * no lo hace, su capa es un borrador y no entra en el cálculo de acuerdo —comparar
 * contra un trabajo a medias mide prisa, no desacuerdo—.
 */
export function ReadingStatus({ projectId, imageId }: Props) {
  const { t } = useTranslation();
  const [resumen, setResumen] = useState<ReadingsSummary | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    if (!projectId || !imageId) return;
    p2pService
      .getReadingsSummary(projectId, imageId)
      .then(setResumen)
      .catch(() => setResumen(null));
  }, [projectId, imageId]);

  useEffect(cargar, [cargar]);

  if (!resumen || resumen.replication <= 1) return null;

  const entregar = async () => {
    setEnviando(true);
    try {
      await p2pService.submitReading(projectId, imageId);
      cargar();
    } catch {
      // Sin capa propia todavía: no hay nada que entregar y el backend lo dice.
      cargar();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex items-center gap-2 shrink-0" style={{ fontSize: '0.7rem' }}>
      <span
        className="rounded px-1.5 py-0.5"
        style={{ background: 'var(--annotix-gray-light)' }}
        title={resumen.blind ? t('p2p.readings.blindOn') : resumen.authors.join(', ')}
      >
        <i className={`fas ${resumen.blind ? 'fa-eye-slash' : 'fa-users'} mr-1`} />
        {t('p2p.readings.status', {
          submitted: resumen.submitted,
          replication: resumen.replication,
        })}
      </span>

      {resumen.mineSubmitted ? (
        <span className="text-emerald-600">
          <i className="fas fa-check mr-1" />
          {t('p2p.readings.submitted')}
        </span>
      ) : (
        <button
          className="annotix-btn annotix-btn-outline"
          style={{ fontSize: '0.7rem', padding: '4px 8px' }}
          onClick={entregar}
          disabled={enviando}
          title={t('p2p.readings.submitDesc')}
        >
          {enviando ? <i className="fas fa-spinner fa-spin" /> : t('p2p.readings.submit')}
        </button>
      )}
    </div>
  );
}
