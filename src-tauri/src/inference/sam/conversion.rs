//! Conversión máscara raster (binaria 0/255) → formato de la herramienta activa.
//!
//! Salida `serde_json::Value` con la misma estructura que `AnnotationEntry.data`
//! consume el frontend:
//! - `Bbox`    → `{x,y,width,height}`           (top-left, píxeles)
//! - `Obb`     → `{x,y,width,height,rotation}`  (centro, radianes; minAreaRect)
//! - `Polygon` → `{points:[{x,y}], closed:true}` (Douglas-Peucker)
//! - `Mask`    → `{base64png}`                  (RGBA PNG, alpha 255 dentro)

use super::MaskTarget;
use base64::{engine::general_purpose::STANDARD, Engine};
use geo::algorithm::{ConvexHull, Simplify};
use geo::{Coord, LineString, MultiPoint, Point};
use image::{GrayImage, ImageFormat, Rgba, RgbaImage};
use imageproc::contours::find_contours;
use serde_json::json;
use std::io::Cursor;

pub fn mask_to_annotation(
    mask: &GrayImage,
    target: MaskTarget,
    dp_tolerance: f32,
) -> Result<serde_json::Value, String> {
    match target {
        MaskTarget::Bbox => mask_to_bbox(mask),
        MaskTarget::Obb => mask_to_obb(mask),
        MaskTarget::Polygon => mask_to_polygon(mask, dp_tolerance),
        MaskTarget::Mask => mask_to_base64png(mask),
    }
}

// ─── Bbox ────────────────────────────────────────────────────────────────────

fn mask_bounds(mask: &GrayImage) -> Option<(u32, u32, u32, u32)> {
    let (w, h) = (mask.width(), mask.height());
    let raw = mask.as_raw();
    let mut min_x = u32::MAX;
    let mut max_x = 0u32;
    let mut min_y = u32::MAX;
    let mut max_y = 0u32;
    let mut found = false;
    for y in 0..h {
        let row = &raw[(y * w) as usize..((y + 1) * w) as usize];
        for (x, &v) in row.iter().enumerate() {
            if v >= 128 {
                let x = x as u32;
                if x < min_x { min_x = x; }
                if x > max_x { max_x = x; }
                if y < min_y { min_y = y; }
                if y > max_y { max_y = y; }
                found = true;
            }
        }
    }
    if !found { None } else { Some((min_x, min_y, max_x, max_y)) }
}

fn mask_to_bbox(mask: &GrayImage) -> Result<serde_json::Value, String> {
    let (x0, y0, x1, y1) = mask_bounds(mask).ok_or_else(|| "máscara vacía".to_string())?;
    Ok(json!({
        "x": x0 as f64,
        "y": y0 as f64,
        "width": (x1 - x0 + 1) as f64,
        "height": (y1 - y0 + 1) as f64,
    }))
}

// ─── Polygon ─────────────────────────────────────────────────────────────────

/// Devuelve los puntos del contorno externo más grande (por # de píxeles).
fn largest_outer_contour(mask: &GrayImage) -> Option<Vec<(f64, f64)>> {
    let contours = find_contours::<i32>(mask);
    contours
        .into_iter()
        .filter(|c| c.border_type == imageproc::contours::BorderType::Outer && c.points.len() >= 3)
        .max_by_key(|c| c.points.len())
        .map(|c| {
            c.points
                .into_iter()
                .map(|p| (p.x as f64, p.y as f64))
                .collect()
        })
}

fn mask_to_polygon(mask: &GrayImage, dp_tolerance: f32) -> Result<serde_json::Value, String> {
    let pts = largest_outer_contour(mask).ok_or_else(|| "máscara sin contorno".to_string())?;

    // LineString cerrado para simplify.
    let mut coords: Vec<Coord<f64>> = pts.iter().map(|&(x, y)| Coord { x, y }).collect();
    if let (Some(&first), Some(&last)) = (coords.first(), coords.last()) {
        if first != last {
            coords.push(first);
        }
    }
    let ls = LineString::new(coords);
    let simplified = ls.simplify(&(dp_tolerance.max(0.0) as f64));

    let mut out_pts: Vec<_> = simplified
        .into_inner()
        .into_iter()
        .map(|c| json!({ "x": c.x, "y": c.y }))
        .collect();
    // Quitar duplicado de cierre si quedó.
    if out_pts.len() >= 2 && out_pts.first() == out_pts.last() {
        out_pts.pop();
    }
    if out_pts.len() < 3 {
        return Err("polígono simplificado < 3 puntos".to_string());
    }
    Ok(json!({ "points": out_pts, "closed": true }))
}

