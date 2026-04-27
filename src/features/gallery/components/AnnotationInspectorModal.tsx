import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useUIStore } from '../../core/store/uiStore';
import { useCurrentProject } from '../../projects/hooks/useCurrentProject';
import { useImages } from '../hooks/useImages';
import { analyze, DEFAULT_OPTS, type AnalyzerOptions, type OverlapFinding } from '../utils/annotationStats';
import { cn } from '@/lib/utils';
import type { Project, AnnotixImage } from '@/lib/db';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectOverride?: Project | null;
  imagesOverride?: AnnotixImage[];
  // Si true, click en imagen no navega (evita cambiar contexto cuando se inspecciona proyecto no abierto)
  navigationDisabled?: boolean;
}

export function AnnotationInspectorModal({ open, onOpenChange, projectOverride, imagesOverride, navigationDisabled }: Props) {
  const { t } = useTranslation();
  const currentProject = useCurrentProject();
  const currentImages = useImages();
  const project = projectOverride !== undefined ? projectOverride : currentProject.project;
  const images = imagesOverride !== undefined ? imagesOverride : currentImages.images;
  const setCurrentImageId = useUIStore((s) => s.setCurrentImageId);
  const setCurrentProjectId = useUIStore((s) => s.setCurrentProjectId);

  const [opts, setOpts] = useState<AnalyzerOptions>(DEFAULT_OPTS);
  const [imageSearch, setImageSearch] = useState('');
  const [overlapKindFilter, setOverlapKindFilter] = useState<OverlapFinding['kind'] | 'all'>('all');

  const result = useMemo(() => analyze(images, opts), [images, opts]);

  const classMap = useMemo(() => {
    const m = new Map<number, { name: string; color: string }>();
    project?.classes.forEach((c) => m.set(c.id, { name: c.name, color: c.color }));
    return m;
  }, [project]);

  const goTo = (imageId: string) => {
    if (navigationDisabled) return;
    if (projectOverride && project?.id) setCurrentProjectId(project.id);
    setCurrentImageId(imageId);
    onOpenChange(false);
  };

  const filteredImages = useMemo(() => {
    const q = imageSearch.trim().toLowerCase();
    if (!q) return result.perImage;
    return result.perImage.filter((s) => s.name.toLowerCase().includes(q));
  }, [imageSearch, result.perImage]);

  const filteredOverlaps = useMemo(() => {
    if (overlapKindFilter === 'all') return result.overlaps;
    return result.overlaps.filter((o) => o.kind === overlapKindFilter);
  }, [overlapKindFilter, result.overlaps]);

  const classChart = useMemo(() => ({
    labels: result.byClass.map((c) => classMap.get(c.classId)?.name ?? `#${c.classId}`),
    datasets: [{
      label: t('inspector.annotations', 'Anotaciones'),
      data: result.byClass.map((c) => c.total),
      backgroundColor: result.byClass.map((c) => classMap.get(c.classId)?.color ?? '#888'),
    }],
  }), [result.byClass, classMap, t]);

  const histChart = useMemo(() => {
    const max = result.histogram.length;
    return {
      labels: result.histogram.map((_, i) => String(i)),
      datasets: [{
        label: t('inspector.imagesWithN', 'imágenes con N marcas'),
        data: result.histogram,
        backgroundColor: '#667eea',
      }],
      maxBucket: max,
    };
  }, [result.histogram, t]);

  const kindLabel = (k: OverlapFinding['kind']) => {
    if (k === 'duplicate') return t('inspector.duplicate', 'Duplicado');
    if (k === 'contained') return t('inspector.contained', 'Contenido');
    return t('inspector.sameClassOverlap', 'Mismo class solapado');
  };
  const kindColor = (k: OverlapFinding['kind']) => k === 'duplicate' ? '#ef4444' : k === 'contained' ? '#f59e0b' : '#3b82f6';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            <i className="fas fa-microscope mr-2"></i>
            {t('inspector.title', 'Inspector de anotaciones')}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="summary" className="flex-1 overflow-hidden flex flex-col">
          <TabsList>
            <TabsTrigger value="summary">{t('inspector.summary', 'Resumen')}</TabsTrigger>
            <TabsTrigger value="perImage">{t('inspector.perImage', 'Por imagen')}</TabsTrigger>
            <TabsTrigger value="problems">
              {t('inspector.problems', 'Problemas')}
              {(result.overlaps.length + result.outliers.length) > 0 && (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">
                  {result.overlaps.length + result.outliers.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* RESUMEN */}
          <TabsContent value="summary" className="flex-1 overflow-y-auto space-y-4 mt-2">
            <div className="grid grid-cols-4 gap-2">
              <StatCard label={t('inspector.totalImages', 'Imágenes')} value={result.totals.images} />
              <StatCard label={t('inspector.totalAnnotated', 'Anotadas')} value={`${result.totals.annotated} (${result.totals.images > 0 ? Math.round(100 * result.totals.annotated / result.totals.images) : 0}%)`} />
              <StatCard label={t('inspector.totalMarks', 'Marcas')} value={result.totals.annotations} />
              <StatCard label={t('inspector.avgPerImage', 'Promedio/imagen')} value={result.totals.avgPerImage.toFixed(2)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded p-3">
                <h4 className="text-sm font-semibold mb-2">{t('inspector.byClass', 'Marcas por clase')}</h4>
                <div style={{ height: 220 }}>
                  <Bar data={classChart} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                </div>
              </div>
              <div className="border rounded p-3">
                <h4 className="text-sm font-semibold mb-2">{t('inspector.histogram', 'Distribución (marcas/imagen)')}</h4>
                <div style={{ height: 220 }}>
                  <Bar data={histChart} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                </div>
              </div>
            </div>

            <div className="border rounded">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2">{t('inspector.class', 'Clase')}</th>
                    <th className="text-right p-2">{t('inspector.total', 'Total')}</th>
                    <th className="text-right p-2">{t('inspector.imagesPresent', 'Imágenes')}</th>
                    <th className="text-right p-2">{t('inspector.coverage', 'Cobertura')}</th>
                    <th className="text-right p-2">{t('inspector.avgArea', 'Área prom.')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.byClass.map((c) => {
                    const info = classMap.get(c.classId);
                    const cov = result.totals.images > 0 ? (c.imagesPresent / result.totals.images) * 100 : 0;
                    return (
                      <tr key={c.classId} className="border-t">
                        <td className="p-2 flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: info?.color ?? '#888' }} />
                          {info?.name ?? `#${c.classId}`}
                        </td>
                        <td className="text-right p-2 tabular-nums">{c.total}</td>
                        <td className="text-right p-2 tabular-nums">{c.imagesPresent} ({cov.toFixed(0)}%)</td>
                        <td className="text-right p-2 tabular-nums">{cov.toFixed(1)}%</td>
                        <td className="text-right p-2 tabular-nums">{Math.round(c.avgArea)} px²</td>
                      </tr>
                    );
                  })}
                  {result.byClass.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">{t('inspector.noData', 'Sin datos')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* POR IMAGEN */}
          <TabsContent value="perImage" className="flex-1 overflow-hidden flex flex-col mt-2">
            <input
              type="text"
              placeholder={t('inspector.searchImage', 'Buscar imagen...')}
              value={imageSearch}
              onChange={(e) => setImageSearch(e.target.value)}
              className="mb-2 w-full rounded border bg-background px-2 py-1 text-sm"
            />
            <div className="flex-1 overflow-y-auto border rounded">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">{t('inspector.image', 'Imagen')}</th>
                    <th className="text-right p-2">{t('inspector.marks', 'Marcas')}</th>
                    <th className="text-right p-2">{t('inspector.coverage', 'Cobertura')}</th>
                    <th className="text-left p-2">{t('inspector.classes', 'Clases')}</th>
                    <th className="text-left p-2">{t('inspector.types', 'Tipos')}</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredImages.map((s) => (
                    <tr key={s.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 truncate max-w-[180px]" title={s.name}>{s.name}</td>
                      <td className="text-right p-2 tabular-nums">{s.totalAnns}</td>
                      <td className="text-right p-2 tabular-nums">{s.coveragePct.toFixed(1)}%</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(s.byClass).map(([cid, n]) => {
                            const info = classMap.get(Number(cid));
                            return (
                              <span key={cid} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: info?.color ?? '#888' }} />
                                {info?.name ?? cid}: {n}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="p-2 text-[10px] text-muted-foreground">
                        {Object.entries(s.byType).map(([k, v]) => `${k}:${v}`).join(' ')}
                      </td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" onClick={() => goTo(s.id)} className="h-6 px-2 text-[10px]">
                          <i className="fas fa-arrow-right"></i>
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredImages.length === 0 && (
                    <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">{t('inspector.noData', 'Sin datos')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* PROBLEMAS */}
          <TabsContent value="problems" className="flex-1 overflow-hidden flex flex-col mt-2 space-y-2">
            <div className="grid grid-cols-5 gap-2 text-xs">
              <ThresholdInput label="IoU dup" value={opts.iouDup} onChange={(v) => setOpts({ ...opts, iouDup: v })} step={0.05} max={1} />
              <ThresholdInput label="Contención" value={opts.containmentMin} onChange={(v) => setOpts({ ...opts, containmentMin: v })} step={0.05} max={1} />
              <ThresholdInput label="IoU mismo class" value={opts.sameClassIou} onChange={(v) => setOpts({ ...opts, sameClassIou: v })} step={0.05} max={1} />
              <ThresholdInput label="Tiny área %" value={opts.tinyAreaPct * 100} onChange={(v) => setOpts({ ...opts, tinyAreaPct: v / 100 })} step={0.01} max={5} />
              <ThresholdInput label="Aspect max" value={opts.aspectRatioMax} onChange={(v) => setOpts({ ...opts, aspectRatioMax: v })} step={1} max={100} />
            </div>

            <div className="flex gap-1">
              {(['all', 'duplicate', 'contained', 'sameClassOverlap'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setOverlapKindFilter(k)}
                  className={cn('rounded border px-2 py-0.5 text-xs', overlapKindFilter === k ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}
                >
                  {k === 'all' ? t('common.all', 'Todos') : kindLabel(k)}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto border rounded">
              <h4 className="bg-muted/50 px-2 py-1 text-xs font-semibold sticky top-0">
                {t('inspector.overlaps', 'Solapamientos')} ({filteredOverlaps.length})
              </h4>
              <table className="w-full text-xs">
                <tbody>
                  {filteredOverlaps.slice(0, 200).map((f, i) => {
                    const ca = classMap.get(f.annA.classId);
                    const cb = classMap.get(f.annB.classId);
                    return (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="p-2">
                          <span className="rounded px-1.5 py-0.5 text-[10px] text-white" style={{ backgroundColor: kindColor(f.kind) }}>
                            {kindLabel(f.kind)}
                          </span>
                        </td>
                        <td className="p-2 truncate max-w-[200px]" title={f.imageName}>{f.imageName}</td>
                        <td className="p-2 text-[10px]">
                          <span className="inline-flex items-center gap-1">
                            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ca?.color }} />
                            {ca?.name ?? f.annA.classId}
                          </span>
                          {' ↔ '}
                          <span className="inline-flex items-center gap-1">
                            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cb?.color }} />
                            {cb?.name ?? f.annB.classId}
                          </span>
                        </td>
                        <td className="p-2 tabular-nums">IoU {f.iou.toFixed(3)}</td>
                        <td className="p-2 tabular-nums">cont {f.containment.toFixed(2)}</td>
                        <td className="p-2">
                          <Button size="sm" variant="ghost" onClick={() => goTo(f.imageId)} className="h-6 px-2 text-[10px]">
                            <i className="fas fa-arrow-right"></i>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredOverlaps.length === 0 && (
                    <tr><td className="p-4 text-center text-muted-foreground" colSpan={6}>{t('inspector.noOverlaps', 'Sin solapamientos')}</td></tr>
                  )}
                  {filteredOverlaps.length > 200 && (
                    <tr><td className="p-2 text-center text-muted-foreground text-[10px]" colSpan={6}>{t('inspector.truncated', 'Mostrando primeros 200')} ({filteredOverlaps.length})</td></tr>
                  )}
                </tbody>
              </table>

              <h4 className="bg-muted/50 px-2 py-1 text-xs font-semibold sticky top-0 mt-2">
                {t('inspector.outliers', 'Outliers')} ({result.outliers.length})
              </h4>
              <table className="w-full text-xs">
                <tbody>
                  {result.outliers.slice(0, 200).map((o, i) => {
                    const c = classMap.get(o.ann.classId);
                    return (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        <td className="p-2">
                          <span className="rounded px-1.5 py-0.5 text-[10px] text-white" style={{ backgroundColor: o.kind === 'tiny' ? '#f59e0b' : o.kind === 'aspect' ? '#8b5cf6' : '#ef4444' }}>
                            {o.kind}
                          </span>
                        </td>
                        <td className="p-2 truncate max-w-[200px]" title={o.imageName}>{o.imageName}</td>
                        <td className="p-2 text-[10px]">
                          <span className="inline-flex items-center gap-1">
                            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c?.color }} />
                            {c?.name ?? o.ann.classId}
                          </span>
                        </td>
                        <td className="p-2">{o.detail}</td>
                        <td className="p-2">
                          <Button size="sm" variant="ghost" onClick={() => goTo(o.imageId)} className="h-6 px-2 text-[10px]">
                            <i className="fas fa-arrow-right"></i>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {result.outliers.length === 0 && (
                    <tr><td className="p-4 text-center text-muted-foreground" colSpan={5}>{t('inspector.noOutliers', 'Sin outliers')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded p-2 text-center">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function ThresholdInput({ label, value, onChange, step, max }: { label: string; value: number; onChange: (v: number) => void; step: number; max: number }) {
  const [draft, setDraft] = useState(String(value));
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <input
        type="number"
        value={draft}
        min={0}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Math.max(0, Math.min(max, parseFloat(draft) || 0));
          setDraft(String(n));
          if (n !== value) onChange(n);
        }}
        className="rounded border bg-background px-1.5 py-1"
      />
    </label>
  );
}
