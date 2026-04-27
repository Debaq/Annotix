import type { AnnotixImage, Annotation, BBoxData, OBBData, PolygonData } from '@/lib/db';

export interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function getBoundingBox(ann: Annotation): BoxRect | null {
  if (ann.type === 'bbox') {
    const d = ann.data as BBoxData;
    return { x: d.x, y: d.y, w: d.width, h: d.height };
  }
  if (ann.type === 'obb') {
    const d = ann.data as OBBData;
    const rad = (d.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const w = d.width * cos + d.height * sin;
    const h = d.width * sin + d.height * cos;
    return { x: d.x - w / 2, y: d.y - h / 2, w, h };
  }
  if (ann.type === 'polygon') {
    const d = ann.data as PolygonData;
    if (!d.points || d.points.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of d.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return null;
}

export function iou(a: BoxRect, b: BoxRect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const inter = interW * interH;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function containment(inner: BoxRect, outer: BoxRect): number {
  const x1 = Math.max(inner.x, outer.x);
  const y1 = Math.max(inner.y, outer.y);
  const x2 = Math.min(inner.x + inner.w, outer.x + outer.w);
  const y2 = Math.min(inner.y + inner.h, outer.y + outer.h);
  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const inter = interW * interH;
  const innerArea = inner.w * inner.h;
  return innerArea > 0 ? inter / innerArea : 0;
}

export interface ClassStat {
  classId: number;
  total: number;
  imagesPresent: number;
  avgArea: number;
}

export interface ImageStat {
  id: string;
  name: string;
  totalAnns: number;
  byClass: Record<number, number>;
  byType: Record<string, number>;
  coveragePct: number;
  status: string;
}

export interface OverlapFinding {
  imageId: string;
  imageName: string;
  annA: Annotation;
  annB: Annotation;
  iou: number;
  containment: number;
  kind: 'duplicate' | 'contained' | 'sameClassOverlap';
}

export interface OutlierFinding {
  imageId: string;
  imageName: string;
  ann: Annotation;
  kind: 'tiny' | 'aspect' | 'outOfBounds';
  detail: string;
}

export interface AnalyzerOptions {
  iouDup: number;
  containmentMin: number;
  sameClassIou: number;
  tinyAreaPct: number;
  aspectRatioMax: number;
}

export const DEFAULT_OPTS: AnalyzerOptions = {
  iouDup: 0.7,
  containmentMin: 0.9,
  sameClassIou: 0.3,
  tinyAreaPct: 0.001,
  aspectRatioMax: 20,
};

export interface AnalysisResult {
  totals: {
    images: number;
    annotated: number;
    annotations: number;
    avgPerImage: number;
  };
  byClass: ClassStat[];
  perImage: ImageStat[];
  histogram: number[];
  overlaps: OverlapFinding[];
  outliers: OutlierFinding[];
}

export function analyze(images: AnnotixImage[], opts: AnalyzerOptions): AnalysisResult {
  const byClassMap = new Map<number, { total: number; areaSum: number; imageSet: Set<string> }>();
  const perImage: ImageStat[] = [];
  const histogramBuckets: number[] = [];
  const overlaps: OverlapFinding[] = [];
  const outliers: OutlierFinding[] = [];
  let totalAnns = 0;
  let annotatedImages = 0;

  for (const img of images) {
    const id = img.id ?? '';
    const anns = img.annotations ?? [];
    const totalImgArea = (img.width || 1) * (img.height || 1);
    const byClass: Record<number, number> = {};
    const byType: Record<string, number> = {};
    let coveredArea = 0;
    const boxes: { ann: Annotation; box: BoxRect }[] = [];

    for (const ann of anns) {
      byClass[ann.classId] = (byClass[ann.classId] ?? 0) + 1;
      byType[ann.type] = (byType[ann.type] ?? 0) + 1;
      const box = getBoundingBox(ann);
      if (box) {
        const area = box.w * box.h;
        coveredArea += area;
        boxes.push({ ann, box });
        // outliers
        const areaPct = area / totalImgArea;
        if (areaPct < opts.tinyAreaPct) {
          outliers.push({ imageId: id, imageName: img.name, ann, kind: 'tiny', detail: `${(areaPct * 100).toFixed(3)}% área` });
        }
        if (box.w > 0 && box.h > 0) {
          const ratio = Math.max(box.w / box.h, box.h / box.w);
          if (ratio > opts.aspectRatioMax) {
            outliers.push({ imageId: id, imageName: img.name, ann, kind: 'aspect', detail: `ratio ${ratio.toFixed(1)}:1` });
          }
        }
        if (box.x < 0 || box.y < 0 || box.x + box.w > img.width + 1 || box.y + box.h > img.height + 1) {
          outliers.push({ imageId: id, imageName: img.name, ann, kind: 'outOfBounds', detail: 'fuera de imagen' });
        }
        let entry = byClassMap.get(ann.classId);
        if (!entry) {
          entry = { total: 0, areaSum: 0, imageSet: new Set() };
          byClassMap.set(ann.classId, entry);
        }
        entry.total += 1;
        entry.areaSum += area;
        entry.imageSet.add(id);
      }
    }

    // overlaps within image
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const A = boxes[i], B = boxes[j];
        const ov = iou(A.box, B.box);
        const cAB = containment(A.box, B.box);
        const cBA = containment(B.box, A.box);
        const maxC = Math.max(cAB, cBA);
        if (ov >= opts.iouDup) {
          overlaps.push({ imageId: id, imageName: img.name, annA: A.ann, annB: B.ann, iou: ov, containment: maxC, kind: 'duplicate' });
        } else if (maxC >= opts.containmentMin) {
          overlaps.push({ imageId: id, imageName: img.name, annA: A.ann, annB: B.ann, iou: ov, containment: maxC, kind: 'contained' });
        } else if (A.ann.classId === B.ann.classId && ov >= opts.sameClassIou) {
          overlaps.push({ imageId: id, imageName: img.name, annA: A.ann, annB: B.ann, iou: ov, containment: maxC, kind: 'sameClassOverlap' });
        }
      }
    }

    const stat: ImageStat = {
      id,
      name: img.name,
      totalAnns: anns.length,
      byClass,
      byType,
      coveragePct: Math.min(100, (coveredArea / totalImgArea) * 100),
      status: img.metadata?.status ?? 'pending',
    };
    perImage.push(stat);
    totalAnns += anns.length;
    if (anns.length > 0) annotatedImages += 1;
    histogramBuckets[anns.length] = (histogramBuckets[anns.length] ?? 0) + 1;
  }

  const byClass: ClassStat[] = [...byClassMap.entries()].map(([classId, v]) => ({
    classId,
    total: v.total,
    imagesPresent: v.imageSet.size,
    avgArea: v.total > 0 ? v.areaSum / v.total : 0,
  })).sort((a, b) => b.total - a.total);

  // Fill holes in histogram
  const histogram: number[] = [];
  for (let i = 0; i < histogramBuckets.length; i++) {
    histogram[i] = histogramBuckets[i] ?? 0;
  }

  // Sort findings most severe first
  overlaps.sort((a, b) => Math.max(b.iou, b.containment) - Math.max(a.iou, a.containment));

  return {
    totals: {
      images: images.length,
      annotated: annotatedImages,
      annotations: totalAnns,
      avgPerImage: images.length > 0 ? totalAnns / images.length : 0,
    },
    byClass,
    perImage,
    histogram,
    overlaps,
    outliers,
  };
}
