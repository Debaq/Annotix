//! Inferencia ONNX nativa usando el crate `ort` (ONNX Runtime).
//!
//! Soporta auto-detección del formato de salida:
//! - YOLOv8/v9/v11/v12: [batch, 4+C(+extra), N] transpuesto, sin objectness
//! - YOLOv5/v6/v7:      [batch, N, 5+C] con objectness
//! - YOLOv10:            [batch, max_det, 6] end-to-end (xyxy, sin NMS)
//! - Clasificación:      [batch, C] scores por clase
//!
//! Tasks soportadas: detect, segment (→polygon), obb, pose, classify

use ort::session::Session;
use ort::value::Tensor;

// ─── Types ──────────────────────────────────────────────────────────────────

/// Resultado de una detección con campos opcionales según task
#[derive(Debug, Clone)]
pub struct Detection {
    pub class_id: usize,
    pub confidence: f64,
    /// Coordenadas normalizadas (0..1), top-left + size
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// OBB: ángulo de rotación en radianes
    pub angle: Option<f64>,
    /// Pose: keypoints [(x_norm, y_norm, confidence), ...]
    pub keypoints: Option<Vec<Keypoint>>,
    /// Segmentación: polygon points [(x_norm, y_norm), ...]
    pub polygon: Option<Vec<(f64, f64)>>,
}

#[derive(Debug, Clone)]
pub struct Keypoint {
    pub x: f64,
    pub y: f64,
    pub confidence: f64,
}

/// Resultado de clasificación
#[derive(Debug, Clone)]
pub struct Classification {
    pub class_id: usize,
    pub confidence: f64,
}

/// Resultado unificado de inferencia
#[derive(Debug, Clone)]
pub enum InferenceResult {
    Detections(Vec<Detection>),
    Classifications(Vec<Classification>),
}

/// Formatos de salida ONNX reconocidos
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum OutputFormat {
    /// YOLOv8/v9/v11/v12: [batch, features, anchors] transpuesto, sin objectness
    YoloV8,
    /// YOLOv5/v6/v7: [batch, anchors, 5+C] con objectness score
    YoloV5,
    /// YOLOv10/YOLO26: [batch, max_det, 6] end-to-end sin NMS
    YoloV10,
    /// Multi-output: tensores separados para boxes, scores, labels
    /// (SSD, EfficientDet, Faster R-CNN, DETR exportados por TF/PyTorch)
    MultiOutput,
    /// Clasificación: [batch, C]
    Classification,
}

impl OutputFormat {
    pub fn from_hint(hint: &str) -> Option<Self> {
        match hint.to_lowercase().replace('-', "").replace('_', "").as_str() {
            "yolov8" | "v8" | "yolov9" | "v9" | "yolov11" | "v11" | "yolov12" | "v12"
            | "yolo8" | "yolo9" | "yolo11" | "yolo12" => Some(Self::YoloV8),
            "yolov5" | "v5" | "yolov6" | "v6" | "yolov7" | "v7"
            | "yolo5" | "yolo6" | "yolo7" => Some(Self::YoloV5),
            // YOLOv10 y YOLO26 end-to-end comparten formato [N, 300, 6]
            "yolov10" | "v10" | "yolo10"
            | "yolov26" | "v26" | "yolo26" => Some(Self::YoloV10),
            // Multi-output: SSD, EfficientDet, Faster R-CNN, etc.
            "ssd" | "efficientdet" | "fasterrcnn" | "rcnn"
            | "retinanet" | "multioutput" | "multi" | "tfod" | "detr" => Some(Self::MultiOutput),
            "classification" | "classify" | "cls" => Some(Self::Classification),
            _ => None,
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::YoloV8 => "YOLOv8+",
            Self::YoloV5 => "YOLOv5/v7",
            Self::YoloV10 => "YOLOv10/YOLO26 (end-to-end)",
            Self::MultiOutput => "Multi-output (SSD/EfficientDet/RCNN)",
            Self::Classification => "Classification",
        }
    }
}

// ─── Model Loading ──────────────────────────────────────────────────────────

