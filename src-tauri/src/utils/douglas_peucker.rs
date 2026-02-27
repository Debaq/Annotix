/// Douglas-Peucker algorithm for polygon simplification.

#[derive(Debug, Clone, Copy)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// Simplify a polygon using the Douglas-Peucker algorithm.
pub fn douglas_peucker(points: &[Point], epsilon: f64) -> Vec<Point> {
    if points.len() < 3 {
        return points.to_vec();
    }
    simplify_dp(points, epsilon)
}

fn simplify_dp(points: &[Point], epsilon: f64) -> Vec<Point> {
    if points.len() < 3 {
        return points.to_vec();
    }

    let first = points[0];
    let last = points[points.len() - 1];

    let mut max_distance = 0.0_f64;
    let mut max_index = 0;

    for i in 1..points.len() - 1 {
        let d = perpendicular_distance(&points[i], &first, &last);
        if d > max_distance {
            max_distance = d;
            max_index = i;
        }
    }

    if max_distance > epsilon {
        let mut left = simplify_dp(&points[..=max_index], epsilon);
        let right = simplify_dp(&points[max_index..], epsilon);
        left.pop(); // Remove duplicate middle point
        left.extend(right);
        left
    } else {
        vec![first, last]
    }
}

fn perpendicular_distance(point: &Point, line_start: &Point, line_end: &Point) -> f64 {
    let dx = line_end.x - line_start.x;
    let dy = line_end.y - line_start.y;

    if dx == 0.0 && dy == 0.0 {
        return ((point.x - line_start.x).powi(2) + (point.y - line_start.y).powi(2)).sqrt();
    }

    let numerator = (dy * point.x - dx * point.y + line_end.x * line_start.y - line_end.y * line_start.x).abs();
    let denominator = (dx * dx + dy * dy).sqrt();

    numerator / denominator
}

/// Radial distance simplification (faster but less accurate).
pub fn simplify_radial_distance(points: &[Point], tolerance: f64) -> Vec<Point> {
    if points.len() < 3 {
        return points.to_vec();
    }

    let mut simplified = vec![points[0]];
    let mut prev = points[0];

    for point in &points[1..] {
        let dist = ((point.x - prev.x).powi(2) + (point.y - prev.y).powi(2)).sqrt();
        if dist > tolerance {
            simplified.push(*point);
            prev = *point;
        }
    }

    let last = points[points.len() - 1];
    let last_simplified = simplified[simplified.len() - 1];
    if last_simplified.x != last.x || last_simplified.y != last.y {
        simplified.push(last);
    }

    simplified
}

/// Combined simplification: Radial distance + Douglas-Peucker.
pub fn simplify_polygon(points: &[Point], tolerance: f64) -> Vec<Point> {
    if points.len() < 3 {
        return points.to_vec();
    }
    let radial = simplify_radial_distance(points, tolerance * 0.5);
    douglas_peucker(&radial, tolerance)
}
