// Coordinate conversion utilities

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Normalize bounding box coordinates to 0-1 range
 */
export function normalizeCoordinates(
  bbox: BBox,
  imageWidth: number,
  imageHeight: number
): NormalizedBBox {
  return {
    x: bbox.x / imageWidth,
    y: bbox.y / imageHeight,
    width: bbox.width / imageWidth,
    height: bbox.height / imageHeight,
  };
}

/**
 * Denormalize bounding box coordinates from 0-1 range to pixels
 */
export function denormalizeCoordinates(
  bbox: NormalizedBBox,
  imageWidth: number,
  imageHeight: number
): BBox {
  return {
    x: bbox.x * imageWidth,
    y: bbox.y * imageHeight,
    width: bbox.width * imageWidth,
    height: bbox.height * imageHeight,
  };
}

/**
 * Convert mask to polygon points (skeleton implementation)
 * TODO: Implement actual mask-to-polygon conversion using marching squares or similar
 */
export function maskToPolygon(maskData: string): number[][] {
  // Placeholder: Return empty polygon
  // In a real implementation, this would:
  // 1. Load mask image
  // 2. Extract contours using marching squares algorithm
  // 3. Simplify polygon using Douglas-Peucker
  // 4. Return normalized coordinates
  return [];
}
