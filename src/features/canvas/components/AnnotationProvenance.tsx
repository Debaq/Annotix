import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Annotation } from '@/lib/db';

interface Props {
  annotation: Annotation;
  /** Nombre del modelo que la sugirió, si el proyecto todavía lo tiene. */
  modelName?: string;
}

/** Lo que el backend deduce cuando `origin` no está: ver `AnnotationEntry::origen`. */
function origen(a: Annotation): string {
  if (a.origin) return a.origin;
  if (a.source === 'ai') return 'model';
  return 'unknown';
}

function fecha(ms?: number): string | null {
  if (!ms) return null;
  return new Date(ms).toLocaleString();
}

/**
 * De dónde salió **esta** etiqueta.
 *
 * El resumen del corpus (Gestionar sujetos → Estado del corpus) responde por el
 * proyecto entero; delante de una caja concreta la pregunta es otra: ¿la trazó
 * alguien, o la propuso un modelo y alguien la dejó pasar? Sin esto el dato
 * estaba guardado y no había forma de mirarlo.
 */
export function AnnotationProvenance({ annotation, modelName }: Props) {
  const { t } = useTranslation();
  const o = origen(annotation);
  const creada = fecha(annotation.createdAt);
  const editada = fecha(annotation.updatedAt);
  const revisada = fecha(annotation.reviewedAt);

  const filas: [string, string][] = [
    [t('annotations.provenance.origin'), t(`annotations.provenance.origins.${o}`, { defaultValue: o })],
  ];
  if (o === 'model') {
    filas.push([
      t('annotations.provenance.model'),
      modelName ?? annotation.modelId ?? t('annotations.provenance.modelGone'),
    ]);
  }
  if (annotation.confidence != null) {
    filas.push([
      t('annotations.provenance.confidence'),
      `${Math.round(annotation.confidence * 100)} %`,
    ]);
  }
  if (annotation.review) {
    filas.push([
      t('annotations.provenance.review'),
      t(`annotations.provenance.reviews.${annotation.review}`, {
        defaultValue: annotation.review,
      }),
    ]);
  }
  if (annotation.createdBy) filas.push([t('annotations.provenance.author'), annotation.createdBy]);
  if (annotation.reviewedBy) filas.push([t('annotations.provenance.reviewedBy'), annotation.reviewedBy]);
  if (creada) filas.push([t('annotations.provenance.created'), creada]);
  if (editada) filas.push([t('annotations.provenance.updated'), editada]);
  if (revisada) filas.push([t('annotations.provenance.reviewed'), revisada]);

  return (
    // `modal={false}` por lo mismo que en los filtros de la barra: en modo modal
    // Radix apaga los eventos del resto de la página al abrir, y sobre la vista de
    // anotación eso descartaba el menú en el mismo clic que lo abría.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className="annotix-annotation-info-btn"
          onClick={(e) => e.stopPropagation()}
          title={t('annotations.provenance.title')}
        >
          <i className="fas fa-circle-info" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          {t('annotations.provenance.title')}
        </p>
        <div className="space-y-0.5">
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex items-baseline gap-2 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground">{etiqueta}</span>
              <span className="flex-1 break-all">{valor}</span>
            </div>
          ))}
        </div>
        {o === 'unknown' && (
          <p className="mt-1.5 text-[11px] text-amber-600">
            {t('annotations.provenance.unknownNote')}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