pub fn load_model(model_path: &str) -> Result<Session, String> {
    Session::builder()
        .map_err(|e| format!("Error creando session builder: {e}"))?
        .commit_from_file(model_path)
        .map_err(|e| format!("Error cargando modelo ONNX: {e}"))
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/// Ejecuta inferencia sobre una imagen
///
/// - `task`: "detect", "segment", "obb", "pose", "classify"
/// - `format_hint`: override de formato ("yolov5", "yolov8", "yolov10", "classification")
pub fn run_inference(
    session: &mut Session,
    image_path: &str,
    conf_threshold: f64,
    iou_threshold: f64,
    input_size: u32,
    num_classes: usize,
    task: &str,
    format_hint: Option<&str>,
) -> Result<InferenceResult, String> {
    // ── Preprocesar imagen ──────────────────────────────────────────────────
    let img = image::open(image_path)
        .map_err(|e| format!("Error abriendo imagen {image_path}: {e}"))?;
    let resized = img.resize_exact(input_size, input_size, image::imageops::FilterType::Lanczos3);
    let rgb = resized.to_rgb8();

    let isz = input_size as usize;
    let mut input_data = vec![0.0f32; 3 * isz * isz];
    for y in 0..isz {
        for x in 0..isz {
            let pixel = rgb.get_pixel(x as u32, y as u32);
            input_data[y * isz + x] = pixel[0] as f32 / 255.0;
            input_data[isz * isz + y * isz + x] = pixel[1] as f32 / 255.0;
            input_data[2 * isz * isz + y * isz + x] = pixel[2] as f32 / 255.0;
        }
    }

    let input_tensor = Tensor::from_array(([1i64, 3, isz as i64, isz as i64], input_data))
        .map_err(|e| format!("Error creando tensor de entrada: {e}"))?;

    // ── Ejecutar modelo ─────────────────────────────────────────────────────
    let outputs = session
        .run(ort::inputs![input_tensor])
        .map_err(|e| format!("Error ejecutando inferencia: {e}"))?;

    // ── Extraer TODOS los outputs ───────────────────────────────────────────
    let mut all_outputs: Vec<(String, Vec<usize>, Vec<f32>)> = Vec::new();
    for (name, value) in outputs.iter() {
        match value.try_extract_tensor::<f32>() {
            Ok((shape, slice)) => {
                all_outputs.push((
                    name.to_string(),
                    shape.iter().map(|&d| d as usize).collect(),
                    slice.to_vec(),
                ));
            }
            Err(_) => {
                log::warn!("[ORT] Output '{}' no es float32, ignorando", name);
            }
        }
    }

    if all_outputs.is_empty() {
        return Err("Modelo no produjo salidas válidas".to_string());
    }

    log::info!(
        "[ORT] {} output(s): {}",
        all_outputs.len(),
        all_outputs.iter().map(|(n, d, _)| format!("{}={:?}", n, d)).collect::<Vec<_>>().join(", ")
    );

    // ── Determinar formato ──────────────────────────────────────────────────
    let format = if let Some(hint) = format_hint {
        if let Some(fmt) = OutputFormat::from_hint(hint) {
            log::info!("[ORT] Formato forzado: {} (hint='{}')", fmt.label(), hint);
            fmt
        } else {
            log::warn!("[ORT] Hint '{}' no reconocido, auto-detectando", hint);
            detect_output_format_full(&all_outputs, num_classes)?
        }
    } else {
        detect_output_format_full(&all_outputs, num_classes)?
    };

    log::info!("[ORT] format={}, task={}, classes_config={}", format.label(), task, num_classes);

    let dims0 = &all_outputs[0].1;
    let data0 = &all_outputs[0].2;

    // ── Dispatch ────────────────────────────────────────────────────────────
    if task == "classify" || format == OutputFormat::Classification {
        let cls = parse_classification(data0, dims0, conf_threshold)?;
        return Ok(InferenceResult::Classifications(cls));
    }

    // Proto para segmentación (2do output 4D)
    let proto_owned = if all_outputs.len() > 1 && all_outputs[1].1.len() == 4 {
        Some((all_outputs[1].1.clone(), all_outputs[1].2.clone()))
    } else {
        None
    };

    let detections = match format {
        OutputFormat::YoloV8 => parse_yolov8(
            data0, dims0, conf_threshold, iou_threshold, input_size,
            num_classes, task, proto_owned.as_ref(),
        )?,
        OutputFormat::YoloV5 => parse_yolov5(
            data0, dims0, conf_threshold, iou_threshold, input_size,
        )?,
        OutputFormat::YoloV10 => parse_yolov10(
            data0, dims0, conf_threshold, input_size,
        )?,
        OutputFormat::MultiOutput => parse_multi_output(
            &all_outputs, conf_threshold, iou_threshold, input_size,
        )?,
        OutputFormat::Classification => unreachable!(),
    };

    Ok(InferenceResult::Detections(detections))
}

// ─── Format Detection ───────────────────────────────────────────────────────

/// Detecta formato considerando TODOS los outputs del modelo
fn detect_output_format_full(
    all_outputs: &[(String, Vec<usize>, Vec<f32>)],
    num_classes: usize,
) -> Result<OutputFormat, String> {
    let num_outputs = all_outputs.len();
    let dims0 = &all_outputs[0].1;

    // Multi-output: 3+ outputs con tensores separados para boxes/scores/labels
    // Patrón TF Object Detection API: boxes[1,N,4], scores[1,N], classes[1,N], num_det[1]
    // Patrón ONNX Model Zoo: boxes[1,N,4], scores[1,N,C] o similar
    if num_outputs >= 3 {
        let has_boxes = all_outputs.iter().any(|(_, d, _)| {
            (d.len() == 3 && d[2] == 4) || (d.len() == 2 && d[1] == 4)
        });
        let has_scores = all_outputs.iter().any(|(_, d, _)| {
            d.len() == 2 || (d.len() == 3 && d[2] != 4)
        });
        if has_boxes && has_scores {
            log::info!(
                "[ORT] {} outputs con boxes+scores separados → MultiOutput",
                num_outputs
            );
            return Ok(OutputFormat::MultiOutput);
        }
    }

    // Single-output o dual-output (YOLO seg): analizar primer tensor
    match dims0.len() {
        2 => {
            log::info!("[ORT] Output 2D {:?} → clasificación", dims0);
            Ok(OutputFormat::Classification)
        }
        3 => detect_3d_format(dims0[1], dims0[2], num_classes),
        _ => Err(format!(
            "Dimensiones no soportadas: {}D {:?}. Esperado 2D (clasificación) o 3D (detección). \
             Intenta especificar el formato manualmente.",
            dims0.len(), dims0
        )),
    }
}

fn detect_3d_format(dim1: usize, dim2: usize, num_classes: usize) -> Result<OutputFormat, String> {
    // YOLOv10: [batch, max_det, 6] end-to-end
    if dim2 == 6 && dim1 >= 10 && dim1 <= 2000 {
        log::info!("[ORT] [_, {}, 6] → YOLOv10 end-to-end", dim1);
        return Ok(OutputFormat::YoloV10);
    }

    // Con num_classes conocido, match exacto
    if num_classes > 0 {
        let v8_detect = 4 + num_classes;
        let v5_detect = 5 + num_classes;

        // YOLOv8 transpuesto: [_, features, anchors] donde features < anchors
        if dim1 == v8_detect && dim1 < dim2 {
            log::info!("[ORT] [_, {}, {}] match exacto → YOLOv8+ transpuesto", dim1, dim2);
            return Ok(OutputFormat::YoloV8);
        }
        // YOLOv8 con extras (obb=+1, seg=+32, pose=+K*3)
        if dim1 > v8_detect && dim1 < dim2 {
            log::info!("[ORT] [_, {}, {}] → YOLOv8+ transpuesto (con extras: obb/seg/pose)", dim1, dim2);
            return Ok(OutputFormat::YoloV8);
        }
        // YOLOv5: [_, anchors, 5+C]
        if dim2 == v5_detect && dim1 > dim2 {
            log::info!("[ORT] [_, {}, {}] match exacto → YOLOv5 (con objectness)", dim1, dim2);
            return Ok(OutputFormat::YoloV5);
        }
        // YOLOv8 no transpuesto: [_, anchors, 4+C]
        if dim2 == v8_detect && dim1 > dim2 {
            log::info!("[ORT] [_, {}, {}] → YOLOv8+ no transpuesto", dim1, dim2);
            return Ok(OutputFormat::YoloV8);
        }
        // YOLOv8 no transpuesto con extras
        if dim2 > v8_detect && dim1 > dim2 {
            log::info!("[ORT] [_, {}, {}] → YOLOv8+ no transpuesto (con extras)", dim1, dim2);
            return Ok(OutputFormat::YoloV8);
        }
    }

    // Sin num_classes: heurísticas por forma
    if dim1 < dim2 && dim1 >= 5 {
        log::info!("[ORT] [_, {}, {}] (features < anchors) → asumiendo YOLOv8+", dim1, dim2);
        return Ok(OutputFormat::YoloV8);
    }
    if dim1 > dim2 && dim2 >= 5 {
        // Podría ser v5 o v8 no transpuesto; v8 es más común
        log::info!("[ORT] [_, {}, {}] (anchors > features) → asumiendo YOLOv8+ (no transpuesto)", dim1, dim2);
        return Ok(OutputFormat::YoloV8);
    }
    if dim1 == 1 {
        log::info!("[ORT] [_, 1, {}] → clasificación (squeeze)", dim2);
        return Ok(OutputFormat::Classification);
    }

    Err(format!(
        "Formato no reconocido para shape [_, {}, {}]. \
         Especifica el formato manualmente: yolov5, yolov8, yolov10, classification.",
        dim1, dim2
    ))
}

// ─── YOLOv8+ Parser (detect, obb, pose, segment) ───────────────────────────

fn parse_yolov8(
    data: &[f32],
    dims: &[usize],
    conf_threshold: f64,
    iou_threshold: f64,
    input_size: u32,
    num_classes_config: usize,
    task: &str,
    proto: Option<&(Vec<usize>, Vec<f32>)>,
) -> Result<Vec<Detection>, String> {
    let (_batch, dim1, dim2) = (dims[0], dims[1], dims[2]);

    // Orientación: lado más pequeño = features
    let (num_anchors, det_len, transposed) = if dim1 < dim2 {
        (dim2, dim1, true)
    } else {
        (dim1, dim2, false)
    };
    let stride = dim2;

    if det_len < 5 {
        return Err(format!("YOLOv8: features={} < 5 mínimo", det_len));
    }

    // Determinar num_classes según task
    let (num_classes, extra_offset, extra_count) = resolve_v8_layout(
        det_len, num_classes_config, task,
    )?;

    log::info!(
        "[ORT/YOLOv8] task={}, transposed={}, anchors={}, features={}, classes={}, extra={}",
        task, transposed, num_anchors, det_len, num_classes, extra_count
    );

    // Sigmoid detection
    let needs_sigmoid = sample_needs_sigmoid(data, num_anchors, 4, num_classes, stride, transposed);
    if needs_sigmoid {
        log::info!("[ORT/YOLOv8] Scores son logits, aplicando sigmoid");
    }

    let isz = input_size as f64;
    let mut detections = Vec::new();

    for i in 0..num_anchors {
        let val = |col: usize| -> f32 {
            if transposed { data[col * stride + i] } else { data[i * stride + col] }
        };

        // Mejor clase
        let (best_cls, mut best_score) = find_best_class(data, i, 4, num_classes, stride, transposed);
        if needs_sigmoid {
            best_score = sigmoid(best_score);
        }
        if best_score < conf_threshold {
            continue;
        }

        let cx = val(0) as f64;
        let cy = val(1) as f64;
        let w = val(2) as f64;
        let h = val(3) as f64;

        let mut det = Detection {
            class_id: best_cls,
            confidence: best_score,
            x: ((cx - w / 2.0) / isz).max(0.0),
            y: ((cy - h / 2.0) / isz).max(0.0),
            width: (w / isz).min(1.0),
            height: (h / isz).min(1.0),
            angle: None,
            keypoints: None,
            polygon: None,
        };

        // Extras según task
        match task {
            "obb" if extra_count >= 1 => {
                let angle = val(extra_offset as usize) as f64;
                det.angle = Some(angle);
            }
            "pose" if extra_count >= 3 => {
                let num_kpts = extra_count / 3;
                let mut kpts = Vec::with_capacity(num_kpts);
                for k in 0..num_kpts {
                    let kx = val(extra_offset as usize + k * 3) as f64 / isz;
                    let ky = val(extra_offset as usize + k * 3 + 1) as f64 / isz;
                    let kc = val(extra_offset as usize + k * 3 + 2) as f64;
                    kpts.push(Keypoint {
                        x: kx.clamp(0.0, 1.0),
                        y: ky.clamp(0.0, 1.0),
                        confidence: if needs_sigmoid { sigmoid(kc) } else { kc },
                    });
                }
                det.keypoints = Some(kpts);
            }
            "segment" if extra_count == 32 => {
                if let Some((proto_dims, proto_data)) = proto {
                    let coeffs: Vec<f32> = (0..32)
                        .map(|k| val(extra_offset as usize + k))
                        .collect();
                    let polygon = compute_mask_polygon(
                        &coeffs, proto_dims, proto_data,
                        cx, cy, w, h, isz,
                    );
                    if let Some(pts) = polygon {
                        det.polygon = Some(pts);
                    }
                }
            }
            _ => {}
        }

        detections.push(det);
    }

    log::info!("[ORT/YOLOv8] pre-NMS: {}", detections.len());
    let result = nms(detections, iou_threshold);
    log::info!("[ORT/YOLOv8] post-NMS: {}", result.len());
    Ok(result)
}

/// Determina layout de features para YOLOv8 según task
/// Retorna (num_classes, extra_start_offset, extra_count)
fn resolve_v8_layout(
    det_len: usize,
    num_classes_config: usize,
    task: &str,
) -> Result<(usize, usize, usize), String> {
    // Mínimo de slots no-clase según task
    let min_non_class: usize = match task {
        "obb" => 5,        // 4 bbox + 1 angle
        "segment" => 36,   // 4 bbox + 32 mask
        "pose" => 4,       // 4 bbox (extra = K*3 además de clases)
        _ => 4,            // detect/classify: 4 bbox
    };

    if num_classes_config > 0 {
        if 4 + num_classes_config <= det_len {
            let extra = det_len.saturating_sub(4 + num_classes_config);
            return Ok((num_classes_config, 4 + num_classes_config, extra));
        }
        log::warn!(
            "[ORT/YOLOv8] num_classes_config={} no cabe en features={} (task={}). \
             Ignorando config, infiriendo desde shape.",
            num_classes_config, det_len, task
        );
    }

    if det_len <= min_non_class {
        return Err(format!(
            "YOLOv8 task={}: features={} insuficiente (mínimo {}+1)",
            task, det_len, min_non_class
        ));
    }

    // Inferir num_classes desde shape y task
    match task {
        "detect" | "classify" => {
            let nc = det_len - 4;
            Ok((nc, 4 + nc, 0))
        }
        "obb" => {
            // features = 4 + C + 1(angle)
            if det_len < 6 {
                return Err(format!("OBB: features={} < 6 mínimo (4+C+1)", det_len));
            }
            let nc = det_len - 5;
            Ok((nc, 4 + nc, 1))
        }
        "segment" => {
            // features = 4 + C + 32(mask_coeffs)
            if det_len < 37 {
                return Err(format!("Segment: features={} < 37 mínimo (4+C+32)", det_len));
            }
            let nc = det_len - 36;
            Ok((nc, 4 + nc, 32))
        }
        "pose" => {
            // features = 4 + C + K*3, default C=1 (person)
            let nc = 1;
            let extra = det_len - 4 - nc;
            if extra % 3 != 0 {
                return Err(format!(
                    "Pose: features={} no es compatible con 4+1+K*3 (sobrante={}). \
                     Proporciona el número de clases en la configuración.",
                    det_len, extra % 3
                ));
            }
            Ok((nc, 5, extra))
        }
        _ => {
            let nc = det_len - 4;
            Ok((nc, 4 + nc, 0))
        }
    }
}

// ─── YOLOv5 Parser ──────────────────────────────────────────────────────────

fn parse_yolov5(
    data: &[f32],
    dims: &[usize],
    conf_threshold: f64,
    iou_threshold: f64,
    input_size: u32,
) -> Result<Vec<Detection>, String> {
    let (_batch, dim1, dim2) = (dims[0], dims[1], dims[2]);

    let (num_anchors, det_len, transposed) = if dim1 < dim2 && dim1 >= 6 {
        (dim2, dim1, true)
    } else if dim2 >= 6 {
        (dim1, dim2, false)
    } else {
        return Err(format!("YOLOv5: shape [_, {}, {}] necesita >=6 features", dim1, dim2));
    };

    let num_classes = det_len - 5; // 4 coords + 1 objectness
    let stride = dim2;
    let isz = input_size as f64;

    log::info!(
        "[ORT/YOLOv5] transposed={}, anchors={}, features={}, classes={}",
        transposed, num_anchors, det_len, num_classes
    );

    let needs_sigmoid = sample_needs_sigmoid(data, num_anchors, 4, 1, stride, transposed);
    if needs_sigmoid {
        log::info!("[ORT/YOLOv5] Scores son logits, aplicando sigmoid");
    }

    let mut detections = Vec::new();

    for i in 0..num_anchors {
        let val = |col: usize| -> f32 {
            if transposed { data[col * stride + i] } else { data[i * stride + col] }
        };

        let mut obj_score = val(4) as f64;
        if needs_sigmoid {
            obj_score = sigmoid(obj_score);
        }
        if obj_score < conf_threshold {
            continue;
        }

        let (best_cls, mut best_cls_score) = find_best_class(data, i, 5, num_classes, stride, transposed);
        if needs_sigmoid {
            best_cls_score = sigmoid(best_cls_score);
        }

        let final_score = obj_score * best_cls_score;
        if final_score < conf_threshold {
            continue;
        }

        let cx = val(0) as f64;
        let cy = val(1) as f64;
        let w = val(2) as f64;
        let h = val(3) as f64;

        detections.push(Detection {
            class_id: best_cls,
            confidence: final_score,
            x: ((cx - w / 2.0) / isz).max(0.0),
            y: ((cy - h / 2.0) / isz).max(0.0),
            width: (w / isz).min(1.0),
            height: (h / isz).min(1.0),
            angle: None,
            keypoints: None,
            polygon: None,
        });
    }

    log::info!("[ORT/YOLOv5] pre-NMS: {}", detections.len());
    let result = nms(detections, iou_threshold);
    log::info!("[ORT/YOLOv5] post-NMS: {}", result.len());
    Ok(result)
}

// ─── YOLOv10 Parser (end-to-end) ───────────────────────────────────────────

fn parse_yolov10(
    data: &[f32],
    dims: &[usize],
    conf_threshold: f64,
    input_size: u32,
) -> Result<Vec<Detection>, String> {
    let max_det = dims[1];
    let cols = dims[2];

    if cols != 6 {
        return Err(format!("YOLOv10: esperado 6 columnas, obtenido {}", cols));
    }

    let isz = input_size as f64;
    let mut detections = Vec::new();

    for i in 0..max_det {
        let base = i * 6;
        let x1 = data[base] as f64;
        let y1 = data[base + 1] as f64;
        let x2 = data[base + 2] as f64;
        let y2 = data[base + 3] as f64;
        let conf = data[base + 4] as f64;
        let cls_id = data[base + 5] as usize;

        if conf < conf_threshold {
            continue;
        }

        let w = (x2 - x1).max(0.0);
        let h = (y2 - y1).max(0.0);
        if w <= 0.0 || h <= 0.0 {
            continue;
        }

        detections.push(Detection {
            class_id: cls_id,
            confidence: conf,
            x: (x1 / isz).max(0.0),
            y: (y1 / isz).max(0.0),
            width: (w / isz).min(1.0),
            height: (h / isz).min(1.0),
            angle: None,
            keypoints: None,
            polygon: None,
        });
    }

    log::info!("[ORT/YOLOv10] {} detecciones (sin NMS)", detections.len());
    Ok(detections)
}

// ─── Classification Parser ──────────────────────────────────────────────────

fn parse_classification(
    data: &[f32],
    dims: &[usize],
    conf_threshold: f64,
) -> Result<Vec<Classification>, String> {
    let num_classes = match dims.len() {
        2 => dims[1],
        3 if dims[1] == 1 => dims[2],
        3 => dims[2],
        _ => return Err(format!("Clasificación: shape inesperada {:?}", dims)),
    };

    let needs_softmax = data.iter().take(num_classes).any(|&v| v < 0.0 || v > 1.05);

    let scores: Vec<f64> = if needs_softmax {
        log::info!("[ORT/Cls] Aplicando softmax a {} clases", num_classes);
        let max_val = data.iter().take(num_classes).cloned().fold(f32::NEG_INFINITY, f32::max);
        let exp_sum: f64 = data.iter().take(num_classes).map(|&v| ((v - max_val) as f64).exp()).sum();
        data.iter().take(num_classes).map(|&v| ((v - max_val) as f64).exp() / exp_sum).collect()
    } else {
        data.iter().take(num_classes).map(|&v| v as f64).collect()
    };

    let mut results: Vec<Classification> = scores
        .iter()
        .enumerate()
        .filter(|(_, &s)| s >= conf_threshold)
        .map(|(i, &s)| Classification { class_id: i, confidence: s })
        .collect();

    results.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());

    log::info!(
        "[ORT/Cls] {} clases sobre threshold (top: id={} conf={:.3})",
        results.len(),
        results.first().map(|c| c.class_id).unwrap_or(0),
        results.first().map(|c| c.confidence).unwrap_or(0.0),
    );

    Ok(results)
}

