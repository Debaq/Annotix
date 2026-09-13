import { useEffect, useState } from 'react';
import { trainingService } from '../services/trainingService';
import type { FamilyInfo } from '../types';

/**
 * Fichas de decisión de las familias de modelos.
 *
 * El catálogo es una tabla estática compilada en el binario: no cambia durante la
 * sesión, así que se pide una sola vez y se guarda a nivel de módulo. Sin la caché
 * cada montaje del panel de entrenamiento repetiría el viaje al backend para
 * recibir siempre lo mismo.
 */
let cache: FamilyInfo[] | null = null;
let enVuelo: Promise<FamilyInfo[]> | null = null;

function cargar(): Promise<FamilyInfo[]> {
  if (cache) return Promise.resolve(cache);
  if (!enVuelo) {
    enVuelo = trainingService
      .getModelFamilies()
      .then((fichas) => {
        cache = fichas;
        return fichas;
      })
      .catch(() => {
        // Sin catálogo la UI muestra los modelos sin la ficha de decisión, que es
        // como se veía antes. No se cachea el fallo: el próximo montaje reintenta.
        enVuelo = null;
        return [];
      });
  }
  return enVuelo;
}

export function useModelFamilies(): { families: FamilyInfo[]; loading: boolean } {
  const [families, setFamilies] = useState<FamilyInfo[]>(cache ?? []);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let vivo = true;
    cargar().then((fichas) => {
      if (!vivo) return;
      setFamilies(fichas);
      setLoading(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  return { families, loading };
}

/** Ficha de un par (backend, familia), o `undefined` si el catálogo no llegó. */
export function findFamily(
  families: FamilyInfo[],
  backend: string,
  family: string,
): FamilyInfo | undefined {
  return families.find((f) => f.backend === backend && f.family === family);
}
