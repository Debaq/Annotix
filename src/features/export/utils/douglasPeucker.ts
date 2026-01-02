/**
 * Douglas-Peucker algorithm for polygon simplification
 *
 * The Douglas-Peucker algorithm reduces the number of points in a curve
 * while maintaining its overall shape. It recursively divides the curve
 * and eliminates points that contribute less than a specified tolerance.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Simplify a polygon using the Douglas-Peucker algorithm
 *
 * @param points - Array of polygon points
 * @param epsilon - Distance tolerance (higher = more simplification)
 * @returns Simplified array of points
 */
export function douglasPeucker(points: Point[], epsilon: number = 2.0): Point[] {
  if (points.length < 3) {
    return points;
  }

  return simplifyDouglasPeucker(points, epsilon);
}

/**
 * Recursive Douglas-Peucker implementation
 */
function simplifyDouglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) {
    return points;
  }

  // Find the point with the maximum distance from the line segment
  let maxDistance = 0;
  let maxIndex = 0;

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], firstPoint, lastPoint);

    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDistance > epsilon) {
    // Recursive call on the two segments
    const leftSegment = simplifyDouglasPeucker(points.slice(0, maxIndex + 1), epsilon);
    const rightSegment = simplifyDouglasPeucker(points.slice(maxIndex), epsilon);

    // Combine results (remove duplicate middle point)
    return [...leftSegment.slice(0, -1), ...rightSegment];
  } else {
    // All points between first and last can be removed
    return [firstPoint, lastPoint];
  }
}

/**
 * Calculate perpendicular distance from a point to a line segment
 *
 * @param point - The point to measure distance from
 * @param lineStart - Start point of the line segment
 * @param lineEnd - End point of the line segment
 * @returns Perpendicular distance
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  // Handle case where line segment is a point
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
  }

  // Calculate perpendicular distance using cross product
  const numerator = Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x);
  const denominator = Math.hypot(dx, dy);

  return numerator / denominator;
}

/**
 * Radial distance simplification (faster but less accurate than Douglas-Peucker)
 *
 * Removes points that are within a certain distance from the previous point.
 *
 * @param points - Array of polygon points
 * @param tolerance - Minimum distance between consecutive points
 * @returns Simplified array of points
 */
export function simplifyRadialDistance(points: Point[], tolerance: number = 2.0): Point[] {
  if (points.length < 3) {
    return points;
  }

  const simplified: Point[] = [points[0]];
  let prevPoint = points[0];

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    const distance = Math.hypot(point.x - prevPoint.x, point.y - prevPoint.y);

    if (distance > tolerance) {
      simplified.push(point);
      prevPoint = point;
    }
  }

  // Always include the last point
  const lastPoint = points[points.length - 1];
  if (
    simplified[simplified.length - 1].x !== lastPoint.x ||
    simplified[simplified.length - 1].y !== lastPoint.y
  ) {
    simplified.push(lastPoint);
  }

  return simplified;
}

/**
 * Combined simplification: Radial distance + Douglas-Peucker
 *
 * First applies radial distance for quick reduction, then Douglas-Peucker for accuracy.
 *
 * @param points - Array of polygon points
 * @param tolerance - Distance tolerance
 * @returns Simplified array of points
 */
export function simplifyPolygon(points: Point[], tolerance: number = 2.0): Point[] {
  if (points.length < 3) {
    return points;
  }

  // First pass: radial distance (faster)
  const radialSimplified = simplifyRadialDistance(points, tolerance * 0.5);

  // Second pass: Douglas-Peucker (more accurate)
  return douglasPeucker(radialSimplified, tolerance);
}

/**
 * Calculate the reduction percentage after simplification
 *
 * @param original - Original polygon points
 * @param simplified - Simplified polygon points
 * @returns Percentage reduction (0-100)
 */
export function calculateReduction(original: Point[], simplified: Point[]): number {
  if (original.length === 0) return 0;

  const reduction = ((original.length - simplified.length) / original.length) * 100;
  return Math.max(0, Math.min(100, reduction));
}