// ─── Multi-Output Parser (SSD, EfficientDet, Faster R-CNN, etc.) ────────────

/// Parsea modelos con múltiples tensores de salida separados.
///
/// Patrones soportados:
/// - TF Object Detection API: boxes[1,N,4] + scores[1,N] + classes[1,N] (+num_det[1])
/// - ONNX Model Zoo: boxes[1,N,4] + scores[1,N,C]
/// - PyTorch-style: boxes[N,4] + labels[N] + scores[N]
///
/// Coordenadas pueden ser normalizadas (0..1) o absolutas (en píxeles).
fn parse_multi_output(
    all_outputs: &[(String, Vec<usize>, Vec<f32>)],
    conf_threshold: f64,
    iou_threshold: f64,
    input_size: u32,
) -> Result<Vec<Detection>, String> {
    // Estrategia: identificar tensores por nombre y/o shape
    let mut boxes_data: Option<(&[f32], &[usize])> = None;
    let mut scores_data: Option<(&[f32], &[usize])> = None;
    let mut labels_data: Option<(&[f32], &[usize])> = None;
    let mut num_det_data: Option<&[f32]> = None;

    for (name, dims, data) in all_outputs {
        let name_lower = name.to_lowercase();

        // Boxes: tiene 4 en última dimensión
        if (name_lower.contains("box") || name_lower.contains("bbox"))
            || (boxes_data.is_none() && dims.last() == Some(&4))
        {
            if boxes_data.is_none() {
                boxes_data = Some((data, dims));
                continue;
            }
        }

        // Scores: contiene "score" o "conf" en el nombre
        if name_lower.contains("score") || name_lower.contains("conf") {
            scores_data = Some((data, dims));
            continue;
        }

        // Labels/classes
        if name_lower.contains("label") || name_lower.contains("class") {
            labels_data = Some((data, dims));
            continue;
        }

        // Num detections
        if name_lower.contains("num") || (dims.len() == 1 && dims[0] == 1) {
            num_det_data = Some(data);
            continue;
        }
    }

    // Fallback: asignar por shape si los nombres no matchearon
    if boxes_data.is_none() || scores_data.is_none() {
        let mut assigned = vec![false; all_outputs.len()];

        // Boxes: buscar tensor con última dim = 4
        for (i, (_, dims, data)) in all_outputs.iter().enumerate() {
            if !assigned[i] && dims.last() == Some(&4) && boxes_data.is_none() {
                boxes_data = Some((data, dims));
                assigned[i] = true;
                break;
            }
        }

        // Scores: buscar tensor 2D o 3D que no sea boxes
        for (i, (_, dims, data)) in all_outputs.iter().enumerate() {
            if !assigned[i] && dims.last() != Some(&4) && (dims.len() == 2 || dims.len() == 3) {
                if scores_data.is_none() {
                    scores_data = Some((data, dims));
                    assigned[i] = true;
                } else if labels_data.is_none() && dims.len() <= 2 {
                    labels_data = Some((data, dims));
                    assigned[i] = true;
                }
            }
        }

        // Labels: buscar tensor 1D/2D restante
        for (i, (_, dims, data)) in all_outputs.iter().enumerate() {
            if !assigned[i] && labels_data.is_none() && dims.len() <= 2 {
                labels_data = Some((data, dims));
                assigned[i] = true;
            }
        }
    }

    let (box_data, box_dims) = boxes_data
        .ok_or("MultiOutput: no se encontró tensor de boxes (dim con último eje = 4)")?;

    let (score_data, score_dims) = scores_data
        .ok_or("MultiOutput: no se encontró tensor de scores")?;

    // Determinar número de detecciones
    let num_detections = if let Some(nd) = num_det_data {
        (nd[0] as usize).min(get_num_elements(box_dims) / 4)
    } else {
        get_num_elements(box_dims) / 4
    };

    // Determinar si scores son per-class [N, C] o per-detection [N]
    let scores_per_class = score_dims.last().map(|&d| d > 1).unwrap_or(false)
        && score_dims.len() >= 2;

    let isz = input_size as f64;
    let mut detections = Vec::new();

    log::info!(
        "[ORT/MultiOutput] boxes={:?}, scores={:?}, labels={}, num_det={}, per_class={}",
        box_dims, score_dims,
        labels_data.is_some(), num_detections, scores_per_class
    );

    for i in 0..num_detections {
        let (class_id, confidence);

        if scores_per_class {
            // Scores shape [N, C] o [1, N, C]: encontrar mejor clase
            let num_classes = *score_dims.last().unwrap();
            let offset = i * num_classes;
            let mut best_cls = 0;
            let mut best_score = f64::NEG_INFINITY;
            for c in 0..num_classes {
                let s = score_data.get(offset + c).copied().unwrap_or(0.0) as f64;
                if s > best_score {
                    best_score = s;
                    best_cls = c;
                }
            }
            class_id = best_cls;
            confidence = best_score;
        } else {
            // Scores shape [N] o [1, N]: una confianza por detección
            confidence = score_data.get(i).copied().unwrap_or(0.0) as f64;
            class_id = labels_data
                .and_then(|(data, _)| data.get(i))
                .map(|&v| v as usize)
                .unwrap_or(0);
        }

        if confidence < conf_threshold {
            continue;
        }

        // Extraer coordenadas (4 valores por detección)
        let base = i * 4;
        let c0 = box_data.get(base).copied().unwrap_or(0.0) as f64;
        let c1 = box_data.get(base + 1).copied().unwrap_or(0.0) as f64;
        let c2 = box_data.get(base + 2).copied().unwrap_or(0.0) as f64;
        let c3 = box_data.get(base + 3).copied().unwrap_or(0.0) as f64;

        // Detectar formato de coordenadas:
        // - Si todos los valores <= 1.0: normalizadas (TF style, formato y1,x1,y2,x2)
        // - Si valores > 1.0: absolutas en píxeles (formato x1,y1,x2,y2)
        let (x, y, w, h) = if c0 <= 1.0 && c1 <= 1.0 && c2 <= 1.0 && c3 <= 1.0 {
            // Coordenadas normalizadas: TF Object Detection API usa [y1, x1, y2, x2]
            let (y1, x1, y2, x2) = (c0, c1, c2, c3);
            (x1, y1, (x2 - x1).max(0.0), (y2 - y1).max(0.0))
        } else {
            // Coordenadas absolutas: [x1, y1, x2, y2] en píxeles
            let (x1, y1, x2, y2) = (c0, c1, c2, c3);
            (
                (x1 / isz).max(0.0),
                (y1 / isz).max(0.0),
                ((x2 - x1) / isz).min(1.0).max(0.0),
                ((y2 - y1) / isz).min(1.0).max(0.0),
            )
        };

        if w <= 0.0 || h <= 0.0 {
            continue;
        }

        detections.push(Detection {
            class_id,
            confidence,
            x, y, width: w, height: h,
            angle: None, keypoints: None, polygon: None,
        });
    }

    log::info!("[ORT/MultiOutput] pre-NMS: {}", detections.len());
    let result = nms(detections, iou_threshold);
    log::info!("[ORT/MultiOutput] post-NMS: {}", result.len());
    Ok(result)
}

