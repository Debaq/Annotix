import type { FamilyInfo } from '../types';

export interface CatalogFilters {
  /** `null` = sin filtrar por dominio. */
  domain: string | null;
  /** Cubeta máxima de VRAM aceptada, o `null`. */
  maxVram: string | null;
  /** Excluir familias con licencia no comercial o con términos que aceptar. */
  onlyOpen: boolean;
}

export const FILTROS_VACIOS: CatalogFilters = { domain: null, maxVram: null, onlyOpen: false };

/** Cubetas de VRAM en orden creciente: el filtro es "hasta X". */
export const VRAM_ORDEN = ['le4gb', '4to8gb', '8to16gb', 'gt16gb'];

/**
 * `true` si la familia pasa los filtros.
 *
 * Sin ficha no se filtra: no se puede afirmar que algo incumple un criterio que no
 * se conoce. Así, si el catálogo no llega, la lista se comporta como antes en vez
 * de quedarse vacía.
 */
export function pasaFiltros(info: FamilyInfo | undefined, f: CatalogFilters): boolean {
  if (!info) return true;
  if (f.domain && !info.domains.includes(f.domain)) return false;
  if (f.maxVram) {
    const tope = VRAM_ORDEN.indexOf(f.maxVram);
    const suyo = VRAM_ORDEN.indexOf(info.vram);
    if (tope >= 0 && suyo >= 0 && suyo > tope) return false;
  }
  if (f.onlyOpen && info.access !== 'open') return false;
  return true;
}
