import { useEffect, useMemo, useState } from 'react';
import { trainingService } from '@/features/training/services/trainingService';
import type { BackendInfo, FamilyInfo } from '@/features/training/types';
import { BACKEND_PRESENTATION } from '../data/backendsData';

/** Un modelo del catálogo, con su backend resuelto para poder listarlo plano. */
export interface CatalogModel {
  id: string;
  name: string;
  backend: string;
  backendName: string;
  family: string;
  description: string;
  params: string | null;
  tasks: string[];
  sizes: string[] | null;
  recommended: boolean;
}

export interface CatalogBackend extends BackendInfo {
  icon: string;
  iconColor: string;
}

/**
 * Catálogo de entrenamiento para la pantalla de referencia de Configuración.
 *
 * Los datos salen de Rust, que es la única fuente: antes esta pantalla tenía su
 * propia lista escrita a mano y derivó hasta mostrar backends que ya no existen.
 *
 * El orden es **biomédico primero**: los backends con alguna familia recomendada
 * en biomedicina van arriba, y dentro de cada backend los modelos de esas
 * familias también. El resto sigue completo y accesible, sólo va después.
 */
export function useTrainingCatalog() {
  const [backends, setBackends] = useState<CatalogBackend[]>([]);
  const [families, setFamilies] = useState<FamilyInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    Promise.all([trainingService.getAllBackends(), trainingService.getModelFamilies()])
      .then(([bs, fs]) => {
        if (!vivo) return;
        setBackends(
          bs.map((b) => ({
            ...b,
            icon: BACKEND_PRESENTATION[b.id]?.icon ?? 'fas fa-cube',
            iconColor: BACKEND_PRESENTATION[b.id]?.color ?? 'text-muted-foreground',
          })),
        );
        setFamilies(fs);
        setLoading(false);
      })
      .catch(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  /** `true` si la familia de ese backend está recomendada en biomedicina. */
  const esBiomedica = useMemo(() => {
    const claves = new Set(
      families
        .filter((f) => f.domains.includes('biomedical'))
        .map((f) => `${f.backend}/${f.family}`),
    );
    return (backend: string, family: string) => claves.has(`${backend}/${family}`);
  }, [families]);

  const backendsOrdenados = useMemo(() => {
    const puntua = (b: CatalogBackend) =>
      b.models.some((m) => esBiomedica(b.id, m.family)) ? 0 : 1;
    return [...backends].sort((a, b) => puntua(a) - puntua(b));
  }, [backends, esBiomedica]);

  const models = useMemo<CatalogModel[]>(() => {
    const salida: CatalogModel[] = [];
    for (const b of backendsOrdenados) {
      const suyos: CatalogModel[] = b.models.map((m) => ({
        id: m.id,
        name: m.name,
        backend: b.id,
        backendName: b.name,
        family: m.family,
        description: m.description,
        params: m.paramsCount ?? null,
        tasks: m.tasks,
        sizes: m.sizes ?? null,
        recommended: m.recommended,
      }));
      suyos.sort((x, y) => {
        const bx = esBiomedica(b.id, x.family) ? 0 : 1;
        const by = esBiomedica(b.id, y.family) ? 0 : 1;
        if (bx !== by) return bx - by;
        return Number(y.recommended) - Number(x.recommended);
      });
      salida.push(...suyos);
    }
    return salida;
  }, [backendsOrdenados, esBiomedica]);

  return { backends: backendsOrdenados, families, models, loading, esBiomedica };
}
