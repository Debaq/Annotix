/**
 * Convert a binary mask to polygon using Moore-Neighbor tracing algorithm
 *
 * Moore-Neighbor Tracing is a contour tracing algorithm that follows the boundary
 * of a binary region by examining the 8-connected neighbors in a specific order.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Extract contour from a binary mask (canvas)
 * @param maskCanvas - Canvas element containing the mask
 * @returns Array of polygon points
 */
export function maskToPolygon(maskCanvas: HTMLCanvasElement): Point[] {
  const ctx = maskCanvas.getContext('2d');
  if (!ctx) return [];

  const width = maskCanvas.width;
  const height = maskCanvas.height;

  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Create binary mask (1 = white pixel, 0 = transparent/black)
  const mask: number[][] = [];
  for (let y = 0; y < height; y++) {
    mask[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      // Consider pixel as part of mask if alpha > 128
      mask[y][x] = alpha > 128 ? 1 : 0;
    }
  }

  // Find starting point (first white pixel from top-left)
  let startX = -1;
  let startY = -1;

  outerLoop: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y][x] === 1) {
        startX = x;
        startY = y;
        break outerLoop;
      }
    }
  }

  // No white pixels found
  if (startX === -1 || startY === -1) {
    return [];
  }

  // Moore-Neighbor tracing
  const contour = mooreNeighborTrace(mask, startX, startY, width, height);

  return contour;
}

/**
 * Moore-Neighbor tracing algorithm
 */
function mooreNeighborTrace(
  mask: number[][],
  startX: number,
  startY: number,
  width: number,
  height: number
): Point[] {
  const contour: Point[] = [];

  // 8-connected neighbors (clockwise from top-left)
  // Directions: 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
  const dx = [0, 1, 1, 1, 0, -1, -1, -1];
  const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

  let x = startX;
  let y = startY;
  let direction = 7; // Start looking from NW (top-left)

  const maxIterations = width * height * 2; // Safety limit
  let iterations = 0;

  do {
    contour.push({ x, y });

    // Search for next boundary pixel
    let found = false;
    for (let i = 0; i < 8; i++) {
      const checkDir = (direction + i) % 8;
      const nx = x + dx[checkDir];
      const ny = y + dy[checkDir];

      // Check bounds
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (mask[ny][nx] === 1) {
          // Found next boundary pixel
          x = nx;
          y = ny;
          // Update search direction (backtrack 2 steps for next iteration)
          direction = (checkDir + 6) % 8; // -2 in circular array
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // No neighbor found, might be isolated pixel
      break;
    }

    iterations++;
    if (iterations > maxIterations) {
      console.warn('Moore-Neighbor tracing: max iterations reached');
      break;
    }
  } while (x !== startX || y !== startY || contour.length < 2);

  // Remove duplicate start/end point
  if (contour.length > 1 && contour[0].x === contour[contour.length - 1].x && contour[0].y === contour[contour.length - 1].y) {
    contour.pop();
  }

  return contour;
}

/**
 * Extract multiple contours from a mask (handles multiple disconnected regions)
 */
export function maskToPolygons(maskCanvas: HTMLCanvasElement, minArea: number = 10): Point[][] {
  const ctx = maskCanvas.getContext('2d');
  if (!ctx) return [];

  const width = maskCanvas.width;
  const height = maskCanvas.height;

  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Create binary mask
  const mask: number[][] = [];
  for (let y = 0; y < height; y++) {
    mask[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      mask[y][x] = alpha > 128 ? 1 : 0;
    }
  }

  const polygons: Point[][] = [];
  const visited: boolean[][] = Array(height)
    .fill(0)
    .map(() => Array(width).fill(false));

  // Find all contours
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y][x] === 1 && !visited[y][x]) {
        const contour = mooreNeighborTrace(mask, x, y, width, height);

        // Mark visited pixels
        for (const point of contour) {
          if (point.y >= 0 && point.y < height && point.x >= 0 && point.x < width) {
            visited[point.y][point.x] = true;
          }
        }

        // Filter by minimum area
        if (contour.length >= 3) {
          const area = calculatePolygonArea(contour);
          if (area >= minArea) {
            polygons.push(contour);
          }
        }
      }
    }
  }

  return polygons;
}

/**
 * Calculate polygon area using shoelace formula
 */
function calculatePolygonArea(points: Point[]): number {
  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area / 2);
}
