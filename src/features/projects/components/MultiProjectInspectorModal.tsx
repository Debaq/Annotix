import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar } from 'react-chartjs-2';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useProjects } from '../hooks/useProjects';
import { imageService } from '../../gallery/services/imageService';
import { analyze, DEFAULT_OPTS } from '../../gallery/utils/annotationStats';
import { AnnotationInspectorModal } from '../../gallery/components/AnnotationInspectorModal';
import { useUIStore } from '../../core/store/uiStore';
import type { Project, AnnotixImage } from '@/lib/db';
import { cn } from '@/lib/utils';

interface ProjectAnalysis {
  project: Project;
  images: AnnotixImage[];
  totalImages: number;
  annotatedImages: number;
  totalAnns: number;
  avgPerImage: number;
  classes: number;
  problems: number;
  classCoveragePct: number;
  loading: boolean;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SortKey = 'name' | 'images' | 'annotated' | 'marks' | 'avg' | 'problems' | 'coverage';

export function MultiProjectInspectorModal({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { projects } = useProjects();
  const setCurrentProjectId = useUIStore((s) => s.setCurrentProjectId);

  const [analyses, setAnalyses] = useState<Map<string, ProjectAnalysis>>(new Map());
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sortKey, setSortKey] = useState<SortKey>('marks');
  const [sortDesc, setSortDesc] = useState(true);
  const [search, setSearch] = useState('');
  const [drillDown, setDrillDown] = useState<ProjectAnalysis | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      setAnalyses(new Map());
      setProgress({ done: 0, total: projects.length });
      for (const p of projects) {
        if (cancelled) return;
        if (!p.id) continue;
        try {
          const imgs = (await imageService.listByProject(p.id)).filter((i) => !i.videoId);
          const r = analyze(imgs, DEFAULT_OPTS);
          const annotatedClasses = r.byClass.length;
          const a: ProjectAnalysis = {
            project: p,
            images: imgs,
            totalImages: r.totals.images,
            annotatedImages: r.totals.annotated,
            totalAnns: r.totals.annotations,
            avgPerImage: r.totals.avgPerImage,
            classes: p.classes.length,
            problems: r.overlaps.length + r.outliers.length,
            classCoveragePct: p.classes.length > 0 ? (annotatedClasses / p.classes.length) * 100 : 0,
            loading: false,
          };
          if (cancelled) return;
          setAnalyses((prev) => {
            const n = new Map(prev);
            n.set(p.id!, a);
            return n;
          });
        } catch (err) {
          if (cancelled) return;
          setAnalyses((prev) => {
            const n = new Map(prev);
            n.set(p.id!, {
              project: p, images: [], totalImages: 0, annotatedImages: 0, totalAnns: 0,
              avgPerImage: 0, classes: p.classes.length, problems: 0, classCoveragePct: 0,
              loading: false, error: (err as Error).message,
            });
            return n;
          });
        } finally {
          if (!cancelled) setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }
    };
    run();
    return () => { cancelled = true; };
  }, [open, projects]);

  const rows = useMemo(() => {
    const arr = [...analyses.values()];
    const q = search.trim().toLowerCase();
    const filtered = q ? arr.filter((a) => a.project.name.toLowerCase().includes(q)) : arr;
    const sorted = [...filtered].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case 'name': av = a.project.name; bv = b.project.name; break;
        case 'images': av = a.totalImages; bv = b.totalImages; break;
        case 'annotated': av = a.annotatedImages; bv = b.annotatedImages; break;
        case 'marks': av = a.totalAnns; bv = b.totalAnns; break;
        case 'avg': av = a.avgPerImage; bv = b.avgPerImage; break;
        case 'problems': av = a.problems; bv = b.problems; break;
        case 'coverage': av = a.classCoveragePct; bv = b.classCoveragePct; break;
      }
      let cmp = 0;
      if (typeof av === 'string') cmp = av.localeCompare(bv as string);
      else cmp = (av as number) - (bv as number);
      return sortDesc ? -cmp : cmp;
    });
    return sorted;
  }, [analyses, search, sortKey, sortDesc]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc((v) => !v);
    else { setSortKey(k); setSortDesc(true); }
  };

  const totals = useMemo(() => {
    let images = 0, annotated = 0, anns = 0, problems = 0;
    for (const a of analyses.values()) {
      images += a.totalImages;
      annotated += a.annotatedImages;
      anns += a.totalAnns;
      problems += a.problems;
    }
    return { images, annotated, anns, problems };
  }, [analyses]);

  const chartData = useMemo(() => ({
    labels: rows.map((r) => r.project.name),
    datasets: [{
      label: t('inspector.marks', 'Marcas'),
      data: rows.map((r) => r.totalAnns),
      backgroundColor: '#667eea',
    }],
  }), [rows, t]);

  const goToProject = (a: ProjectAnalysis) => {
    if (!a.project.id) return;
    setCurrentProjectId(a.project.id);
    onOpenChange(false);
  };

  const SortHeader = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <th
      onClick={() => toggleSort(k)}
      className={cn('p-2 cursor-pointer select-none hover:bg-muted', align === 'right' && 'text-right')}
    >
      {label} {sortKey === k && <i className={`fas fa-chevron-${sortDesc ? 'down' : 'up'} text-[8px] ml-1`}></i>}
    </th>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              <i className="fas fa-chart-bar mr-2"></i>
              {t('inspector.multiTitle', 'Comparar proyectos')}
            </DialogTitle>
          </DialogHeader>

          {progress.done < progress.total && (
            <div className="text-xs text-muted-foreground">
              <i className="fas fa-spinner fa-spin mr-2"></i>
              {t('inspector.loading', 'Analizando')} {progress.done}/{progress.total}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            <StatCard label={t('inspector.totalImages', 'Imágenes')} value={totals.images} />
            <StatCard label={t('inspector.totalAnnotated', 'Anotadas')} value={totals.annotated} />
            <StatCard label={t('inspector.totalMarks', 'Marcas')} value={totals.anns} />
            <StatCard label={t('inspector.problems', 'Problemas')} value={totals.problems} />
          </div>

          <div className="border rounded p-3">
            <h4 className="text-sm font-semibold mb-2">{t('inspector.marksByProject', 'Marcas por proyecto')}</h4>
            <div style={{ height: 180 }}>
              <Bar data={chartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
            </div>
          </div>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('inspector.searchProject', 'Buscar proyecto...')}
            className="w-full rounded border bg-background px-2 py-1 text-sm"
          />

          <div className="flex-1 overflow-y-auto border rounded">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <SortHeader k="name" label={t('inspector.project', 'Proyecto')} />
                  <SortHeader k="images" label={t('inspector.images', 'Imgs')} align="right" />
                  <SortHeader k="annotated" label={t('inspector.annotated', 'Anot.')} align="right" />
                  <SortHeader k="marks" label={t('inspector.marks', 'Marcas')} align="right" />
                  <SortHeader k="avg" label={t('inspector.avg', 'Prom.')} align="right" />
                  <SortHeader k="coverage" label={t('inspector.classCoverage', 'Cob.clases')} align="right" />
                  <SortHeader k="problems" label={t('inspector.problems', 'Problemas')} align="right" />
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const annPct = a.totalImages > 0 ? Math.round((a.annotatedImages / a.totalImages) * 100) : 0;
                  return (
                    <tr key={a.project.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 truncate max-w-[220px]" title={a.project.name}>
                        {a.error ? <i className="fas fa-exclamation-triangle text-red-500 mr-1" title={a.error}></i> : null}
                        {a.project.name}
                        <span className="ml-2 text-[10px] text-muted-foreground">{a.classes} clases</span>
                      </td>
                      <td className="text-right p-2 tabular-nums">{a.totalImages}</td>
                      <td className="text-right p-2 tabular-nums">{a.annotatedImages} <span className="text-muted-foreground">({annPct}%)</span></td>
                      <td className="text-right p-2 tabular-nums font-semibold">{a.totalAnns}</td>
                      <td className="text-right p-2 tabular-nums">{a.avgPerImage.toFixed(2)}</td>
                      <td className="text-right p-2 tabular-nums">{a.classCoveragePct.toFixed(0)}%</td>
                      <td className="text-right p-2 tabular-nums">
                        {a.problems > 0 && <span className="rounded bg-red-100 text-red-700 px-1.5 py-0.5">{a.problems}</span>}
                        {a.problems === 0 && <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setDrillDown(a)} className="h-6 px-2 text-[10px]" title={t('inspector.drillDown', 'Inspeccionar')}>
                            <i className="fas fa-microscope"></i>
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => goToProject(a)} className="h-6 px-2 text-[10px]" title={t('projects.open', 'Abrir')}>
                            <i className="fas fa-arrow-right"></i>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && progress.done === progress.total && (
                  <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">{t('inspector.noData', 'Sin datos')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {drillDown && (
        <AnnotationInspectorModal
          open={!!drillDown}
          onOpenChange={(o) => { if (!o) setDrillDown(null); }}
          projectOverride={drillDown.project}
          imagesOverride={drillDown.images}
          navigationDisabled
        />
      )}
    </>
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
