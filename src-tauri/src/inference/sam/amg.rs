//! Automatic Mask Generator (AMG).
//!
//! Genera una grilla `N×N` de puntos-prompt, corre el decoder en cada uno
//! (reutilizando el embedding cacheado), filtra por IoU predicho / stability /
//! área mínima / NMS / overlap con anotaciones existentes, y devuelve
//! `Vec<SamMask>` efímero.
//!
//! Nota PR4: se llama al decoder `N²` veces (batch=1) porque el export ONNX
//! estándar no soporta múltiples grupos de prompts por call. Para acelerar,
//! pasamos `orig_im_size` **escalado a 256 lado largo** al decoder: las
//! máscaras vienen directamente a lowres sin upscale a tamaño original.

use std::sync::Mutex;

use super::decoder::run_decoder;
use super::postprocess::{logits_to_u8, LOWRES_LONG_SIDE};
use super::preprocess::transform_points;
use super::state::SamSessions;
use super::{AmgConfig, SamAmgPhase, SamAmgProgress, SamMask};

/// Callback de progreso que se llamará en cambios de fase / avance de batch.
pub type ProgressCb<'a> = &'a dyn Fn(SamAmgProgress);

/// Resultado intermedio antes del filtrado global (NMS + overlap).
struct Candidate {
    masks_lowres: [Vec<u8>; 3],
    scores: [f32; 3],
    /// BBox en coords ORIGINALES del best-multimask (argmax scores).
    bbox: [f32; 4],
    /// Área del best-multimask en píxeles lowres (para ordenar NMS).
    best_area_lowres: u32,
    /// Índice de la mejor máscara dentro de las 3.
    best_idx: usize,
    /// Score del best para NMS.
    best_score: f32,
}

