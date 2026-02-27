import {
  getVideoInfoFFmpeg,
  extractFramesFFmpeg,
} from './ffmpegService';

export interface VideoInfo {
  duration: number;       // seconds
  width: number;
  height: number;
  name: string;
  nativeSupport: boolean; // true if browser can decode natively
}

export interface ExtractionOptions {
  mode: 'fps' | 'everyN';
  value: number;          // FPS value or N-th frame interval
  quality: number;        // JPEG quality 0-1
  signal?: AbortSignal;
}

export interface FrameResult {
  blob: Blob;
  width: number;
  height: number;
  frameIndex: number;
  timestamp: number;
}

// ============================================================================
// Native approach (fast, only for browser-supported codecs)
// ============================================================================

function getVideoInfoNative(file: File): Promise<Omit<VideoInfo, 'nativeSupport'>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);

    const cleanup = () => URL.revokeObjectURL(url);

    video.addEventListener('loadedmetadata', () => {
      cleanup();
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        name: file.name,
      });
    });

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error('Native decode not supported'));
    });

    video.src = url;
  });
}

async function* extractFramesNative(
  file: File,
  options: ExtractionOptions
): AsyncGenerator<FrameResult> {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  const url = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = url;
    });

    const width = video.videoWidth;
    const height = video.videoHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const timestamps = calculateTimestamps(video.duration, options);

    for (let i = 0; i < timestamps.length; i++) {
      if (options.signal?.aborted) return;

      const timestamp = timestamps[i];

      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
          reject(new Error(`Seek failed at ${timestamp}s`));
        };
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);
        video.currentTime = timestamp;
      });

      ctx.drawImage(video, 0, 0, width, height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          'image/jpeg',
          options.quality
        );
      });

      yield { blob, width, height, frameIndex: i, timestamp };
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ============================================================================
// Public API (native first, FFmpeg fallback)
// ============================================================================

/**
 * Get video info. Tries native browser decode, falls back to FFmpeg.wasm.
 */
export async function getVideoInfo(file: File): Promise<VideoInfo> {
  // Try native first (instant)
  try {
    const info = await getVideoInfoNative(file);
    return { ...info, nativeSupport: true };
  } catch {
    // Native failed - load FFmpeg and probe
  }

  const ffInfo = await getVideoInfoFFmpeg(file);
  return {
    ...ffInfo,
    name: file.name,
    nativeSupport: false,
  };
}

/**
 * Calculate estimated frame count.
 */
export function calculateTimestamps(
  duration: number,
  options: Pick<ExtractionOptions, 'mode' | 'value'>
): number[] {
  const timestamps: number[] = [];

  if (options.mode === 'fps') {
    const interval = 1 / options.value;
    for (let t = 0; t < duration; t += interval) {
      timestamps.push(t);
    }
  } else {
    // everyN: assume ~30fps base
    const baseFps = 30;
    const interval = options.value / baseFps;
    for (let t = 0; t < duration; t += interval) {
      timestamps.push(t);
    }
  }

  return timestamps;
}

/**
 * Extract frames. Uses native if supported, FFmpeg.wasm otherwise.
 */
export async function* extractFrames(
  file: File,
  options: ExtractionOptions,
  nativeSupport: boolean
): AsyncGenerator<FrameResult> {
  if (nativeSupport) {
    yield* extractFramesNative(file, options);
  } else {
    yield* extractFramesFFmpeg(file, options);
  }
}
