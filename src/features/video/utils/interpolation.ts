import type { VideoTrack, VideoKeyframe, InterpolatedBBox } from '@/lib/db';

/**
 * Calcula las bboxes interpoladas para un frame dado a partir de los tracks.
 * Interpolación lineal entre keyframes.
 */
export function interpolateBBoxesForFrame(
  tracks: VideoTrack[],
  frameIndex: number
): InterpolatedBBox[] {
  const results: InterpolatedBBox[] = [];

  for (const track of tracks) {
    if (!track.enabled || track.keyframes.length === 0) continue;

    const bbox = interpolateTrackAtFrame(track.keyframes, frameIndex);
    if (bbox) {
      results.push({
        trackUuid: track.trackUuid,
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

function interpolateTrackAtFrame(
  keyframes: VideoKeyframe[],
  frameIndex: number
): InterpolatedResult | null {
  if (keyframes.length === 0) return null;

  // Exact match
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

  // Find surrounding keyframes
  let prev: VideoKeyframe | null = null;
  let next: VideoKeyframe | null = null;

  for (const kf of keyframes) {
    if (kf.frameIndex < frameIndex) {
      prev = kf;
    } else if (kf.frameIndex > frameIndex && !next) {
      next = kf;
      break;
    }
  }

  // If only one side exists, extend (hold) the nearest keyframe
  if (!prev && next) {
    return {
      x: next.bboxX,
      y: next.bboxY,
      width: next.bboxWidth,
      height: next.bboxHeight,
      isKeyframe: false,
      enabled: next.enabled,
    };
  }
  if (prev && !next) {
    return {
      x: prev.bboxX,
      y: prev.bboxY,
      width: prev.bboxWidth,
      height: prev.bboxHeight,
      isKeyframe: false,
      enabled: prev.enabled,
    };
  }
  if (!prev || !next) return null;

  // Linear interpolation (siempre calcular coords reales, marcar disabled si corresponde)
  const t = (frameIndex - prev.frameIndex) / (next.frameIndex - prev.frameIndex);
  return {
    x: prev.bboxX + (next.bboxX - prev.bboxX) * t,
    y: prev.bboxY + (next.bboxY - prev.bboxY) * t,
    width: prev.bboxWidth + (next.bboxWidth - prev.bboxWidth) * t,
    height: prev.bboxHeight + (next.bboxHeight - prev.bboxHeight) * t,
    isKeyframe: false,
    enabled: prev.enabled && next.enabled,
  };
}
