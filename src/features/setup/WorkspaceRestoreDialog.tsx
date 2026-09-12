import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export interface ScannedProject {
  path: string;
  dirName: string;
  id: string | null;
  name: string;
  projectType: string;
  imageCount: number;
  imageFiles: number;
  videoFiles: number;
  status: 'ok' | 'idMismatch' | 'recoverable' | 'corrupt' | 'orphan';
  depth: number;
  needsMove: boolean;
  alreadyOk: boolean;
}

export interface ScanReport {
  root: string;
  projects: ScannedProject[];
  okCount: number;
  repairableCount: number;
}

interface RestoreOutcome {
  path: string;
  name: string;
  id: string | null;
  result: 'restored' | 'skipped' | 'failed';
  actions: string[];
  message: string | null;
}

interface RestoreReport {
  restored: number;
  failed: number;
  outcomes: RestoreOutcome[];
}

interface Props {
  /** Carpeta de trabajo elegida. `null` cierra el diálogo. */
  path: string | null;
  onClose: () => void;
  /** Se llama tras restaurar, para refrescar el listado de proyectos. */
  onRestored?: (report: RestoreReport) => void;
}

const STATUS_ICON: Record<ScannedProject['status'], string> = {
  ok: 'fa-circle-check text-emerald-500',
  idMismatch: 'fa-wrench text-amber-500',
  recoverable: 'fa-rotate-left text-amber-500',
  corrupt: 'fa-triangle-exclamation text-red-500',
  orphan: 'fa-images text-blue-500',
};

/**
 * Escanea la carpeta de trabajo elegida y ofrece restaurar los proyectos que
 * encuentre. Se muestra solo si hay algo que restaurar.
 */
export function WorkspaceRestoreDialog({ path, onClose, onRestored }: Props) {
  const { t } = useTranslation();
  const [report, setReport] = useState<ScanReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [result, setResult] = useState<RestoreReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setReport(null);
      setResult(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setScanning(true);
    invoke<ScanReport>('scan_workspace', { path })
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        // Preseleccionar todo lo reparable; lo ya visible no necesita tocarse.
        setSelected(new Set(r.projects.filter((p) => !p.alreadyOk).map((p) => p.path)));
        if (r.repairableCount === 0) onClose();
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setScanning(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const toggle = (p: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const handleRestore = async () => {
    if (!path || selected.size === 0) return;
    setRestoring(true);
    setError(null);
    try {
      const res = await invoke<RestoreReport>('restore_workspace', {
        path,
        projects: Array.from(selected),
      });
      setResult(res);
      onRestored?.(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setRestoring(false);
    }
  };

  const open = !!path && (scanning || !!report || !!error);
  const repairable = report?.projects.filter((p) => !p.alreadyOk) ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <i className="fas fa-folder-tree mr-2 text-[var(--annotix-primary)]" />
            {t('setup.restore.title', 'Proyectos encontrados')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'setup.restore.description',
              'Esta carpeta ya contiene proyectos de Annotix. Selecciona los que quieras restaurar.',
            )}
          </DialogDescription>
        </DialogHeader>

        {scanning && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <i className="fas fa-spinner fa-spin mr-2" />
            {t('setup.restore.scanning', 'Escaneando carpeta…')}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {!scanning && report && !result && (
          <>
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {repairable.map((p) => (
                <label
                  key={p.path}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--annotix-border)] p-3 hover:bg-[var(--annotix-primary)]/5"
                >
                  <Checkbox
                    checked={selected.has(p.path)}
                    onCheckedChange={() => toggle(p.path)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <i className={`fas ${STATUS_ICON[p.status]}`} />
                      <span className="truncate">{p.name}</span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {p.path}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(`setup.restore.status.${p.status}`, p.status)}
                      {' · '}
                      {t('setup.restore.images', '{{count}} imágenes', {
                        count: Math.max(p.imageCount, p.imageFiles),
                      })}
                      {p.videoFiles > 0 &&
                        ` · ${t('setup.restore.videos', '{{count}} videos', { count: p.videoFiles })}`}
                      {p.needsMove && ` · ${t('setup.restore.willMove', 'se moverá a la raíz')}`}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {report.okCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('setup.restore.alreadyOk', '{{count}} proyectos ya están listos y no necesitan cambios.', {
                  count: report.okCount,
                })}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={restoring}>
                {t('setup.restore.skip', 'Omitir')}
              </Button>
              <Button onClick={handleRestore} disabled={restoring || selected.size === 0}>
                {restoring ? (
                  <i className="fas fa-spinner fa-spin mr-2" />
                ) : (
                  <i className="fas fa-rotate-left mr-2" />
                )}
                {t('setup.restore.restore', 'Restaurar seleccionados')}
              </Button>
            </DialogFooter>
          </>
        )}

        {result && (
          <>
            <div className="space-y-2">
              <p className="text-sm">
                <i className="fas fa-circle-check mr-2 text-emerald-500" />
                {t('setup.restore.done', '{{count}} proyectos restaurados', { count: result.restored })}
              </p>
              {result.failed > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                  {result.outcomes
                    .filter((o) => o.result === 'failed')
                    .map((o) => (
                      <p key={o.path} className="truncate">
                        <span className="font-medium">{o.name}</span>: {o.message}
                      </p>
                    ))}
                </div>
              )}
              {result.outcomes.some((o) => o.actions.includes('rebuilt')) && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'setup.restore.rebuiltNote',
                    'Algunos proyectos se reconstruyeron desde sus archivos: las imágenes vuelven, pero las anotaciones de esos proyectos no se pudieron recuperar.',
                  )}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={onClose}>{t('common.close', 'Cerrar')}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