pub fn run_amg(
    sessions: &Mutex<Option<SamSessions>>,
    embedding: &[f32],
    orig_size: (u32, u32),    // (w, h) originales
    input_size: (u32, u32),   // (w, h) tras resize 1024 (para transform_points)
    image_id: &str,
    config: &AmgConfig,
    existing_bboxes: &[[f32; 4]],
    progress: ProgressCb<'_>,
) -> Result<Vec<SamMask>, String> {
    let n = config.points_per_side.max(1) as usize;
    let total = n * n;

    // Tamaño lowres al que pediremos las máscaras al decoder (256 lado largo).
    let long = orig_size.0.max(orig_size.1) as f32;
    let lowres_scale = LOWRES_LONG_SIDE as f32 / long;
    let lowres_w = ((orig_size.0 as f32 * lowres_scale).round() as u32).max(1);
    let lowres_h = ((orig_size.1 as f32 * lowres_scale).round() as u32).max(1);
    let lowres_plane = (lowres_w * lowres_h) as usize;

    progress(SamAmgProgress {
        phase: SamAmgPhase::DecodingBatch,
        current: 0,
        total,
        image_id: image_id.to_string(),
    });

    // ── 1. Grilla de puntos (centros de celdas, coords ORIGINALES) ──────────
    let mut grid_xy: Vec<(f32, f32)> = Vec::with_capacity(total);
    for j in 0..n {
        for i in 0..n {
            let x = (i as f32 + 0.5) / n as f32 * orig_size.0 as f32;
            let y = (j as f32 + 0.5) / n as f32 * orig_size.1 as f32;
            grid_xy.push((x, y));
        }
    }

    // ── 2. Decoder por punto + filtros per-mask ─────────────────────────────
    let mut candidates: Vec<Candidate> = Vec::new();
    let progress_every = 8usize.max(total / 32);

    for (idx, (gx, gy)) in grid_xy.iter().enumerate() {
        // Armar prompt: 1 punto positivo + padding point (label -1) requerido
        // por el export oficial cuando no hay bbox.
        let raw_xy = [*gx, *gy, 0.0f32, 0.0f32];
        let labels = [1.0f32, -1.0f32];
        let coords_sam = transform_points(&raw_xy, orig_size, input_size);

        let run = {
            let mut guard = sessions.lock().map_err(|e| e.to_string())?;
            let s = guard.as_mut().ok_or_else(|| "SAM: sessions vacío".to_string())?;
            run_decoder(
                &mut s.decoder,
                embedding,
                &coords_sam,
                &labels,
                2,
                (lowres_h, lowres_w), // SAM espera (h, w)
            )?
        };

        // Esperamos masks [1, M, H, W]. M puede ser 3 (multimask) o 1 según export.
        let [_b, m, h_out, w_out] = run.mask_shape;
        if h_out != lowres_h as usize || w_out != lowres_w as usize {
            return Err(format!(
                "decoder devolvió masks {}x{} ≠ lowres esperado {}x{}",
                w_out, h_out, lowres_w, lowres_h
            ));
        }
        let plane = h_out * w_out;
        if plane != lowres_plane {
            return Err("amg: plane mismatch".to_string());
        }
        if m == 0 || run.masks.len() < m * plane {
            continue;
        }

        // Tomamos hasta 3 multimask (o replicamos la única si M=1).
        let mut masks_u8: [Vec<u8>; 3] = [Vec::new(), Vec::new(), Vec::new()];
        let mut scores_arr: [f32; 3] = [0.0; 3];
        let mut stability: [f32; 3] = [0.0; 3];
        let mut areas: [u32; 3] = [0; 3];

        for k in 0..3 {
            let src_idx = k.min(m - 1);
            let slice = &run.masks[src_idx * plane..(src_idx + 1) * plane];
            // Stability sobre logits f32: |{x > +1}| / |{x > -1}|.
            let mut hi = 0u32;
            let mut lo = 0u32;
            let mut area = 0u32;
            for &l in slice {
                if l > -1.0 {
                    lo += 1;
                    if l > 1.0 {
                        hi += 1;
                    }
                }
                if l > 0.0 {
                    area += 1;
                }
            }
            stability[k] = if lo > 0 { hi as f32 / lo as f32 } else { 0.0 };
            areas[k] = area;
            scores_arr[k] = run.scores.get(src_idx).copied().unwrap_or(0.0);
            masks_u8[k] = logits_to_u8(slice);
        }

        // Elegir best multimask aplicando filtros.
        // Criterio: mayor score entre las que pasan (iou, stability, area).
        let mut best: Option<(usize, f32)> = None;
        for k in 0..3 {
            if scores_arr[k] < config.pred_iou_thresh {
                continue;
            }
            if stability[k] < config.stability_score_thresh {
                continue;
            }
            if areas[k] < config.min_mask_region_area {
                continue;
            }
            if best.map_or(true, |(_, s)| scores_arr[k] > s) {
                best = Some((k, scores_arr[k]));
            }
        }
        let Some((best_idx, best_score)) = best else {
            if idx % progress_every == 0 {
                progress(SamAmgProgress {
                    phase: SamAmgPhase::DecodingBatch,
                    current: idx + 1,
                    total,
                    image_id: image_id.to_string(),
                });
            }
            continue;
        };

        // BBox del best sobre la máscara lowres, escalada a coords ORIGINALES.
        let Some(bbox_lowres) = compute_bbox_u8(&masks_u8[best_idx], lowres_w, lowres_h) else {
            continue;
        };
        let bbox = scale_bbox(bbox_lowres, (lowres_w, lowres_h), orig_size);

        candidates.push(Candidate {
            masks_lowres: masks_u8,
            scores: scores_arr,
            bbox,
            best_area_lowres: areas[best_idx],
            best_idx,
            best_score,
        });

        if idx % progress_every == 0 {
            progress(SamAmgProgress {
                phase: SamAmgPhase::DecodingBatch,
                current: idx + 1,
                total,
                image_id: image_id.to_string(),
            });
        }
    }

    // ── 3. NMS sobre bbox del best ──────────────────────────────────────────
    progress(SamAmgProgress {
        phase: SamAmgPhase::Filtering,
        current: 0,
        total: candidates.len(),
        image_id: image_id.to_string(),
    });

    // Orden descendente por score (best multimask).
    candidates.sort_by(|a, b| b.best_score.partial_cmp(&a.best_score).unwrap_or(std::cmp::Ordering::Equal));

    let mut kept_bboxes: Vec<[f32; 4]> = Vec::new();
    let mut kept: Vec<Candidate> = Vec::new();
    for c in candidates {
        let suppress = kept_bboxes
            .iter()
            .any(|kb| bbox_iou(&c.bbox, kb) > config.box_nms_thresh);
        if suppress {
            continue;
        }
        kept_bboxes.push(c.bbox);
        kept.push(c);
    }

    // ── 4. Filtro overlap contra anotaciones existentes ─────────────────────
    let filtered: Vec<Candidate> = if existing_bboxes.is_empty() {
        kept
    } else {
        kept.into_iter()
            .filter(|c| {
                !existing_bboxes
                    .iter()
                    .any(|eb| bbox_iou(&c.bbox, eb) > config.overlap_with_existing_thresh)
            })
            .collect()
    };

    // ── 5. Empaquetar SamMask ────────────────────────────────────────────────
    let mut out: Vec<SamMask> = Vec::with_capacity(filtered.len());
    for c in filtered {
        let id = uuid::Uuid::new_v4().to_string();
        let color_seed = hash_id(&id);
        out.push(SamMask {
            id,
            masks_lowres: c.masks_lowres,
            scores: c.scores,
            bbox: c.bbox,
            orig_size,
            lowres_size: (lowres_w, lowres_h),
            color_seed,
        });
        // "best_idx" / "best_area_lowres" se pierden en SamMask — el frontend
        // recalcula según `activeMaskIdx` global.
        let _ = (c.best_idx, c.best_area_lowres);
    }

    progress(SamAmgProgress {
        phase: SamAmgPhase::Done,
        current: out.len(),
        total,
        image_id: image_id.to_string(),
    });

    Ok(out)
}

