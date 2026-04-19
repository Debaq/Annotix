//! Comandos Tauri para SAM (Segment Anything Model).
//!
//! PR1: stubs. PR2: load_model + encode_image + clear_cache reales.
//!
//! Convención: coords en **píxeles sobre la imagen original**, top-left.
//! Máscaras salen como logits uint8 a 256 de lado largo; frontend upscala
//! al aceptar.

use tauri::{AppHandle, Emitter, State};

use crate::inference::sam::{
    AmgConfig, MaskTarget, SamEncodeInfo, SamMask, SamPrediction, SamPrompts,
};
use crate::inference::sam::amg::{refilter_by_overlap, run_amg};
use crate::inference::sam::conversion::mask_to_annotation;
use crate::inference::sam::decoder::{load_decoder, run_decoder};
use crate::inference::sam::encoder::{load_encoder, run_encoder};
use crate::inference::sam::postprocess::{
    downscale_u8_mask, logits_to_u8, upscale_and_threshold, LOWRES_LONG_SIDE,
};
use crate::inference::sam::preprocess::{preprocess_image, transform_points};
use crate::inference::sam::state::{SamEmbeddingCache, SamSessions, SamState};
use crate::store::sam_models;
use crate::store::AppState;

const AMG_PROGRESS_EVENT: &str = "sam:amg_progress";

/// Carga par encoder+decoder desde el catálogo SAM app-level.
/// Invalida cache y candidates (cambio de modelo).
/// Devuelve `pair_id` usado para invalidaciones posteriores.
#[tauri::command]
pub fn sam_load_model(
    state: State<'_, AppState>,
    sam: State<'_, SamState>,
    encoder_model_id: String,
    decoder_model_id: String,
) -> Result<String, String> {
    let encoder_path = sam_models::get_model_path(&state.data_dir, &encoder_model_id)?;
    let decoder_path = sam_models::get_model_path(&state.data_dir, &decoder_model_id)?;
    let encoder_str = encoder_path
        .to_str()
        .ok_or_else(|| "encoder path no UTF-8".to_string())?;
    let decoder_str = decoder_path
        .to_str()
        .ok_or_else(|| "decoder path no UTF-8".to_string())?;

    let encoder = load_encoder(encoder_str)?;
    let decoder = load_decoder(decoder_str)?;

    let pair_id = format!("{}:{}", encoder_model_id, decoder_model_id);

    {
        let mut sessions = sam.sessions.lock().map_err(|e| e.to_string())?;
        *sessions = Some(SamSessions {
            encoder,
            decoder,
            pair_id: pair_id.clone(),
        });
    }
    // Cambio de modelo → invalidar cache + candidates.
    sam.clear_runtime();

    Ok(pair_id)
}

/// Computa (o reutiliza) el embedding de la imagen dada. Idempotente si la
/// imagen ya está cacheada (mismo `project_id` + `image_id`) y no cambió el
/// modelo.
#[tauri::command]
pub fn sam_encode_image(
    state: State<'_, AppState>,
    sam: State<'_, SamState>,
    project_id: String,
    image_id: String,
) -> Result<SamEncodeInfo, String> {
    // Hit?
    {
        let cache = sam.cache.lock().map_err(|e| e.to_string())?;
        if let Some(c) = cache.as_ref() {
            if c.image_id == image_id && c.project_id == project_id {
                return Ok(SamEncodeInfo {
                    image_id,
                    orig_size: c.orig_size,
                    cached: true,
                });
            }
        }
    }

    let image_path = state.get_image_file_path(&project_id, &image_id)?;
    let bytes = std::fs::read(&image_path)
        .map_err(|e| format!("Error leyendo imagen {:?}: {e}", image_path))?;

    let (tensor, orig_w, orig_h, new_w, new_h) = preprocess_image(&bytes)?;

    let embedding = {
        let mut sessions_guard = sam.sessions.lock().map_err(|e| e.to_string())?;
        let sessions = sessions_guard
            .as_mut()
            .ok_or_else(|| "SAM: modelo no cargado, llamar sam_load_model primero".to_string())?;
        run_encoder(&mut sessions.encoder, tensor)?
    };

    {
        let mut cache = sam.cache.lock().map_err(|e| e.to_string())?;
        *cache = Some(SamEmbeddingCache {
            image_id: image_id.clone(),
            project_id: project_id.clone(),
            orig_size: (orig_w, orig_h),
            input_size: (new_w, new_h),
            embedding,
        });
    }
    // Cambio de imagen invalida candidates viejos.
    if let Ok(mut m) = sam.candidates.lock() {
        m.clear();
    }

    Ok(SamEncodeInfo {
        image_id,
        orig_size: (orig_w, orig_h),
        cached: false,
    })
}

