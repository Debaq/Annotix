import type { ImageAdjustmentValues } from '../components/ImageAdjustments';

/**
 * Builds a CSS filter string for brightness, contrast and temperature.
 * Applied directly to the Konva image layer canvas element.
 */
export function buildCSSFilter(adj: ImageAdjustmentValues): string {
  const parts: string[] = [];

  // Brightness: -100→0.0, 0→1.0, 100→2.0
  if (adj.brightness !== 0) {
    parts.push(`brightness(${1 + adj.brightness / 100})`);
  }

  // Contrast: -100→0.0, 0→1.0, 100→2.0
  if (adj.contrast !== 0) {
    parts.push(`contrast(${1 + adj.contrast / 100})`);
  }

  // Temperature: negative=cool (blue shift), positive=warm (orange shift)
  if (adj.temperature !== 0) {
    const t = adj.temperature / 100; // -1 to 1
    if (t > 0) {
      // Warm: slight sepia + saturate
      parts.push(`sepia(${t * 0.25})`);
      parts.push(`saturate(${1 + t * 0.3})`);
    } else {
      // Cool: hue-rotate towards blue + slight saturate
      parts.push(`sepia(${Math.abs(t) * 0.15})`);
      parts.push(`hue-rotate(${Math.abs(t) * 180}deg)`);
      parts.push(`saturate(${1 + Math.abs(t) * 0.2})`);
    }
  }

  return parts.length > 0 ? parts.join(' ') : 'none';
}

/**
 * Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to image data.
 * Simplified tile-based implementation for real-time use.
 */
function applyCLAHE(
  src: ImageData,
  clipLimit: number,    // 1-10 typical
  tileGridX: number,
  tileGridY: number,
): ImageData {
  const { width, height, data } = src;
  const out = new ImageData(new Uint8ClampedArray(data), width, height);

  // Convert to grayscale luminance for histogram equalization, then apply to RGB
  const tileW = Math.ceil(width / tileGridX);
  const tileH = Math.ceil(height / tileGridY);

  // Build lookup tables for each tile
  const luts: Uint8Array[][] = [];

  for (let ty = 0; ty < tileGridY; ty++) {
    luts[ty] = [];
    for (let tx = 0; tx < tileGridX; tx++) {
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = Math.min(x0 + tileW, width);
      const y1 = Math.min(y0 + tileH, height);

      // Build histogram of luminance
      const hist = new Uint32Array(256);
      let pixelCount = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * 4;
          const lum = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
          hist[lum]++;
          pixelCount++;
        }
      }

      // Clip histogram
      if (clipLimit > 1) {
        const limit = Math.max(1, Math.round((clipLimit * pixelCount) / 256));
        let excess = 0;
        for (let i = 0; i < 256; i++) {
          if (hist[i] > limit) {
            excess += hist[i] - limit;
            hist[i] = limit;
          }
        }
        // Redistribute excess
        const increment = Math.floor(excess / 256);
        const remainder = excess - increment * 256;
        for (let i = 0; i < 256; i++) {
          hist[i] += increment + (i < remainder ? 1 : 0);
        }
      }

      // Build CDF → LUT
      const lut = new Uint8Array(256);
      let cdf = 0;
      const scale = 255 / Math.max(1, pixelCount);
      for (let i = 0; i < 256; i++) {
        cdf += hist[i];
        lut[i] = Math.min(255, Math.round(cdf * scale));
      }

      luts[ty][tx] = lut;
    }
  }

  // Apply with bilinear interpolation between tiles
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);

      // Find surrounding tile centers
      const fx = (x / tileW) - 0.5;
      const fy = (y / tileH) - 0.5;
      const tx0 = Math.max(0, Math.floor(fx));
      const ty0 = Math.max(0, Math.floor(fy));
      const tx1 = Math.min(tileGridX - 1, tx0 + 1);
      const ty1 = Math.min(tileGridY - 1, ty0 + 1);
      const ax = Math.max(0, Math.min(1, fx - tx0));
      const ay = Math.max(0, Math.min(1, fy - ty0));

      // Bilinear interpolation of mapped values
      const v00 = luts[ty0][tx0][lum];
      const v10 = luts[ty0][tx1][lum];
      const v01 = luts[ty1][tx0][lum];
      const v11 = luts[ty1][tx1][lum];
      const mapped = v00 * (1 - ax) * (1 - ay) + v10 * ax * (1 - ay) +
                     v01 * (1 - ax) * ay + v11 * ax * ay;

      // Apply ratio to each channel
      const ratio = lum > 0 ? mapped / lum : 1;
      out.data[idx]     = Math.min(255, Math.round(data[idx] * ratio));
      out.data[idx + 1] = Math.min(255, Math.round(data[idx + 1] * ratio));
      out.data[idx + 2] = Math.min(255, Math.round(data[idx + 2] * ratio));
      out.data[idx + 3] = data[idx + 3];
    }
  }

  return out;
}