/// Refiltrado barato: aplica solo `overlap_with_existing` sobre `SamMask.bbox`.
pub fn refilter_by_overlap(
    candidates: Vec<SamMask>,
    existing_bboxes: &[[f32; 4]],
    overlap_thresh: f32,
) -> Vec<SamMask> {
    if existing_bboxes.is_empty() {
        return candidates;
    }
    candidates
        .into_iter()
        .filter(|c| {
            !existing_bboxes
                .iter()
                .any(|eb| bbox_iou(&c.bbox, eb) > overlap_thresh)
        })
        .collect()
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/// BBox `[x, y, w, h]` sobre píxeles con valor ≥ 128. `None` si máscara vacía.
fn compute_bbox_u8(mask: &[u8], w: u32, h: u32) -> Option<[f32; 4]> {
    let mut xmin = u32::MAX;
    let mut ymin = u32::MAX;
    let mut xmax = 0u32;
    let mut ymax = 0u32;
    let mut any = false;
    for y in 0..h {
        let row = (y as usize) * (w as usize);
        for x in 0..w {
            if mask[row + x as usize] >= 128 {
                any = true;
                if x < xmin {
                    xmin = x;
                }
                if x > xmax {
                    xmax = x;
                }
                if y < ymin {
                    ymin = y;
                }
                if y > ymax {
                    ymax = y;
                }
            }
        }
    }
    if !any {
        return None;
    }
    Some([
        xmin as f32,
        ymin as f32,
        (xmax - xmin + 1) as f32,
        (ymax - ymin + 1) as f32,
    ])
}

/// Escala bbox de `src` a `dst` (ambos en formato `[x, y, w, h]`).
fn scale_bbox(bbox: [f32; 4], src: (u32, u32), dst: (u32, u32)) -> [f32; 4] {
    let sx = dst.0 as f32 / src.0 as f32;
    let sy = dst.1 as f32 / src.1 as f32;
    [bbox[0] * sx, bbox[1] * sy, bbox[2] * sx, bbox[3] * sy]
}

/// IoU entre 2 bboxes `[x, y, w, h]`.
fn bbox_iou(a: &[f32; 4], b: &[f32; 4]) -> f32 {
    let ax1 = a[0];
    let ay1 = a[1];
    let ax2 = a[0] + a[2];
    let ay2 = a[1] + a[3];
    let bx1 = b[0];
    let by1 = b[1];
    let bx2 = b[0] + b[2];
    let by2 = b[1] + b[3];
    let ix1 = ax1.max(bx1);
    let iy1 = ay1.max(by1);
    let ix2 = ax2.min(bx2);
    let iy2 = ay2.min(by2);
    let iw = (ix2 - ix1).max(0.0);
    let ih = (iy2 - iy1).max(0.0);
    let inter = iw * ih;
    let area_a = a[2] * a[3];
    let area_b = b[2] * b[3];
    let union = area_a + area_b - inter;
    if union <= 0.0 {
        0.0
    } else {
        inter / union
    }
}

/// Hash 32-bit estable para `color_seed`.
fn hash_id(id: &str) -> u32 {
    // FNV-1a 32-bit.
    let mut h: u32 = 0x811c9dc5;
    for &b in id.as_bytes() {
        h ^= b as u32;
        h = h.wrapping_mul(0x01000193);
    }
    h
}