/// Ejecuta el decoder con prompts manuales (puntos + opcional bbox) y devuelve
/// hasta 3 máscaras multimask en logits uint8 a 256 lado largo.
///
/// Requiere `sam_encode_image` previo (usa el embedding cacheado).
#[tauri::command]
pub fn sam_predict(
    sam: State<'_, SamState>,
    prompts: SamPrompts,
) -> Result<SamPrediction, String> {
    // 1. Tomar embedding + sizes del cache.
    let (embedding, orig_size, input_size) = {
        let cache = sam.cache.lock().map_err(|e| e.to_string())?;
        let c = cache
            .as_ref()
            .ok_or_else(|| "SAM: no hay imagen encodeada (llamar sam_encode_image)".to_string())?;
        (c.embedding.clone(), c.orig_size, c.input_size)
    };

    // 2. Construir arrays de prompts en coords ORIGINALES; transformar a SAM input space.
    let mut raw_xy: Vec<f32> = Vec::with_capacity((prompts.points.len() + 3) * 2);
    let mut labels: Vec<f32> = Vec::with_capacity(prompts.points.len() + 3);

    for p in &prompts.points {
        raw_xy.push(p.x);
        raw_xy.push(p.y);
        labels.push(if p.label == 1 { 1.0 } else { 0.0 });
    }
    if let Some(bb) = prompts.bbox {
        // [x1, y1, x2, y2] → 2 puntos con labels 2 (top-left) y 3 (bottom-right).
        raw_xy.push(bb[0]);
        raw_xy.push(bb[1]);
        labels.push(2.0);
        raw_xy.push(bb[2]);
        raw_xy.push(bb[3]);
        labels.push(3.0);
    } else if !labels.is_empty() {
        // Padding point requerido por el export oficial cuando no hay bbox.
        raw_xy.push(0.0);
        raw_xy.push(0.0);
        labels.push(-1.0);
    }

    if labels.is_empty() {
        return Err("SAM: prompts vacíos".to_string());
    }

    let coords_sam = transform_points(&raw_xy, orig_size, input_size);

    // 3. Correr decoder (SAM espera orig_im_size = (h, w); orig_size aquí es (w, h)).
    let run = {
        let mut sessions_guard = sam.sessions.lock().map_err(|e| e.to_string())?;
        let sessions = sessions_guard
            .as_mut()
            .ok_or_else(|| "SAM: modelo no cargado (llamar sam_load_model)".to_string())?;
        run_decoder(
            &mut sessions.decoder,
            &embedding,
            &coords_sam,
            &labels,
            labels.len(),
            (orig_size.1, orig_size.0),
        )?
    };

    // 4. Extraer máscaras: 3 si multimask, 1 si no. Downscale a 256 lado largo.
    let [_b, m, h, w] = run.mask_shape;
    let plane = h * w;
    if run.masks.len() < m * plane {
        return Err(format!(
            "decoder: masks len {} < esperado {}",
            run.masks.len(),
            m * plane
        ));
    }

    let count = if prompts.multimask_output { m.min(3) } else { 1 };
    let mut masks_lowres: Vec<Vec<u8>> = Vec::with_capacity(count);
    let mut scores_out: Vec<f32> = Vec::with_capacity(count);
    let mut lowres_size = (w as u32, h as u32);

    for i in 0..count {
        let slice = &run.masks[i * plane..(i + 1) * plane];
        let u8mask = logits_to_u8(slice);
        let (down, dw, dh) = downscale_u8_mask(&u8mask, w as u32, h as u32, LOWRES_LONG_SIDE)?;
        lowres_size = (dw, dh);
        masks_lowres.push(down);
        scores_out.push(run.scores.get(i).copied().unwrap_or(0.0));
    }

    let best_index = scores_out
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(i, _)| i)
        .unwrap_or(0);

    let prediction = SamPrediction {
        masks_lowres,
        scores: scores_out,
        best_index,
        lowres_size,
        orig_size,
    };

    // Stash para sam_accept_refine — evita reenviar bytes por IPC al aceptar.
    if let Ok(mut r) = sam.refine.lock() {
        *r = Some(prediction.clone());
    }

    Ok(prediction)
}

