// Eventos de anotación de video del modo estudio (sección 3.5).
//
// Los identificadores internos de trayectoria nunca salen en claro: viajan
// como SHA-256. El conteo de fotogramas revisados es de sesión, no de disco:
// mide cuántos fotogramas interpolados llegó a mirar el usuario antes de
// consolidar.

import { studyLog } from './studyLog';

const hashCache = new Map<string, string>();

/** SHA-256 hexadecimal del identificador interno de una trayectoria. */
export async function hashTrackId(trackId: string): Promise<string> {
  const cached = hashCache.get(trackId);
  if (cached) return cached;
  const bytes = new TextEncoder().encode(trackId);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  hashCache.set(trackId, hex);
  return hex;
}

/** Fotogramas interpolados que el usuario ya miró, por video. */
const reviewed = new Map<string, Set<number>>();

function reviewedSet(videoId: string): Set<number> {
  let s = reviewed.get(videoId);
  if (!s) {
    s = new Set();
    reviewed.set(videoId, s);
  }
  return s;
}

export function emitKeyframeSet(trackId: string, frameIndex: number): void {
  if (!studyLog.isActive()) return;
  void hashTrackId(trackId).then((h) => {
    studyLog.emit('video.keyframe.set', { track_id_hash: h, frame_idx: frameIndex });
  });
}

/**
 * El usuario pasó por un fotograma interpolado de una trayectoria. `changed`
 * distingue mirarlo de corregirlo. Cada fotograma cuenta una sola vez por
 * sesión, salvo que se corrija.
 */
export function emitKeyframeReview(
  videoId: string,
  trackId: string,
  frameIndex: number,
  changed: boolean,
): void {
  if (!studyLog.isActive()) return;
  const seen = reviewedSet(videoId);
  if (seen.has(frameIndex) && !changed) return;
  seen.add(frameIndex);
  void hashTrackId(trackId).then((h) => {
    studyLog.emit('video.keyframe.review', {
      track_id_hash: h,
      frame_idx: frameIndex,
      changed,
    });
  });
}

export interface ConsolidateCounts {
  videoId: string;
  nTracks: number;
  nFramesTotal: number;
  nFramesKeyed: number;
}

/** Se emite al consolidar (bake) los tracks de un video. */
export function emitConsolidate({
  videoId,
  nTracks,
  nFramesTotal,
  nFramesKeyed,
}: ConsolidateCounts): void {
  if (!studyLog.isActive()) return;
  const nReviewed = reviewedSet(videoId).size;
  const interpolated = Math.max(0, nFramesTotal - nFramesKeyed);
  studyLog.emit('video.consolidate', {
    n_tracks: nTracks,
    n_frames_total: nFramesTotal,
    n_frames_keyed: nFramesKeyed,
    n_frames_reviewed: nReviewed,
    n_frames_interpolated_unreviewed: Math.max(0, interpolated - nReviewed),
  });
}
