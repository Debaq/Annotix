import type { Annotation, BBoxData, ClassificationData, KeypointsData, LandmarksData, MaskData, OBBData, PolygonData } from '@/lib/db';

type AnyObject = Record<string, any>;

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeType(type: unknown): Annotation['type'] | null {
  const value = String(type || '').toLowerCase();
  const map: Record<string, Annotation['type']> = {
    bbox: 'bbox',
    box: 'bbox',
    rect: 'bbox',
    rectangle: 'bbox',
    mask: 'mask',
    segmentation: 'mask',
    polygon: 'polygon',
    keypoint: 'keypoints',
    keypoints: 'keypoints',
    landmark: 'landmarks',
    landmarks: 'landmarks',
    obb: 'obb',
    orientedbbox: 'obb',
    'oriented-bbox': 'obb',
    rotatedbbox: 'obb',
    'rotated-bbox': 'obb',
    classification: 'classification',
    'multi-label-classification': 'classification',
    multilabel: 'classification',
  };

  return map[value] || null;
}

function normalizeBBoxData(data: AnyObject): BBoxData | null {
  if (data?.x === undefined || data?.y === undefined || data?.width === undefined || data?.height === undefined) {
    return null;
  }

  const normalized = {
    x: toNumber(data.x),
    y: toNumber(data.y),
    width: Math.max(0, toNumber(data.width)),
    height: Math.max(0, toNumber(data.height)),
  };

  if (normalized.width <= 0 || normalized.height <= 0) return null;
  return normalized;
}

function normalizeMaskData(data: AnyObject): MaskData | null {
  const base64png = data?.base64png || data?.imageData;
  if (typeof base64png !== 'string' || base64png.length === 0) return null;

  const withPrefix = base64png.startsWith('data:image')
    ? base64png
    : `data:image/png;base64,${base64png}`;

  return {
    base64png: withPrefix,
    instanceId: data?.instanceId,
  };
}

function normalizePolygonData(data: AnyObject): PolygonData | null {
  const source = Array.isArray(data?.points)
    ? data.points
    : Array.isArray(data)
      ? data
      : [];

  const points = source
    .map((point: any) => {
      if (Array.isArray(point) && point.length >= 2) {
        return { x: toNumber(point[0]), y: toNumber(point[1]) };
      }
      if (point?.x !== undefined && point?.y !== undefined) {
        return { x: toNumber(point.x), y: toNumber(point.y) };
      }
      return null;
    })
    .filter((point: { x: number; y: number } | null): point is { x: number; y: number } => point !== null);

  if (points.length < 3) return null;
  return { points, closed: data?.closed ?? true };
}

function normalizeKeypointsData(data: AnyObject): KeypointsData | null {
  const sourcePoints = Array.isArray(data?.points)
    ? data.points
    : Array.isArray(data?.keypoints)
      ? data.keypoints
      : [];

  if (sourcePoints.length === 0) return null;

  const points = sourcePoints.map((point: any, idx: number) => {
    const visibleValue = point?.visible ?? point?.visibility ?? 0;
    const visible = typeof visibleValue === 'boolean' ? visibleValue : Number(visibleValue) > 0;

    return {
      x: toNumber(point?.x),
      y: toNumber(point?.y),
      visible,
      name: point?.name ?? `point_${idx}`,
    };
  });

  return {
    points,
    skeletonType: data?.skeletonType || data?.skeleton || 'coco-17',
    instanceId: data?.instanceId,
  };
}

function normalizeLandmarksData(data: AnyObject): LandmarksData | null {
  const sourcePoints = Array.isArray(data?.points)
    ? data.points
    : (data?.x !== undefined && data?.y !== undefined)
      ? [data]
      : [];

  if (sourcePoints.length === 0) return null;

  return {
    points: sourcePoints.map((point: any, idx: number) => ({
      x: toNumber(point?.x),
      y: toNumber(point?.y),
      name: point?.name || `Point ${idx + 1}`,
    })),
  };
}

function normalizeOBBData(data: AnyObject): OBBData | null {
  const x = data?.x ?? data?.cx;
  const y = data?.y ?? data?.cy;
  const width = data?.width;
  const height = data?.height;
  const rotation = data?.rotation ?? data?.angle ?? 0;

  if (x === undefined || y === undefined || width === undefined || height === undefined) return null;

  const normalized = {
    x: toNumber(x),
    y: toNumber(y),
    width: Math.max(0, toNumber(width)),
    height: Math.max(0, toNumber(height)),
    rotation: toNumber(rotation),
  };

  if (normalized.width <= 0 || normalized.height <= 0) return null;
  return normalized;
}

function normalizeClassificationData(data: AnyObject, classId: number): ClassificationData {
  if (Array.isArray(data?.labels)) {
    const labels = data.labels.map((label: unknown) => toNumber(label, NaN)).filter((label: number) => Number.isFinite(label));
    return { labels: labels.length > 0 ? labels : [classId] };
  }

  const inlineClassId = toNumber(data?.classId, NaN);
  if (Number.isFinite(inlineClassId)) {
    return { labels: [inlineClassId] };
  }

  return { labels: [classId] };
}

export function normalizeAnnotationShape(annotation: Annotation): Annotation | null {
  if (!annotation) return null;

  const type = normalizeType(annotation.type);
  if (!type) return null;

  const rawAnnotation = annotation as unknown as AnyObject;
  const classId = toNumber(
    annotation.classId ?? rawAnnotation.class ?? rawAnnotation.classId ?? rawAnnotation.category_id,
    NaN
  );
  if (!Number.isFinite(classId)) return null;

  const raw = (annotation.data ?? {}) as AnyObject;

  // Legacy safety: some OBB annotations are tagged as bbox but store center+angle
  const inferredType: Annotation['type'] =
    type === 'bbox' && raw?.cx !== undefined && raw?.cy !== undefined && (raw?.angle !== undefined || raw?.rotation !== undefined)
      ? 'obb'
      : type;

  if (inferredType === 'bbox') {
    const data = normalizeBBoxData(raw);
    if (!data) return null;
    return { ...annotation, type: inferredType, classId, data };
  }

  if (inferredType === 'mask') {
    const data = normalizeMaskData(raw);
    if (!data) return null;
    return { ...annotation, type: inferredType, classId, data };
  }

  if (inferredType === 'polygon') {
    const data = normalizePolygonData(raw);
    if (!data) return null;
    return { ...annotation, type: inferredType, classId, data };
  }

  if (inferredType === 'keypoints') {
    const data = normalizeKeypointsData(raw);
    if (!data) return null;
    return { ...annotation, type: inferredType, classId, data };
  }

  if (inferredType === 'landmarks') {
    const data = normalizeLandmarksData(raw);
    if (!data) return null;
    return { ...annotation, type: inferredType, classId, data };
  }

  if (inferredType === 'obb') {
    const data = normalizeOBBData(raw);
    if (!data) return null;
    return { ...annotation, type: inferredType, classId, data };
  }

  if (inferredType === 'classification') {
    const data = normalizeClassificationData(raw, classId);
    return { ...annotation, type: inferredType, classId, data };
  }

  return null;
}