/// Ejecuta AMG sobre la imagen ya encodeada. Emite `sam:amg_progress`.
/// Guarda el resultado en `SamState.candidates[image_id]` y lo devuelve.
#[tauri::command]
pub fn sam_auto_generate_masks(
    app: AppHandle,
    _state: State<'_, AppState>,
    sam: State<'_, SamState>,
    project_id: String,
    image_id: String,
    config: AmgConfig,
    existing_bboxes: Option<Vec<[f32; 4]>>,
) -> Result<Vec<SamMask>, String> {
    // Validar cache pertenece a esta imagen.
    let (embedding, orig_size, input_size) = {
        let cache = sam.cache.lock().map_err(|e| e.to_string())?;
        let c = cache
            .as_ref()
            .ok_or_else(|| "SAM: no hay imagen encodeada (llamar sam_encode_image)".to_string())?;
        if c.image_id != image_id || c.project_id != project_id {
            return Err(format!(
                "SAM: embedding cacheado no coincide (cache={}:{}, pedido={}:{})",
                c.project_id, c.image_id, project_id, image_id
            ));
        }
        (c.embedding.clone(), c.orig_size, c.input_size)
    };

    let existing = existing_bboxes.unwrap_or_default();
    let app_clone = app.clone();
    let image_id_evt = image_id.clone();
    let progress = move |p: crate::inference::sam::SamAmgProgress| {
        let _ = app_clone.emit(AMG_PROGRESS_EVENT, &p);
        let _ = image_id_evt; // solo para capturar por valor si hiciera falta
    };

    let masks = run_amg(
        &sam.sessions,
        &embedding,
        orig_size,
        input_size,
        &image_id,
        &config,
        &existing,
        &progress,
    )?;

    // Guardar en candidates.
    {
        let mut cand = sam.candidates.lock().map_err(|e| e.to_string())?;
        cand.insert(image_id.clone(), masks.clone());
    }
    Ok(masks)
}

#[tauri::command]
pub fn sam_get_candidates(
    sam: State<'_, SamState>,
    image_id: String,
) -> Result<Vec<SamMask>, String> {
    let candidates = sam.candidates.lock().map_err(|e| e.to_string())?;
    Ok(candidates.get(&image_id).cloned().unwrap_or_default())
}

/// Refiltra candidates ya generados aplicando overlap contra `existing_bboxes`.
/// No re-corre decoder. Actualiza el slot en `SamState.candidates`.
#[tauri::command]
pub fn sam_refilter_candidates(
    sam: State<'_, SamState>,
    image_id: String,
    existing_bboxes: Vec<[f32; 4]>,
    overlap_thresh: f32,
) -> Result<Vec<SamMask>, String> {
    let mut cand = sam.candidates.lock().map_err(|e| e.to_string())?;
    let current = cand.remove(&image_id).unwrap_or_default();
    let filtered = refilter_by_overlap(current, &existing_bboxes, overlap_thresh);
    cand.insert(image_id, filtered.clone());
    Ok(filtered)
}

