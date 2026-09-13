import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface AnnotationPanelActionsProps {
  /** Qué hace el botón de volver. */
  onBack: () => void;
  /** Etiqueta del botón; por defecto, volver a la galería del proyecto. */
  backLabelKey?: string;
  /** Acciones propias de la vista, encima del botón de volver. */
  children?: ReactNode;
}

/**
 * Sección "Acciones" del panel derecho de las vistas de anotación.
 *
 * Existe para que el botón de volver esté en el mismo sitio en todas: en la vista de
 * video estaba al final del panel, después de la lista de tracks, así que su
 * posición dependía de cuántos tracks hubiera y no coincidía con la de imágenes.
 * Las acciones específicas de cada vista van encima, y el botón de volver siempre
 * cierra la sección.
 */
export function AnnotationPanelActions({
  onBack,
  backLabelKey = 'gallery.backToGallery',
  children,
}: AnnotationPanelActionsProps) {
  const { t } = useTranslation();

  return (
    <div className="annotix-panel-section">
      <h3 className="mb-3">{t('common.actions')}</h3>
      <div className="space-y-2">
        {children}
        <Button
          variant="outline"
          className="w-full annotix-btn annotix-btn-outline"
          onClick={onBack}
        >
          <i className="fas fa-arrow-left mr-2"></i>
          {t(backLabelKey)}
        </Button>
      </div>
    </div>
  );
}
