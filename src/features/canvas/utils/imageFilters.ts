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

// CLAHE and sharpness processing moved to Rust (pixel_commands.rs)
// Use tauriDb.processImageFilters() instead.
