import type { VideoTrack, VideoKeyframe, InterpolatedBBox } from '@/lib/db';

/**
 * Interpolación de tracks de video.
 *
 * Espejo de `interpolate_bbox` en `src-tauri/src/store/videos.rs`. Los dos lados
 * tienen que dar el mismo resultado: si divergen, el editor muestra cajas que
 * nunca llegan al dataset.
 */

/** Cómo se rellena el hueco entre dos keyframes. */
export type InterpMode = 'linear' | 'ease' | 'smooth';

/** Qué hace el track fuera del rango que cubren sus keyframes. */
export type ExtendMode = 'none' | 'after' | 'both';

export const INTERP_MODES: InterpMode[] = ['linear', 'ease', 'smooth'];
export const EXTEND_MODES: ExtendMode[] = ['none', 'after', 'both'];

/** Un valor desconocido cae al defecto en vez de romper el render. */
export function interpModeOf(track: VideoTrack): InterpMode {
  return track.interpolation === 'ease' || track.interpolation === 'smooth'
    ? track.interpolation
    : 'linear';
}

export function extendModeOf(track: VideoTrack): ExtendMode {
  return track.extend === 'after' || track.extend === 'both' ? track.extend : 'none';
}

/**
 * Calcula las bboxes interpoladas para un frame dado a partir de los tracks.
 */
export function interpolateBBoxesForFrame(
  tracks: VideoTrack[],
  frameIndex: number
): InterpolatedBBox[] {
  const results: InterpolatedBBox[] = [];

  for (const track of tracks) {
    if (!track.enabled || track.keyframes.length === 0) continue;

    const bbox = interpolateTrackAtFrame(track, frameIndex);
    if (bbox) {
      results.push({
        trackId: track.id!,
        classId: track.classId,
        bbox: {
          x: bbox.x,
          y: bbox.y,
          width: bbox.width,
          height: bbox.height,
        },
        isKeyframe: bbox.isKeyframe,
        enabled: bbox.enabled,
      });
    }
  }

  return results;
}

interface InterpolatedResult {
  x: number;
  y: number;
  width: number;
  height: number;
  isKeyframe: boolean;
  enabled: boolean;
}

/**
 * Keyframes ordenados por fotograma, que es lo que asume el cálculo.
 *
 * Casi siempre ya lo están —`set_keyframe` los mantiene así— y entonces devuelve
 * el mismo array sin copiar: esto se llama una vez por fotograma al contar los
 * que cubre la consolidación, y ahí una copia por llamada sí se nota.
 */
function sorted(keyframes: VideoKeyframe[]): VideoKeyframe[] {
  for (let i = 1; i < keyframes.length; i++) {
    if (keyframes[i - 1].frameIndex > keyframes[i].frameIndex) {
      return [...keyframes].sort((a, b) => a.frameIndex - b.frameIndex);
    }
  }
  return keyframes;
}

function hold(kf: VideoKeyframe, enabled: boolean): InterpolatedResult {
  return {
    x: kf.bboxX,
    y: kf.bboxY,
    width: kf.bboxWidth,
    height: kf.bboxHeight,
    isKeyframe: false,
    enabled,
  };
}

/**
 * Caja del track en un fotograma.
 *
 * Un keyframe deshabilitado marca que el objeto sale de escena **desde ese
 * fotograma en adelante**, hasta el siguiente keyframe. Antes apagaba también el
 * tramo anterior: borrar la caja de un fotograma interpolado hacía desaparecer
 * el track entre sus dos keyframes vecinos.
 *
 * Fuera del rango de keyframes manda el modo `extend` del track. Una caja con
 * `enabled: false` se sigue dibujando (en gris, reactivable) pero la
 * consolidación la descarta.
 */
