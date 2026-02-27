/// Moore-Neighbor tracing algorithm for extracting contours from binary masks.

#[derive(Debug, Clone, Copy)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

/// Extract contour from a binary mask using Moore-Neighbor tracing.
/// `mask` is a flat array of booleans (row-major), true = foreground.
pub fn mask_to_polygon(mask: &[bool], width: usize, height: usize) -> Vec<Point> {
    // Find starting point (first true pixel from top-left)
    let mut start_x: Option<usize> = None;
    let mut start_y: Option<usize> = None;

    'outer: for y in 0..height {
        for x in 0..width {
            if mask[y * width + x] {
                start_x = Some(x);
                start_y = Some(y);
                break 'outer;
            }
        }
    }

    let (start_x, start_y) = match (start_x, start_y) {
        (Some(sx), Some(sy)) => (sx, sy),
        _ => return Vec::new(),
    };

    moore_neighbor_trace(mask, start_x, start_y, width, height)
}

/// Extract multiple contours from a mask (handles disconnected regions).
pub fn mask_to_polygons(mask: &[bool], width: usize, height: usize, min_area: f64) -> Vec<Vec<Point>> {
    let mut visited = vec![false; width * height];
    let mut polygons = Vec::new();

    for y in 0..height {
        for x in 0..width {
            let idx = y * width + x;
            if mask[idx] && !visited[idx] {
                let contour = moore_neighbor_trace(mask, x, y, width, height);

                // Mark visited pixels
                for p in &contour {
                    let px = p.x as usize;
                    let py = p.y as usize;
                    if px < width && py < height {
                        visited[py * width + px] = true;
                    }
                }

                // Filter by minimum area
                if contour.len() >= 3 {
                    let points: Vec<(f64, f64)> = contour.iter().map(|p| (p.x as f64, p.y as f64)).collect();
                    let area = super::converters::polygon_area(&points);
                    if area >= min_area {
                        polygons.push(contour);
                    }
                }
            }
        }
    }

    polygons
}

fn moore_neighbor_trace(mask: &[bool], start_x: usize, start_y: usize, width: usize, height: usize) -> Vec<Point> {
    let mut contour = Vec::new();

    // 8-connected neighbors (clockwise from N)
    // 0=N, 1=NE, 2=E, 3=SE, 4=S, 5=SW, 6=W, 7=NW
    let dx: [i32; 8] = [0, 1, 1, 1, 0, -1, -1, -1];
    let dy: [i32; 8] = [-1, -1, 0, 1, 1, 1, 0, -1];

    let mut x = start_x as i32;
    let mut y = start_y as i32;
    let mut direction: usize = 7; // Start looking from NW

    let max_iterations = width * height * 2;
    let mut iterations = 0;

    loop {
        contour.push(Point { x, y });

        let mut found = false;
        for i in 0..8 {
            let check_dir = (direction + i) % 8;
            let nx = x + dx[check_dir];
            let ny = y + dy[check_dir];

            if nx >= 0 && (nx as usize) < width && ny >= 0 && (ny as usize) < height {
                if mask[ny as usize * width + nx as usize] {
                    x = nx;
                    y = ny;
                    direction = (check_dir + 6) % 8; // backtrack 2
                    found = true;
                    break;
                }
            }
        }

        if !found {
            break;
        }

        iterations += 1;
        if iterations > max_iterations {
            break;
        }

        if x == start_x as i32 && y == start_y as i32 && contour.len() >= 2 {
            break;
        }
    }

    // Remove duplicate start/end point
    if contour.len() > 1 {
        let last = contour.len() - 1;
        if contour[0].x == contour[last].x && contour[0].y == contour[last].y {
            contour.pop();
        }
    }

    contour
}