/// Acepta una máscara candidata: la upscala al tamaño original, la convierte
/// al formato de la herramienta activa y la elimina del cache.
/// Devuelve el JSON listo para `AnnotationEntry.data`.
#[tauri::command]
pub fn sam_accept_mask(
    sam: State<'_, SamState>,
    image_id: String,
    mask_id: String,
    active_multimask_idx: u8,
    target: MaskTarget,
    dp_tolerance: f32,
) -> Result<serde_json::Value, String> {
    if active_multimask_idx >= 3 {
        return Err(format!(
            "sam_accept_mask: active_multimask_idx={} fuera de rango (0..=2)",
            active_multimask_idx
        ));
    }

    // 1. Extraer + remover máscara del slot.
    let (lowres, lowres_size, orig_size) = {
        let mut cand = sam.candidates.lock().map_err(|e| e.to_string())?;
        let list = cand
            .get_mut(&image_id)
            .ok_or_else(|| format!("sam_accept_mask: sin candidates para image_id={}", image_id))?;
        let pos = list
            .iter()
            .position(|m| m.id == mask_id)
            .ok_or_else(|| format!("sam_accept_mask: mask_id={} no encontrado", mask_id))?;
        let mask = list.remove(pos);
        let idx = active_multimask_idx as usize;
        let lr = mask.masks_lowres[idx].clone();
        (lr, mask.lowres_size, mask.orig_size)
    };

    // 2. Upscale + threshold → GrayImage binario al tamaño original.
    let bin = upscale_and_threshold(&lowres, lowres_size, orig_size)?;

    // 3. Convertir según target.
    mask_to_annotation(&bin, target, dp_tolerance)
}

/// Acepta la última predicción del modo refinamiento (`sam_predict`) y la
/// convierte al formato de la herramienta activa. Limpia el stash al finalizar.
#[tauri::command]
pub fn sam_accept_refine(
    sam: State<'_, SamState>,
    active_multimask_idx: u8,
    target: MaskTarget,
    dp_tolerance: f32,
) -> Result<serde_json::Value, String> {
    let prediction = {
        let mut r = sam.refine.lock().map_err(|e| e.to_string())?;
        r.take()
            .ok_or_else(|| "sam_accept_refine: sin predicción previa (llamar sam_predict)".to_string())?
    };

    let idx = active_multimask_idx as usize;
    let lowres = prediction
        .masks_lowres
        .get(idx)
        .ok_or_else(|| format!(
            "sam_accept_refine: idx {} fuera de rango (len={})",
            idx,
            prediction.masks_lowres.len()
        ))?
        .clone();

    let bin = upscale_and_threshold(&lowres, prediction.lowres_size, prediction.orig_size)?;
    mask_to_annotation(&bin, target, dp_tolerance)
}

/// Descarta la predicción del modo refine sin convertir.
#[tauri::command]
pub fn sam_clear_refine(sam: State<'_, SamState>) -> Result<(), String> {
    if let Ok(mut r) = sam.refine.lock() {
        *r = None;
    }
    Ok(())
}

/// Libera cache runtime (embedding + candidatos). Sesiones siguen cargadas.
#[tauri::command]
pub fn sam_clear_cache(sam: State<'_, SamState>) -> Result<(), String> {
    sam.clear_runtime();
    Ok(())
}

// ─── Catálogo app-level (no por proyecto) ───────────────────────────────────

#[tauri::command]
pub fn sam_list_app_models(
    state: State<'_, AppState>,
) -> Result<Vec<sam_models::SamAppModel>, String> {
    sam_models::list_models(&state.data_dir)
}

/// Copia un .onnx al directorio app-level y lo registra.
/// `kind` debe ser "encoder" o "decoder".
#[tauri::command]
pub fn sam_upload_app_model(
    state: State<'_, AppState>,
    src_path: String,
    name: String,
    kind: String,
) -> Result<sam_models::SamAppModel, String> {
    let src = std::path::PathBuf::from(&src_path);
    if !src.exists() {
        return Err(format!("ruta no existe: {}", src_path));
    }
    sam_models::add_model(&state.data_dir, &src, &name, &kind)
}

#[tauri::command]
pub fn sam_delete_app_model(
    state: State<'_, AppState>,
    sam: State<'_, SamState>,
    model_id: String,
) -> Result<(), String> {
    sam_models::delete_model(&state.data_dir, &model_id)?;
    // Si el modelo eliminado estaba cargado, invalidar sesiones.
    if let Ok(sessions) = sam.sessions.lock() {
        if let Some(s) = sessions.as_ref() {
            if s.pair_id.contains(&model_id) {
                drop(sessions);
                sam.clear_all();
            }
        }
    }
    Ok(())
}
