import { useTranslation } from 'react-i18next';
import type { FamilyInfo } from '../types';
import { VRAM_ORDEN, type CatalogFilters } from '../utils/catalogFilters';

interface ModelCatalogFiltersProps {
  /** Fichas de las familias presentes en el backend actual, para no ofrecer
   *  filtros que no descartan nada. */
  present: FamilyInfo[];
  value: CatalogFilters;
  onChange: (f: CatalogFilters) => void;
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-[11px] border transition-all ${
        activo
          ? 'border-blue-500 bg-blue-500/20 text-blue-600'
          : 'border-border text-muted-foreground hover:bg-accent'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Filtros del catálogo: dominio, techo de memoria y licencia.
 *
 * Cada grupo se oculta cuando no distingue nada — con un solo dominio presente, un
 * selector de dominio es ruido que además insinúa que hay algo más que elegir.
 */
export function ModelCatalogFilters({ present, value, onChange }: ModelCatalogFiltersProps) {
  const { t } = useTranslation();

  const dominios = [...new Set(present.flatMap((f) => f.domains))].sort();
  const vrams = VRAM_ORDEN.filter((v) => present.some((f) => f.vram === v));
  const hayNoAbiertos = present.some((f) => f.access !== 'open');

  const mostrarDominio = dominios.length > 1;
  const mostrarVram = vrams.length > 1;

  if (!mostrarDominio && !mostrarVram && !hayNoAbiertos) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {mostrarDominio && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('training.families.filters.domain')}
          </span>
          {dominios.map((d) => (
            <Chip
              key={d}
              activo={value.domain === d}
              onClick={() => onChange({ ...value, domain: value.domain === d ? null : d })}
            >
              {t(`training.families.axes.domain.${d}`, { defaultValue: d })}
            </Chip>
          ))}
        </div>
      )}

      {mostrarVram && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('training.families.filters.fitsIn')}
          </span>
          {vrams.map((v) => (
            <Chip
              key={v}
              activo={value.maxVram === v}
              onClick={() => onChange({ ...value, maxVram: value.maxVram === v ? null : v })}
            >
              {t(`training.families.axes.vram.${v}`, { defaultValue: v })}
            </Chip>
          ))}
        </div>
      )}

      {hayNoAbiertos && (
        <Chip activo={value.onlyOpen} onClick={() => onChange({ ...value, onlyOpen: !value.onlyOpen })}>
          {t('training.families.filters.onlyOpen')}
        </Chip>
      )}
    </div>
  );
}