/// Cuenta elementos totales de un tensor
fn get_num_elements(dims: &[usize]) -> usize {
    dims.iter().product::<usize>().max(1)
}

// ─── Segmentation Mask → Polygon ────────────────────────────────────────────

/// Computa polígono desde mask coefficients + prototypes
fn compute_mask_polygon(
    coeffs: &[f32],
    proto_dims: &[usize],
    proto_data: &[f32],
    cx: f64, cy: f64, bw: f64, bh: f64,
    input_size: f64,
) -> Option<Vec<(f64, f64)>> {
    // proto_dims: [1, 32, mask_h, mask_w]
    if proto_dims.len() != 4 || proto_dims[1] != 32 {
        return None;
    }
    let (mask_h, mask_w) = (proto_dims[2], proto_dims[3]);
    let mask_channels = 32;

    // Bbox en coordenadas del mask
    let scale_x = mask_w as f64 / input_size;
    let scale_y = mask_h as f64 / input_size;
    let x1 = ((cx - bw / 2.0) * scale_x).max(0.0) as usize;
    let y1 = ((cy - bh / 2.0) * scale_y).max(0.0) as usize;
    let x2 = ((cx + bw / 2.0) * scale_x).min(mask_w as f64) as usize;
    let y2 = ((cy + bh / 2.0) * scale_y).min(mask_h as f64) as usize;

    let crop_w = x2.saturating_sub(x1);
    let crop_h = y2.saturating_sub(y1);
    if crop_w < 2 || crop_h < 2 {
        return None;
    }

    // Compute mask: para cada pixel en el crop, mask = sigmoid(sum(coeff[k] * proto[k][y][x]))
    let mut binary_mask = vec![false; crop_h * crop_w];
    for dy in 0..crop_h {
        let py = y1 + dy;
        for dx in 0..crop_w {
            let px = x1 + dx;
            let mut sum = 0.0f32;
            for k in 0..mask_channels {
                // proto layout: [1, 32, H, W] → offset = k*H*W + py*W + px
                sum += coeffs[k] * proto_data[k * mask_h * mask_w + py * mask_w + px];
            }
            let prob = 1.0 / (1.0 + (-sum as f64).exp());
            binary_mask[dy * crop_w + dx] = prob > 0.5;
        }
    }

    // Trazar contorno
    let contour = trace_contour(&binary_mask, crop_w, crop_h);
    if contour.len() < 3 {
        return None;
    }

    // Convertir a coordenadas normalizadas (0..1 respecto a la imagen original)
    let points: Vec<(f64, f64)> = contour
        .iter()
        .map(|&(px, py)| {
            let abs_x = (x1 + px) as f64 / scale_x;
            let abs_y = (y1 + py) as f64 / scale_y;
            (abs_x / input_size, abs_y / input_size)
        })
        .collect();

    // Simplificar polígono (epsilon relativo al tamaño del bbox)
    let epsilon = 0.002; // ~0.2% de la imagen
    let simplified = simplify_polygon(&points, epsilon);

    if simplified.len() >= 3 {
        Some(simplified)
    } else {
        Some(points)
    }
}

