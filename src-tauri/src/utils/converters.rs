/// Normalize bounding box coordinates to 0-1 range
pub fn normalize_coordinates(x: f64, y: f64, w: f64, h: f64, img_w: f64, img_h: f64) -> (f64, f64, f64, f64) {
    (x / img_w, y / img_h, w / img_w, h / img_h)
}

/// Convert OBB (center + rotation) to axis-aligned bbox (xmin, ymin, xmax, ymax)
pub fn obb_to_aabbox(cx: f64, cy: f64, w: f64, h: f64, rotation_deg: f64) -> (f64, f64, f64, f64) {
    let half_w = w / 2.0;
    let half_h = h / 2.0;
    let rad = rotation_deg.to_radians();
    let cos = rad.cos();
    let sin = rad.sin();

    let corners = [
        (-half_w, -half_h),
        (half_w, -half_h),
        (half_w, half_h),
        (-half_w, half_h),
    ];

    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = f64::MIN;
    let mut max_y = f64::MIN;

    for (dx, dy) in &corners {
        let rx = cx + dx * cos - dy * sin;
        let ry = cy + dx * sin + dy * cos;
        min_x = min_x.min(rx);
        min_y = min_y.min(ry);
        max_x = max_x.max(rx);
        max_y = max_y.max(ry);
    }

    (min_x, min_y, max_x, max_y)
}

/// Escape special XML characters
pub fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Get MIME type from file extension
pub fn mime_type_from_ext(filename: &str) -> &'static str {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        _ => "image/jpeg",
    }
}

/// Sanitize folder name: replace invalid characters
pub fn sanitize_folder_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_whitespace() => '_',
            _ => c,
        })
        .collect::<String>()
        .to_lowercase()
}

/// Calculate polygon area using shoelace formula
pub fn polygon_area(points: &[(f64, f64)]) -> f64 {
    let n = points.len();
    if n < 3 {
        return 0.0;
    }
    let mut area = 0.0;
    for i in 0..n {
        let j = (i + 1) % n;
        area += points[i].0 * points[j].1;
        area -= points[j].0 * points[i].1;
    }
    (area / 2.0).abs()
}