/**
 * Apply unsharp mask for sharpening.
 */
function applySharpness(src: ImageData, amount: number): ImageData {
  const { width, height, data } = src;
  const out = new ImageData(new Uint8ClampedArray(data), width, height);

  // Simple 3x3 sharpen kernel: identity + amount * (identity - blur)
  // Kernel: [-a, -a, -a, -a, 1+8a, -a, -a, -a, -a] where a = amount
  const a = amount;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const idx = (y * width + x) * 4 + c;
        const center = data[idx];

        const sum =
          data[((y - 1) * width + (x - 1)) * 4 + c] +
          data[((y - 1) * width + x) * 4 + c] +
          data[((y - 1) * width + (x + 1)) * 4 + c] +
          data[(y * width + (x - 1)) * 4 + c] +
          data[(y * width + (x + 1)) * 4 + c] +
          data[((y + 1) * width + (x - 1)) * 4 + c] +
          data[((y + 1) * width + x) * 4 + c] +
          data[((y + 1) * width + (x + 1)) * 4 + c];

        const sharpened = center + a * (8 * center - sum);
        out.data[idx] = Math.min(255, Math.max(0, Math.round(sharpened)));
      }
    }
  }

  return out;
}

/**
 * Process an image with CLAHE and/or sharpness filters.
 * Returns a new HTMLImageElement if processing is needed, or null if no processing required.
 */
export function processImage(
  originalImage: HTMLImageElement,
  adj: ImageAdjustmentValues,
): Promise<HTMLImageElement | null> {
  const needsCLAHE = adj.clahe > 0;
  const needsSharpness = adj.sharpness > 0;

  if (!needsCLAHE && !needsSharpness) return Promise.resolve(null);

  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const w = originalImage.naturalWidth || originalImage.width;
    const h = originalImage.naturalHeight || originalImage.height;

    // Limit processing size for performance
    const maxDim = 2048;
    let pw = w, ph = h;
    if (w > maxDim || h > maxDim) {
      const ratio = maxDim / Math.max(w, h);
      pw = Math.round(w * ratio);
      ph = Math.round(h * ratio);
    }

    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(originalImage, 0, 0, pw, ph);
    let imageData = ctx.getImageData(0, 0, pw, ph);

    if (needsCLAHE) {
      // clipLimit: 1 (no clip) to 8 (strong), mapped from 0-100
      const clipLimit = 1 + (adj.clahe / 100) * 7;
      const tiles = Math.max(2, Math.min(8, Math.round(Math.max(pw, ph) / 128)));
      imageData = applyCLAHE(imageData, clipLimit, tiles, tiles);
    }

    if (needsSharpness) {
      // amount: 0 to 0.5
      const amount = (adj.sharpness / 100) * 0.5;
      imageData = applySharpness(imageData, amount);
    }

    ctx.putImageData(imageData, 0, 0);

    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL();
  });
}
