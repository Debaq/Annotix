import { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Image as KonvaImage } from 'react-konva';
import { useSamStore } from '../store/useSamStore';
import type { SamMask } from '@/lib/db';

interface Props {
  /** Tamaño original de la imagen (w,h) en píxeles. */
  imageWidth: number;
  imageHeight: number;
  /** Offset y escala del KonvaImage de la imagen base. */
  imageOffsetX: number;
  imageOffsetY: number;
  scale: number;
}

const ID_MAP_DIM = 256;

interface SamComposite {
  canvas: HTMLCanvasElement | null;
  /** ID por celda 256×256 sobre coords IMAGEN-original. 0 = vacío, idx = posición+1 en visibles. */
  idMap: Uint16Array;
  /** Lista de IDs visibles (alineada con idMap: idMap[k] = pos+1). */
  visibleIds: string[];
}

function hslColor(seed: number, alpha: number): [number, number, number, number] {
  const h = (seed * 137.508) % 360;
  // hsl → rgb (s=70%, l=55%)
  const s = 0.7;
  const l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r: number, g: number, b: number;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
    Math.round(alpha * 255),
  ];
}

/**
 * Pinta cada candidate en su propio canvas lowres, lo upscala al tamaño
 * de la imagen original y lo composita en `out`. Construye id_map.
 *
 * Topmost = score más alto encima → se pintan los de menor score primero.
 */
function compose(
  candidates: SamMask[],
  filters: { predIouMin: number; stabilityMin: number },
  activeMaskIdx: 0 | 1 | 2,
  hoverMaskId: string | null,
  imageWidth: number,
  imageHeight: number,
): SamComposite {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return { canvas: null, idMap: new Uint16Array(ID_MAP_DIM * ID_MAP_DIM), visibleIds: [] };
  }
  const visible = candidates
    .filter((m) => {
      const s = m.scores[activeMaskIdx];
      return s >= filters.predIouMin && s >= 0; // stabilityMin no llega per-mask aquí
    })
    .slice()
    .sort((a, b) => a.scores[activeMaskIdx] - b.scores[activeMaskIdx]);
  // stabilityMin se aplica server-side en AMG; el slider permite refilter visual
  // si el backend volviera a mandar. v1: usamos predIou como filtro principal.

  const out = document.createElement('canvas');
  out.width = imageWidth;
  out.height = imageHeight;
  const ctx = out.getContext('2d', { willReadFrequently: false });
  if (!ctx) return { canvas: null, idMap: new Uint16Array(ID_MAP_DIM * ID_MAP_DIM), visibleIds: [] };

  const idMap = new Uint16Array(ID_MAP_DIM * ID_MAP_DIM);
  const visibleIds: string[] = [];

  // Canvas intermedio reutilizable a tamaño lowres.
  const tmp = document.createElement('canvas');
  const tmpCtx = tmp.getContext('2d');
  if (!tmpCtx) return { canvas: out, idMap, visibleIds };

  visible.forEach((m, vIdx) => {
    const lr = m.masksLowres[activeMaskIdx];
    if (!lr) return;
    const [lw, lh] = m.lowresSize;
    if (lw <= 0 || lh <= 0) return;
    const lrBytes = lr instanceof Uint8Array ? lr : new Uint8Array(lr as any);
    if (lrBytes.length < lw * lh) return;

    const isHover = hoverMaskId === m.id;
    const [r, g, b, a] = hslColor(m.colorSeed >>> 0, isHover ? 0.7 : 0.45);

    tmp.width = lw;
    tmp.height = lh;
    const id = tmpCtx.createImageData(lw, lh);
    for (let i = 0; i < lw * lh; i++) {
      // Pixel binarizado: lr > 128 dentro de la máscara.
      if (lrBytes[i] > 128) {
        const o = i * 4;
        id.data[o] = r;
        id.data[o + 1] = g;
        id.data[o + 2] = b;
        id.data[o + 3] = a;
      }
    }
    tmpCtx.putImageData(id, 0, 0);

    // Upscale al tamaño original.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, lw, lh, 0, 0, imageWidth, imageHeight);

    if (isHover) {
      // borde simple.
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
      ctx.lineWidth = Math.max(1, Math.round(imageWidth / 400));
      ctx.strokeRect(m.bbox[0], m.bbox[1], m.bbox[2], m.bbox[3]);
    }

    visibleIds.push(m.id);
    const idx = vIdx + 1; // 0 reservado para vacío
    // Pintar en idMap: para cada celda 256×256, ver si la máscara ocupa.
    // Aproximación: mapeamos el bbox de la máscara a celdas y consultamos
    // muestreando el canvas lowres.
    const x0 = Math.max(0, Math.floor((m.bbox[0] / imageWidth) * ID_MAP_DIM));
    const y0 = Math.max(0, Math.floor((m.bbox[1] / imageHeight) * ID_MAP_DIM));
    const x1 = Math.min(
      ID_MAP_DIM - 1,
      Math.ceil(((m.bbox[0] + m.bbox[2]) / imageWidth) * ID_MAP_DIM),
    );
    const y1 = Math.min(
      ID_MAP_DIM - 1,
      Math.ceil(((m.bbox[1] + m.bbox[3]) / imageHeight) * ID_MAP_DIM),
    );
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        // Punto representativo en coords lowres.
        const px = Math.floor(((cx + 0.5) / ID_MAP_DIM) * lw);
        const py = Math.floor(((cy + 0.5) / ID_MAP_DIM) * lh);
        if (px < 0 || py < 0 || px >= lw || py >= lh) continue;
        if (lrBytes[py * lw + px] > 128) {
          // Topmost: el de score más alto se queda (se sobreescribe el anterior).
          idMap[cy * ID_MAP_DIM + cx] = idx;
        }
      }
    }
  });

  return { canvas: out, idMap, visibleIds };
}