export function interpolateTrackAtFrame(
  track: VideoTrack,
  frameIndex: number
): InterpolatedResult | null {
  const keyframes = sorted(track.keyframes);
  if (keyframes.length === 0) return null;

  const exact = keyframes.find(k => k.frameIndex === frameIndex);
  if (exact) {
    return {
      x: exact.bboxX,
      y: exact.bboxY,
      width: exact.bboxWidth,
      height: exact.bboxHeight,
      isKeyframe: true,
      enabled: exact.enabled,
    };
  }

  let prev = -1;
  let next = -1;
  for (let i = 0; i < keyframes.length; i++) {
    if (keyframes[i].frameIndex < frameIndex) prev = i;
    else if (next === -1) next = i;
  }

  // Fuera de escena desde el keyframe anterior: caja fantasma con su geometría,
  // para poder reactivarla desde cualquier fotograma del tramo.
  if (prev !== -1 && !keyframes[prev].enabled) return hold(keyframes[prev], false);

  if (prev !== -1 && next !== -1) {
    return sampleSpan(keyframes, prev, next, frameIndex, interpModeOf(track));
  }

  const extend = extendModeOf(track);
  if (prev !== -1 && (extend === 'after' || extend === 'both')) {
    return hold(keyframes[prev], true);
  }
  if (next !== -1 && extend === 'both') {
    return hold(keyframes[next], keyframes[next].enabled);
  }
  return null;
}

/** Muestrea el tramo entre los keyframes contiguos `i` y `j`. */
function sampleSpan(
  keyframes: VideoKeyframe[],
  i: number,
  j: number,
  frameIndex: number,
  mode: InterpMode
): InterpolatedResult {
  const p = keyframes[i];
  const n = keyframes[j];
  const t = (frameIndex - p.frameIndex) / (n.frameIndex - p.frameIndex);

  if (mode === 'smooth') {
    // Catmull-Rom con nodos no equiespaciados. Un keyframe deshabilitado no
    // sirve de punto de control: su geometría es la que tenía al salir de escena.
    const before = i > 0 && keyframes[i - 1].enabled ? keyframes[i - 1] : null;
    const after = j + 1 < keyframes.length && keyframes[j + 1].enabled ? keyframes[j + 1] : null;
    const comp = (get: (k: VideoKeyframe) => number) =>
      catmullRom(
        before ? [before.frameIndex, get(before)] : null,
        [p.frameIndex, get(p)],
        [n.frameIndex, get(n)],
        after ? [after.frameIndex, get(after)] : null,
        t
      );
    return {
      x: comp(k => k.bboxX),
      y: comp(k => k.bboxY),
      // Un spline sobrepasa los extremos: el ancho no puede salir negativo por
      // un rebote entre dos keyframes.
      width: Math.max(comp(k => k.bboxWidth), 0),
      height: Math.max(comp(k => k.bboxHeight), 0),
      isKeyframe: false,
      enabled: true,
    };
  }

  // `ease`: recta con arranque y frenada suaves (smoothstep sobre `t`).
  const u = mode === 'ease' ? t * t * (3 - 2 * t) : t;
  return {
    x: p.bboxX + (n.bboxX - p.bboxX) * u,
    y: p.bboxY + (n.bboxY - p.bboxY) * u,
    width: p.bboxWidth + (n.bboxWidth - p.bboxWidth) * u,
    height: p.bboxHeight + (n.bboxHeight - p.bboxHeight) * u,
    isKeyframe: false,
    enabled: true,
  };
}

type Knot = [frame: number, value: number];

/**
 * Hermite cúbico sobre `[p1, p2]` con tangentes de Catmull-Rom. Los nodos son
 * índices de fotograma, así que el espaciado es irregular y las tangentes se
 * calculan con la diferencia dividida. Sin vecino, la tangente cae a la
 * pendiente del propio tramo, que reproduce la recta.
 */