/// Moore boundary tracing para extraer contorno de una máscara binaria
fn trace_contour(mask: &[bool], width: usize, height: usize) -> Vec<(usize, usize)> {
    // Encontrar primer pixel no-zero (scan izq→der, arriba→abajo)
    let mut start = None;
    for y in 0..height {
        for x in 0..width {
            if mask[y * width + x] {
                start = Some((x, y));
                break;
            }
        }
        if start.is_some() {
            break;
        }
    }

    let (sx, sy) = match start {
        Some(s) => s,
        None => return vec![],
    };

    // 8 direcciones: 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
    const DIRS: [(i32, i32); 8] = [
        (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0), (-1, -1), (0, -1), (1, -1),
    ];

    let is_set = |x: i32, y: i32| -> bool {
        x >= 0 && y >= 0 && (x as usize) < width && (y as usize) < height
            && mask[y as usize * width + x as usize]
    };

    let mut contour = vec![(sx, sy)];
    let mut cx = sx as i32;
    let mut cy = sy as i32;
    let mut dir: usize = 6; // empezar buscando desde arriba (vinimos del oeste)
    let max_iter = width * height * 2;

    for _ in 0..max_iter {
        let start_dir = (dir + 5) % 8; // retroceder 3 posiciones
        let mut found = false;

        for step in 0..8 {
            let d = (start_dir + step) % 8;
            let nx = cx + DIRS[d].0;
            let ny = cy + DIRS[d].1;

            if is_set(nx, ny) {
                cx = nx;
                cy = ny;
                dir = d;

                if cx == sx as i32 && cy == sy as i32 {
                    return contour;
                }
                contour.push((cx as usize, cy as usize));
                found = true;
                break;
            }
        }

        if !found {
            break;
        }
    }

    contour
}