export function SamOverlay({
  imageWidth,
  imageHeight,
  imageOffsetX,
  imageOffsetY,
  scale,
}: Props) {
  const samAssistActive = useSamStore((s) => s.samAssistActive);
  const candidates = useSamStore((s) => s.candidates);
  const activeMaskIdx = useSamStore((s) => s.activeMaskIdx);
  const filters = useSamStore((s) => s.filters);
  const hoverMaskId = useSamStore((s) => s.hoverMaskId);

  const compositeKey = useMemo(
    () =>
      `${candidates.length}|${activeMaskIdx}|${filters.predIouMin}|${filters.stabilityMin}|${hoverMaskId}|${imageWidth}x${imageHeight}`,
    [candidates, activeMaskIdx, filters.predIouMin, filters.stabilityMin, hoverMaskId, imageWidth, imageHeight],
  );

  const [composite, setComposite] = useState<SamComposite>({
    canvas: null,
    idMap: new Uint16Array(ID_MAP_DIM * ID_MAP_DIM),
    visibleIds: [],
  });

  // Exponer composite global para hit-test sin prop drilling.
  const compositeRef = useRef(composite);
  compositeRef.current = composite;
  useEffect(() => {
    (window as any).__samComposite = compositeRef.current;
  }, [composite]);

  useEffect(() => {
    if (!samAssistActive) return;
    const c = compose(
      candidates,
      filters,
      activeMaskIdx,
      hoverMaskId,
      imageWidth,
      imageHeight,
    );
    setComposite(c);
  }, [compositeKey, samAssistActive, candidates, activeMaskIdx, filters, hoverMaskId, imageWidth, imageHeight]);

  if (!samAssistActive || !composite.canvas) return null;

  return (
    <Layer listening={false}>
      <KonvaImage
        image={composite.canvas}
        x={imageOffsetX}
        y={imageOffsetY}
        width={imageWidth}
        height={imageHeight}
        scaleX={scale}
        scaleY={scale}
      />
    </Layer>
  );
}

/**
 * Hit-test sobre el id_map global. Recibe coords en píxeles de la
 * imagen original. Devuelve mask_id o null.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function samHitTest(
  imageX: number,
  imageY: number,
  imageWidth: number,
  imageHeight: number,
): string | null {
  const composite: SamComposite | undefined = (window as any).__samComposite;
  if (!composite || !composite.canvas) return null;
  if (imageX < 0 || imageY < 0 || imageX >= imageWidth || imageY >= imageHeight) return null;
  const cx = Math.min(ID_MAP_DIM - 1, Math.floor((imageX / imageWidth) * ID_MAP_DIM));
  const cy = Math.min(ID_MAP_DIM - 1, Math.floor((imageY / imageHeight) * ID_MAP_DIM));
  const idx = composite.idMap[cy * ID_MAP_DIM + cx];
  if (idx === 0) return null;
  return composite.visibleIds[idx - 1] ?? null;
}
