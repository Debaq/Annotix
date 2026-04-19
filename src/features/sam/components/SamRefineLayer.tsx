import { useEffect, useRef, useState } from 'react';
import { Layer, Rect, Circle, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import { samPredict } from '@/lib/tauriDb';
import type { SamPoint, SamPrediction } from '@/lib/db';
import { useSamStore } from '../store/useSamStore';

interface Props {
  imageWidth: number;
  imageHeight: number;
  imageOffsetX: number;
  imageOffsetY: number;
  scale: number;
}

const PREVIEW_RGB: [number, number, number] = [124, 58, 237]; // violeta SAM

/**
 * Pinta la máscara seleccionada de la prediction sobre un canvas al tamaño
 * original de la imagen. Reusa logits uint8 lowres + threshold 128.
 */
function paintPredictionPreview(
  pred: SamPrediction,
  activeIdx: 0 | 1 | 2,
  imageWidth: number,
  imageHeight: number,
): HTMLCanvasElement | null {
  const lr = pred.masksLowres[activeIdx];
  if (!lr) return null;
  const [lw, lh] = pred.lowresSize;
  if (lw <= 0 || lh <= 0) return null;
  const bytes = lr instanceof Uint8Array ? lr : new Uint8Array(lr as any);
  if (bytes.length < lw * lh) return null;

  const tmp = document.createElement('canvas');
  tmp.width = lw;
  tmp.height = lh;
  const tctx = tmp.getContext('2d');
  if (!tctx) return null;
  const id = tctx.createImageData(lw, lh);
  for (let i = 0; i < lw * lh; i++) {
    if (bytes[i] > 128) {
      const o = i * 4;
      id.data[o] = PREVIEW_RGB[0];
      id.data[o + 1] = PREVIEW_RGB[1];
      id.data[o + 2] = PREVIEW_RGB[2];
      id.data[o + 3] = 130;
    }
  }
  tctx.putImageData(id, 0, 0);

  const out = document.createElement('canvas');
  out.width = imageWidth;
  out.height = imageHeight;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, lw, lh, 0, 0, imageWidth, imageHeight);
  return out;
}

export function SamRefineLayer({
  imageWidth,
  imageHeight,
  imageOffsetX,
  imageOffsetY,
  scale,
}: Props) {
  const refineMode = useSamStore((s) => s.refineMode);
  const refinePoints = useSamStore((s) => s.refinePoints);
  const refineBbox = useSamStore((s) => s.refineBbox);
  const refinePrediction = useSamStore((s) => s.refinePrediction);
  const refineActiveIdx = useSamStore((s) => s.refineActiveIdx);

  const addRefinePoint = useSamStore((s) => s.addRefinePoint);
  const setRefineBbox = useSamStore((s) => s.setRefineBbox);
  const setRefinePrediction = useSamStore((s) => s.setRefinePrediction);
  const setRefineRunning = useSamStore((s) => s.setRefineRunning);

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const predictTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const predictSeqRef = useRef(0);

  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);

  // Recompose preview cuando cambia prediction o activeIdx.
  useEffect(() => {
    if (!refinePrediction) {
      setPreviewCanvas(null);
      return;
    }
    setPreviewCanvas(
      paintPredictionPreview(refinePrediction, refineActiveIdx, imageWidth, imageHeight),
    );
  }, [refinePrediction, refineActiveIdx, imageWidth, imageHeight]);

  // Auto-predict cuando cambian puntos o bbox (debounced).
  useEffect(() => {
    if (!refineMode) return;
    if (refinePoints.length === 0 && !refineBbox) {
      setRefinePrediction(null);
      return;
    }
    if (predictTimerRef.current) clearTimeout(predictTimerRef.current);
    predictTimerRef.current = setTimeout(() => {
      const seq = ++predictSeqRef.current;
      setRefineRunning(true);
      samPredict({
        points: refinePoints,
        bbox: refineBbox ?? undefined,
        multimaskOutput: true,
      })
        .then((p) => {
          if (seq !== predictSeqRef.current) return;
          setRefinePrediction(p);
        })
        .catch((e) => {
          console.error('[SAM] refine predict falló:', e);
        })
        .finally(() => {
          if (seq === predictSeqRef.current) setRefineRunning(false);
        });
    }, 120);
    return () => {
      if (predictTimerRef.current) clearTimeout(predictTimerRef.current);
    };
  }, [refineMode, refinePoints, refineBbox, setRefinePrediction, setRefineRunning]);

  if (!refineMode) return null;

  // Coords del Layer: el Layer entero está escalado/offset igual que el KonvaImage,
  // así que trabajamos en coords IMAGEN (0..imageWidth × 0..imageHeight).
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const ix = (pointer.x - imageOffsetX) / scale;
    const iy = (pointer.y - imageOffsetY) / scale;
    if (ix < 0 || iy < 0 || ix >= imageWidth || iy >= imageHeight) return;
    dragStartRef.current = { x: ix, y: iy };
    draggedRef.current = false;
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!dragStartRef.current) return;
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const ix = (pointer.x - imageOffsetX) / scale;
    const iy = (pointer.y - imageOffsetY) / scale;
    const dx = ix - dragStartRef.current.x;
    const dy = iy - dragStartRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      draggedRef.current = true;
      const x1 = Math.min(dragStartRef.current.x, ix);
      const y1 = Math.min(dragStartRef.current.y, iy);
      const x2 = Math.max(dragStartRef.current.x, ix);
      const y2 = Math.max(dragStartRef.current.y, iy);
      setRefineBbox([x1, y1, x2, y2]);
    }
  };

  const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) return;
    if (draggedRef.current) {
      // bbox ya quedó seteado en mouseMove — auto-predict lo recoge.
      return;
    }
    // Click sin drag: agregar punto.
    const isNeg = (e.evt as MouseEvent).shiftKey;
    const p: SamPoint = { x: start.x, y: start.y, label: isNeg ? 0 : 1 };
    addRefinePoint(p);
  };

  return (
    <Layer
      x={imageOffsetX}
      y={imageOffsetY}
      scaleX={scale}
      scaleY={scale}
    >
      {/* Captura mouse sobre toda la imagen */}
      <Rect
        x={0}
        y={0}
        width={imageWidth}
        height={imageHeight}
        fill="rgba(0,0,0,0.001)"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />

      {/* Preview de la máscara prediction */}
      {previewCanvas && (
        <KonvaImage
          image={previewCanvas}
          x={0}
          y={0}
          width={imageWidth}
          height={imageHeight}
          listening={false}
        />
      )}

      {/* BBox prompt */}
      {refineBbox && (
        <Rect
          x={refineBbox[0]}
          y={refineBbox[1]}
          width={refineBbox[2] - refineBbox[0]}
          height={refineBbox[3] - refineBbox[1]}
          stroke="#7c3aed"
          strokeWidth={2 / scale}
          dash={[6 / scale, 4 / scale]}
          listening={false}
        />
      )}

      {/* Puntos prompt */}
      {refinePoints.map((p, i) => (
        <Circle
          key={i}
          x={p.x}
          y={p.y}
          radius={6 / scale}
          fill={p.label === 1 ? '#10b981' : '#ef4444'}
          stroke="#fff"
          strokeWidth={2 / scale}
          listening={false}
        />
      ))}
    </Layer>
  );
}