/// Simplificación Douglas-Peucker
fn simplify_polygon(points: &[(f64, f64)], epsilon: f64) -> Vec<(f64, f64)> {
    if points.len() <= 2 {
        return points.to_vec();
    }

    let first = points[0];
    let last = *points.last().unwrap();

    let mut max_dist = 0.0;
    let mut max_idx = 0;

    for (i, p) in points.iter().enumerate().skip(1).take(points.len() - 2) {
        let d = point_line_distance(*p, first, last);
        if d > max_dist {
            max_dist = d;
            max_idx = i;
        }
    }

    if max_dist > epsilon {
        let left = simplify_polygon(&points[..=max_idx], epsilon);
        let right = simplify_polygon(&points[max_idx..], epsilon);
        let mut result = left;
        result.pop(); // evitar duplicar punto del medio
        result.extend_from_slice(&right);
        result
    } else {
        vec![first, last]
    }
}

fn point_line_distance(p: (f64, f64), a: (f64, f64), b: (f64, f64)) -> f64 {
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len_sq = dx * dx + dy * dy;
    if len_sq < 1e-12 {
        return ((p.0 - a.0).powi(2) + (p.1 - a.1).powi(2)).sqrt();
    }
    ((dy * p.0 - dx * p.1 + b.0 * a.1 - b.1 * a.0).abs()) / len_sq.sqrt()
}