// ─── Obb (minAreaRect vía rotating calipers) ─────────────────────────────────

fn mask_to_obb(mask: &GrayImage) -> Result<serde_json::Value, String> {
    let pts = largest_outer_contour(mask).ok_or_else(|| "máscara sin contorno".to_string())?;
    if pts.len() < 3 {
        return Err("obb: contorno < 3 puntos".to_string());
    }

    // Convex hull del contorno usando geo (MultiPoint::convex_hull → Polygon).
    let mp = MultiPoint::from(
        pts.iter()
            .map(|&(x, y)| Point::new(x, y))
            .collect::<Vec<_>>(),
    );
    let hull = mp.convex_hull();
    let hull_coords: Vec<(f64, f64)> = hull
        .exterior()
        .coords()
        .map(|c| (c.x, c.y))
        .collect();
    if hull_coords.len() < 4 {
        // Hull degenerado: fallback a bbox axis-aligned.
        let (x0, y0, x1, y1) = mask_bounds(mask).ok_or_else(|| "obb: máscara vacía".to_string())?;
        let w = (x1 - x0 + 1) as f64;
        let h = (y1 - y0 + 1) as f64;
        return Ok(json!({
            "x": x0 as f64 + w / 2.0,
            "y": y0 as f64 + h / 2.0,
            "width": w,
            "height": h,
            "rotation": 0.0,
        }));
    }

    // Hull cerrado: descartar el último punto duplicado.
    let hull_pts: &[(f64, f64)] = &hull_coords[..hull_coords.len() - 1];

    let (cx, cy, w, h, theta) = min_area_rect(hull_pts);

    Ok(json!({
        "x": cx,
        "y": cy,
        "width": w,
        "height": h,
        "rotation": theta,
    }))
}

/// Rotating calipers sobre puntos de un convex hull (orden CCW o CW indistinto).
/// Devuelve `(cx, cy, width, height, rotation_radians)`.
fn min_area_rect(hull: &[(f64, f64)]) -> (f64, f64, f64, f64, f64) {
    let n = hull.len();
    let mut best_area = f64::INFINITY;
    let mut best = (0.0, 0.0, 0.0, 0.0, 0.0);

    for i in 0..n {
        let (x1, y1) = hull[i];
        let (x2, y2) = hull[(i + 1) % n];
        let dx = x2 - x1;
        let dy = y2 - y1;
        let len = (dx * dx + dy * dy).sqrt();
        if len < 1e-9 {
            continue;
        }
        let ux = dx / len;
        let uy = dy / len;
        // Normal (perpendicular) a la arista.
        let vx = -uy;
        let vy = ux;

        let mut min_u = f64::INFINITY;
        let mut max_u = f64::NEG_INFINITY;
        let mut min_v = f64::INFINITY;
        let mut max_v = f64::NEG_INFINITY;
        for &(px, py) in hull {
            let pu = px * ux + py * uy;
            let pv = px * vx + py * vy;
            if pu < min_u { min_u = pu; }
            if pu > max_u { max_u = pu; }
            if pv < min_v { min_v = pv; }
            if pv > max_v { max_v = pv; }
        }
        let w = max_u - min_u;
        let h = max_v - min_v;
        let area = w * h;
        if area < best_area {
            best_area = area;
            // Centro en (u,v) → de vuelta a (x,y).
            let cu = (min_u + max_u) / 2.0;
            let cv = (min_v + max_v) / 2.0;
            let cx = cu * ux + cv * vx;
            let cy = cu * uy + cv * vy;
            let theta = uy.atan2(ux);
            best = (cx, cy, w, h, theta);
        }
    }

    best
}

// ─── Mask → PNG base64 ───────────────────────────────────────────────────────

fn mask_to_base64png(mask: &GrayImage) -> Result<serde_json::Value, String> {
    let (w, h) = (mask.width(), mask.height());
    let mut rgba = RgbaImage::new(w, h);
    let raw = mask.as_raw();
    for y in 0..h {
        for x in 0..w {
            let v = raw[(y * w + x) as usize];
            if v >= 128 {
                rgba.put_pixel(x, y, Rgba([255, 255, 255, 255]));
            }
            // else: deja transparente (default)
        }
    }
    let mut buf = Cursor::new(Vec::new());
    rgba.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| format!("encode mask PNG: {}", e))?;
    let b64 = STANDARD.encode(buf.into_inner());
    Ok(json!({ "base64png": format!("data:image/png;base64,{}", b64) }))
}
