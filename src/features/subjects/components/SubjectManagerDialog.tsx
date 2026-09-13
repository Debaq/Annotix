import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/hooks/use-toast';
import { subjectService } from '../services/subjectService';
import type { PatternPreview, SubjectSummary } from '../types';

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
  /** Se llama tras cambiar algo, para que la galería recargue. */
  onChanged?: () => void;
}

/**
 * Carga del identificador de sujeto sobre todo el corpus.
 *
 * Escribirlo a mano en miles de imágenes no es viable, así que aquí están las dos
 * vías masivas: extraerlo del nombre de archivo y cargar un mapeo externo. La
 * asignación de una imagen suelta vive en su panel de información.
 *
 * La extracción por patrón **siempre pasa por una vista previa**. Un patrón que
 * acierta en la mayoría y falla en silencio en el resto deja un corpus con
 * sujetos inventados, y eso no se detecta después: se detecta ahora, contando.
 */
export function SubjectManagerDialog({ projectId, open, onClose, onChanged }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [summary, setSummary] = useState<SubjectSummary | null>(null);
  const [pattern, setPattern] = useState('{subject}_*');
  const [preview, setPreview] = useState<PatternPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const recargar = useCallback(() => {
    if (!projectId) return;
    subjectService
      .getSummary(projectId)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [projectId]);

  useEffect(() => {
    if (open) {
      recargar();
      setPreview(null);
    }
  }, [open, recargar]);

  const probar = useCallback(async () => {
    if (!pattern.trim()) return;
    setBusy(true);
    try {
      setPreview(await subjectService.previewPattern(projectId, pattern));
    } catch (e) {
      toast({ title: String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [projectId, pattern, toast]);

  const aplicar = useCallback(async () => {
    setBusy(true);
    try {
      const n = await subjectService.applyPattern(projectId, pattern);
      toast({ title: t('subjects.applied', { count: n }) });
      setPreview(null);
      recargar();
      onChanged?.();
    } catch (e) {
      toast({ title: String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [projectId, pattern, toast, t, recargar, onChanged]);

  /** CSV de dos columnas: nombre de archivo, sujeto. */
  const importarCsv = useCallback(
    async (file: File) => {
      setBusy(true);
      try {
        const texto = await file.text();
        const mapping: Record<string, string> = {};
        for (const linea of texto.split(/\r?\n/)) {
          if (!linea.trim()) continue;
          const [nombre, sujeto] = linea.split(/[,;\t]/).map((c) => c.trim());
          // Se salta la cabecera si la hay, y cualquier fila incompleta.
          if (!nombre || !sujeto || nombre.toLowerCase() === 'filename') continue;
          mapping[nombre] = sujeto;
        }
        const [cambiadas, sinUso] = await subjectService.applyMap(projectId, mapping);
        toast({
          title: t('subjects.applied', { count: cambiadas }),
          description:
            sinUso.length > 0 ? t('subjects.mapUnused', { count: sinUso.length }) : undefined,
        });
        recargar();
        onChanged?.();
      } catch (e) {
        toast({ title: String(e), variant: 'destructive' });
      } finally {
        setBusy(false);
      }
    },
    [projectId, toast, t, recargar, onChanged],
  );

  const sujetos = summary ? Object.entries(summary.counts) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{t('subjects.title')}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">{t('subjects.why')}</p>

        {/* Estado actual */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('subjects.current')}
          </h4>
          {summary && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                {t('subjects.countSubjects', { count: sujetos.length })}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full ${
                  summary.unassigned > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {t('subjects.countUnassigned', { count: summary.unassigned })}
              </span>
              <span className="text-muted-foreground">
                {t('subjects.countTotal', { count: summary.total })}
              </span>
            </div>
          )}
          {sujetos.length > 0 && (
            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
              {sujetos.map(([nombre, n]) => (
                <span
                  key={nombre}
                  className="text-[11px] px-1.5 py-0.5 rounded border border-border font-mono"
                >
                  {nombre}
                  <span className="text-muted-foreground ml-1">{n}</span>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Extracción por patrón */}
        <section className="space-y-2 border-t border-border pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('subjects.fromFilename')}
          </h4>
          {/* La marca va como variable y no dentro del texto traducido: las llaves
              son la sintaxis de interpolación de i18next y escritas a mano salen
              en crudo en pantalla. */}
          <p className="text-[11px] text-muted-foreground">
            {t('subjects.patternHelp', { marca: '{subject}', ejemplo: '{subject}_ax_*.jpg' })}
          </p>
          <div className="flex gap-2">
            <input
              value={pattern}
              onChange={(e) => { setPattern(e.target.value); setPreview(null); }}
              placeholder="{subject}_ax_*.jpg"
              className="flex-1 px-2 py-1.5 text-sm font-mono rounded-md border border-border bg-background outline-none focus:border-blue-500"
            />
            <Button size="sm" variant="outline" onClick={probar} disabled={busy}>
              {t('subjects.test')}
            </Button>
          </div>

          {preview && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  {t('subjects.matched', { count: preview.matched.length })}
                </span>
                {preview.unmatched.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    {t('subjects.unmatched', { count: preview.unmatched.length })}
                  </span>
                )}
              </div>

              {preview.matched.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded border border-border divide-y divide-border/60">
                  {preview.matched.slice(0, 30).map(([archivo, sujeto]) => (
                    <div key={archivo} className="flex justify-between gap-2 px-2 py-1 text-[11px]">
                      <span className="truncate text-muted-foreground">{archivo}</span>
                      <span className="font-mono shrink-0">{sujeto}</span>
                    </div>
                  ))}
                </div>
              )}

              {preview.unmatched.length > 0 && (
                <p className="text-[11px] text-amber-600">
                  {t('subjects.unmatchedStay')}
                </p>
              )}

              <Button
                size="sm"
                onClick={aplicar}
                disabled={busy || preview.matched.length === 0}
              >
                {t('subjects.apply', { count: preview.matched.length })}
              </Button>
            </div>
          )}
        </section>

        {/* Mapeo externo */}
        <section className="space-y-2 border-t border-border pt-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('subjects.fromCsv')}
          </h4>
          <p className="text-[11px] text-muted-foreground">{t('subjects.csvHelp')}</p>
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importarCsv(f);
              e.target.value = '';
            }}
            className="text-xs"
          />
        </section>

        <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
          {t('subjects.privacy')}
        </p>
      </DialogContent>
    </Dialog>
  );
}