function catmullRom(p0: Knot | null, p1: Knot, p2: Knot, p3: Knot | null, t: number): number {
  const [f1, v1] = p1;
  const [f2, v2] = p2;
  const h = f2 - f1;
  const slope = (v2 - v1) / h;

  const m1 = p0 && p0[0] !== f2 ? (v2 - p0[1]) / (f2 - p0[0]) : slope;
  const m2 = p3 && p3[0] !== f1 ? (p3[1] - v1) / (p3[0] - f1) : slope;

  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * v1 +
    (t3 - 2 * t2 + t) * h * m1 +
    (-2 * t3 + 3 * t2) * v2 +
    (t3 - t2) * h * m2
  );
}

/**
 * Cuántos de esos fotogramas reciben al menos una caja al consolidar.
 *
 * Cuenta fotogramas que existen de verdad, no un rango de enteros: si la
 * secuencia extraída tiene huecos, un rango los contaría y el número mentiría.
 * Y evalúa la interpolación completa en vez de mirar solo el primer y último
 * keyframe, porque con `extend` o con una salida de escena de por medio el
 * rango de keyframes ya no dice qué fotogramas quedan cubiertos.
 */
export function countCoveredFrames(
  tracks: VideoTrack[],
  frameIndices: Iterable<number>
): number {
  const activos = tracks.filter(tr => tr.enabled && tr.keyframes.length > 0);
  if (activos.length === 0) return 0;

  let total = 0;
  for (const frameIndex of frameIndices) {
    if (activos.some(tr => interpolateTrackAtFrame(tr, frameIndex)?.enabled)) total++;
  }
  return total;
}

/**
 * Tramos en los que el track produce caja, en índices de fotograma reales.
 * `hasta` puede ser `Infinity` si el track prolonga su última caja.
 *
 * Es lo que dibuja la pista de la línea de tiempo: un track con una salida de
 * escena en medio no es un bloque continuo, y pintarlo como tal esconde
 * justamente el hueco que el anotador necesita ver.
 */
export function trackSpans(track: VideoTrack): { desde: number; hasta: number }[] {
  const keyframes = sorted(track.keyframes);
  if (keyframes.length === 0) return [];

  const extend = extendModeOf(track);
  const spans: { desde: number; hasta: number }[] = [];
  const primero = keyframes[0];
  const ultimo = keyframes[keyframes.length - 1];

  if (extend === 'both' && primero.enabled) {
    spans.push({ desde: -Infinity, hasta: primero.frameIndex });
  }
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i].enabled) {
      spans.push({ desde: keyframes[i].frameIndex, hasta: keyframes[i + 1].frameIndex });
    }
  }
  if (extend !== 'none' && ultimo.enabled) {
    spans.push({ desde: ultimo.frameIndex, hasta: Infinity });
  }
  // Un track de un solo keyframe que no se prolonga sigue existiendo en ese
  // fotograma: sin este tramo degenerado la pista saldría vacía.
  if (spans.length === 0 && ultimo.enabled) {
    spans.push({ desde: ultimo.frameIndex, hasta: ultimo.frameIndex });
  }
  return spans;
}

/**
 * Tracks cuya última caja llega al final del video porque nadie marcó su salida
 * de escena.
 *
 * Prolongar es útil mientras el objeto siga ahí; el fallo caro es olvidarse de
 * cerrar el track, y entonces la consolidación escribe esa caja en todos los
 * fotogramas restantes sin que nada lo delate. Esto los localiza para poder
 * avisar antes de escribir.
 *
 * `lastFrameIndex` es el `frameIndex` real del último fotograma extraído.
 */
export function openTracks(tracks: VideoTrack[], lastFrameIndex: number): VideoTrack[] {
  return tracks.filter(track => {
    if (!track.enabled || track.keyframes.length === 0) return false;
    if (extendModeOf(track) === 'none') return false;

    const ultimo = sorted(track.keyframes)[track.keyframes.length - 1];
    // Un keyframe de salida ya cierra el track: no queda nada prolongándose.
    if (!ultimo.enabled) return false;
    // Y si el último keyframe es el último fotograma, no prolonga sobre nada.
    return ultimo.frameIndex < lastFrameIndex;
  });
}