// ─── Common Utilities ───────────────────────────────────────────────────────

fn find_best_class(
    data: &[f32], det_idx: usize, class_offset: usize, num_classes: usize,
    stride: usize, transposed: bool,
) -> (usize, f64) {
    let mut best_cls = 0;
    let mut best_score = f64::NEG_INFINITY;
    for c in 0..num_classes {
        let col = class_offset + c;
        let idx = if transposed { col * stride + det_idx } else { det_idx * stride + col };
        if idx >= data.len() {
            break;
        }
        let v = data[idx] as f64;
        if v > best_score {
            best_score = v;
            best_cls = c;
        }
    }
    (best_cls, best_score)
}

fn sample_needs_sigmoid(
    data: &[f32], num_det: usize, offset: usize, count: usize,
    stride: usize, transposed: bool,
) -> bool {
    let n = num_det.min(100);
    for i in 0..n {
        for c in 0..count {
            let col = offset + c;
            let idx = if transposed { col * stride + i } else { i * stride + col };
            if idx >= data.len() {
                return false;
            }
            let v = data[idx];
            if v > 1.0 || v < 0.0 {
                return true;
            }
        }
    }
    false
}

fn sigmoid(x: f64) -> f64 {
    1.0 / (1.0 + (-x).exp())
}

fn nms(mut detections: Vec<Detection>, iou_threshold: f64) -> Vec<Detection> {
    detections.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());
    let mut keep = Vec::new();
    for det in &detections {
        let dominated = keep.iter().any(|kept: &Detection| {
            kept.class_id == det.class_id && compute_iou(det, kept) > iou_threshold
        });
        if !dominated {
            keep.push(det.clone());
        }
    }
    keep
}

fn compute_iou(a: &Detection, b: &Detection) -> f64 {
    let x1 = a.x.max(b.x);
    let y1 = a.y.max(b.y);
    let x2 = (a.x + a.width).min(b.x + b.width);
    let y2 = (a.y + a.height).min(b.y + b.height);
    let inter = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let area_a = a.width * a.height;
    let area_b = b.width * b.height;
    let union = area_a + area_b - inter;
    if union > 0.0 { inter / union } else { 0.0 }
}
