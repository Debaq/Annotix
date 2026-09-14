import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { MedicalImportReport } from '../types';

interface Props {
  report: MedicalImportReport | null;
  onClose: () => void;
}

/**
 * Qué se quitó al importar, y qué no se quitó.
 *
 * Este diálogo es obligatorio por diseño: aparece siempre tras importar y no se
 * puede saltar con un «no volver a mostrar». Una deidentificación que nadie mira
 * es una promesa sin comprobar, y la parte que más importa —lo que **no** cubre—
 * no se lee nunca si vive sólo en la documentación.
 */
export function DeidentReportDialog({ report, onClose }: Props) {
  const { t } = useTranslation();
  if (!report) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('medical.report.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">{t('medical.report.files')}</span>
            <span className="font-mono">{report.filesRead}</span>
            <span className="text-muted-foreground">{t('medical.report.images')}</span>
            <span className="font-mono">{report.imagesCreated}</span>
            {report.slicesSkipped > 0 && (
              <>
                <span className="text-muted-foreground">{t('medical.report.skipped')}</span>
                <span className="font-mono">{report.slicesSkipped}</span>
              </>
            )}
            <span className="text-muted-foreground">{t('medical.report.subjects')}</span>
            <span className="font-mono">{report.subjects.length}</span>
          </div>

          {/* Lo que se quitó */}
          <section className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('medical.report.removed', { count: report.removedTags.length })}
            </h4>
            <p className="text-xs font-mono break-words">
              {report.removedTags.join(' · ') || '—'}
            </p>
            {report.privateTagsRemoved > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {t('medical.report.privateRemoved', { count: report.privateTagsRemoved })}
              </p>
            )}
          </section>

          {/* Lo que se quedó: «qué se quitó» sólo es media respuesta */}
          <section className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('medical.report.kept')}
            </h4>
            <p className="text-xs font-mono break-words">
              {report.keptTags.join(' · ') || '—'}
            </p>
            {report.reducedTags.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {t('medical.report.reduced', { tags: report.reducedTags.join(', ') })}
              </p>
            )}
          </section>

          {/* Lo que NO cubre. Va destacado a propósito. */}
          <section className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600">
              {t('medical.report.notCovered')}
            </h4>
            <ul className="space-y-1">
              {report.warnings.map((w, i) => (
                <li key={i} className="text-[11px] text-amber-700 dark:text-amber-500">
                  · {w}
                </li>
              ))}
            </ul>
          </section>

          {report.failed.length > 0 && (
            <section className="space-y-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive">
                {t('medical.report.failed', { count: report.failed.length })}
              </h4>
              <ul className="space-y-0.5">
                {report.failed.map(([archivo, motivo]) => (
                  <li key={archivo} className="text-[11px]">
                    <span className="font-mono">{archivo}</span>
                    <span className="text-muted-foreground"> — {motivo}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex justify-end">
            <Button onClick={onClose}>{t('common.close', 'Cerrar')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
