import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

/**
 * Lazy-load FFmpeg WASM singleton (single-threaded, no special headers needed).
 * Core is fetched from CDN on first use and cached by the browser.
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();

    // Log FFmpeg output to console for debugging
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    // Serve core files from same origin (public/ffmpeg/) to avoid CORS/COEP issues
    console.log('[FFmpeg] Loading WASM core from same origin...');

    try {
      await ffmpeg.load({
        coreURL: new URL('/ffmpeg/ffmpeg-core.js', window.location.origin).href,
        wasmURL: new URL('/ffmpeg/ffmpeg-core.wasm', window.location.origin).href,
      });
      console.log('[FFmpeg] Loaded successfully');
    } catch (loadErr) {
      console.error('[FFmpeg] load() failed:', loadErr);
      throw loadErr;
    }

    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })().catch((err) => {
    // Reset so next call retries
    loadPromise = null;
    throw err;
  });

  return loadPromise;
}

/**
 * Probe video info using FFmpeg (works with any format FFmpeg supports).
 */
export async function getVideoInfoFFmpeg(file: File): Promise<{
  duration: number;
  width: number;
  height: number;
}> {
  const ffmpeg = await getFFmpeg();

  let duration = 0;
  let width = 0;
  let height = 0;

  const logHandler = ({ message }: { message: string }) => {
    // Parse: "Duration: 00:01:30.50, ..."
    const durMatch = message.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (durMatch) {
      duration =
        parseInt(durMatch[1]) * 3600 +
        parseInt(durMatch[2]) * 60 +
        parseFloat(durMatch[3]);
    }
    // Parse: "1920x1080" from stream info like "Video: h264 ..., 1920x1080"
    const resMatch = message.match(/,\s*(\d{2,5})x(\d{2,5})/);
    if (resMatch && !width) {
      width = parseInt(resMatch[1]);
      height = parseInt(resMatch[2]);
    }
  };

  ffmpeg.on('log', logHandler);

  console.log('[FFmpeg] Writing file to virtual FS...');
  await ffmpeg.writeFile('probe_input', await fetchFile(file));

  console.log('[FFmpeg] Probing video...');
  // Extract a single frame - this forces FFmpeg to read the container and log info
  await ffmpeg.exec([
    '-i', 'probe_input',
    '-frames:v', '1',
    '-f', 'image2',
    'probe_frame.jpg',
  ]);
  console.log('[FFmpeg] Probe complete');

  ffmpeg.off('log', logHandler);

  // If we got a frame but not dimensions from logs, read them from the JPEG
  if (!width || !height) {
    try {
      const probeData = await ffmpeg.readFile('probe_frame.jpg');
      if (probeData instanceof Uint8Array) {
        const dims = await getImageDimensions(
          new Blob([probeData], { type: 'image/jpeg' })
        );
        width = dims.width;
        height = dims.height;
      }
    } catch {
      // ignore
    }
  }

  // Cleanup
  await ffmpeg.deleteFile('probe_input').catch(() => {});
  await ffmpeg.deleteFile('probe_frame.jpg').catch(() => {});

  if (!duration || !width || !height) {
    throw new Error('Could not determine video info via FFmpeg');
  }

  return { duration, width, height };
}

/**
 * Extract frames using FFmpeg. Runs extraction in one pass, then yields frames.
 */
export async function* extractFramesFFmpeg(
  file: File,
  options: {
    mode: 'fps' | 'everyN';
    value: number;
    quality: number;
    signal?: AbortSignal;
  }
): AsyncGenerator<{ blob: Blob; width: number; height: number; frameIndex: number; timestamp: number }> {
  const ffmpeg = await getFFmpeg();

  console.log('[FFmpeg] Writing input for extraction...');
  await ffmpeg.writeFile('input', await fetchFile(file));

  // Quality: our 0.1-1.0 maps to ffmpeg 31-2 (lower = better)
  const qv = Math.round(2 + (1 - options.quality) * 29);

  const args = ['-i', 'input'];
  if (options.mode === 'fps') {
    args.push('-vf', `fps=${options.value}`);
  } else {
    // Every N-th frame (select filter)
    args.push('-vf', `select='not(mod(n\\,${options.value}))'`, '-vsync', 'vfr');
  }
  args.push('-q:v', String(qv), 'ffframe_%05d.jpg');

  console.log('[FFmpeg] Extracting frames:', args.join(' '));
  await ffmpeg.exec(args);
  console.log('[FFmpeg] Extraction complete, reading frames...');

  // Read and yield frames one by one
  let idx = 1;
  let width = 0;
  let height = 0;

  while (true) {
    if (options.signal?.aborted) break;

    const name = `ffframe_${String(idx).padStart(5, '0')}.jpg`;
    let data: Uint8Array;
    try {
      const result = await ffmpeg.readFile(name);
      if (result instanceof Uint8Array) {
        data = result;
      } else {
        break;
      }
      await ffmpeg.deleteFile(name);
    } catch {
      break;
    }

    const blob = new Blob([data], { type: 'image/jpeg' });

    // Get dimensions from first frame
    if (idx === 1) {
      const dims = await getImageDimensions(blob);
      width = dims.width;
      height = dims.height;
    }

    yield {
      blob,
      width,
      height,
      frameIndex: idx - 1,
      timestamp: 0,
    };

    idx++;
  }

  // Cleanup remaining frames (in case of abort)
  for (let cleanIdx = idx; ; cleanIdx++) {
    try {
      await ffmpeg.deleteFile(`ffframe_${String(cleanIdx).padStart(5, '0')}.jpg`);
    } catch {
      break;
    }
  }
  await ffmpeg.deleteFile('input').catch(() => {});
}

function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to get image dimensions'));
    };
    img.src = url;
  });
}
