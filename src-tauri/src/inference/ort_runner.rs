//! Inferencia ONNX nativa usando el crate `ort` (ONNX Runtime).

use ort::session::Session;
use ort::value::Tensor;

/// Resultado de una predicción individual
#[derive(Debug, Clone)]
pub struct Detection {
    pub class_id: usize,
    pub confidence: f64,
    /// Coordenadas normalizadas (0..1)
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Carga un modelo ONNX y devuelve la sesión
pub fn load_model(model_path: &str) -> Result<Session, String> {
    Session::builder()
        .map_err(|e| format!("Error creando session builder: {e}"))?
        .commit_from_file(model_path)
        .map_err(|e| format!("Error cargando modelo ONNX: {e}"))
}

/// Ejecuta inferencia sobre una imagen y devuelve las detecciones
pub fn run_inference(
    session: &mut Session,
    image_path: &str,
    conf_threshold: f64,
    iou_threshold: f64,
    input_size: u32,
    num_classes: usize,
) -> Result<Vec<Detection>, String> {
    // Cargar y preprocesar la imagen
    let img = image::open(image_path)
        .map_err(|e| format!("Error abriendo imagen {image_path}: {e}"))?;
    let resized = img.resize_exact(
        input_size,
        input_size,
        image::imageops::FilterType::Lanczos3,
    );
    let rgb = resized.to_rgb8();

    // Convertir a tensor NCHW float32 normalizado [0,1]
    let isz = input_size as usize;
    let mut data_vec = vec![0.0f32; 1 * 3 * isz * isz];
    for y in 0..isz {
        for x in 0..isz {
            let pixel = rgb.get_pixel(x as u32, y as u32);
            data_vec[0 * 3 * isz * isz + 0 * isz * isz + y * isz + x] = pixel[0] as f32 / 255.0;
            data_vec[0 * 3 * isz * isz + 1 * isz * isz + y * isz + x] = pixel[1] as f32 / 255.0;
            data_vec[0 * 3 * isz * isz + 2 * isz * isz + y * isz + x] = pixel[2] as f32 / 255.0;
        }
    }

    // Crear tensor NCHW
    let input_tensor = Tensor::from_array(([1i64, 3, isz as i64, isz as i64], data_vec))
        .map_err(|e| format!("Error creando tensor de entrada: {e}"))?;

    let outputs = session
        .run(ort::inputs![input_tensor])
        .map_err(|e| format!("Error ejecutando inferencia: {e}"))?;

    // Extraer tensor de salida como flat slice + shape
    let output_value = outputs
        .iter()
        .next()
        .ok_or("Modelo no produjo salida")?
        .1;

    let (shape, data) = output_value
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Error extrayendo tensor: {e}"))?;

    let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();

    // Esperamos 3 dimensiones: [batch, dim1, dim2]
    if dims.len() != 3 {
        return Err(format!("Salida esperada 3D, obtenida {}D: {:?}", dims.len(), dims));
    }

    let (_batch, dim1, dim2) = (dims[0], dims[1], dims[2]);
    // data es flat: data[batch * dim1 * dim2], accedemos desde offset 0 (batch=0)
    let stride_row = dim2;

    // Detectar orientación automáticamente:
    // YOLO output: [batch, 4+classes, anchors] o [batch, anchors, 4+classes]
    // El lado más pequeño (>=5) es features, el más grande es anchors
    let (num_detections, det_len, transposed) = if dim1 < dim2 && dim1 >= 5 {
        // [batch, features, anchors] → transponer
        (dim2, dim1, true)
    } else if dim2 >= 5 {
        // [batch, anchors, features] → sin transponer
        (dim1, dim2, false)
    } else {
        return Err(format!(
            "Formato de salida no soportado: {:?} (se esperan al menos 5 features: 4 bbox + 1 clase)",
            dims
        ));
    };

    // Derivar número real de clases desde la forma del modelo (no del config)
    let actual_num_classes = det_len - 4;

    log::info!(
        "[ORT] output shape: {:?}, transposed={}, num_detections={}, det_len={}, actual_classes={} (config_classes={})",
        dims, transposed, num_detections, det_len, actual_num_classes, num_classes
    );

    if actual_num_classes == 0 {
        return Err("Modelo no tiene clases (det_len <= 4)".to_string());
    }

    // Parsear detecciones
    let mut detections = Vec::new();
    let isz_f = input_size as f64;

    // Detectar si los scores necesitan sigmoid (logits vs probabilidades)
    // Muestreamos algunos valores: si hay alguno > 1.0, son logits
    let needs_sigmoid = {
        let val_fn = |row: usize, col: usize| -> f32 {
            if transposed {
                data[col * stride_row + row]
            } else {
                data[row * stride_row + col]
            }
        };
        let sample_count = num_detections.min(100);
        (0..sample_count).any(|i| {
            (0..actual_num_classes).any(|c| {
                let v = val_fn(i, 4 + c);
                v > 1.0 || v < 0.0
            })
        })
    };

    if needs_sigmoid {
        log::info!("[ORT] Scores son logits crudos, aplicando sigmoid");
    }

    for i in 0..num_detections {
        // Leer valores según orientación
        let val = |row: usize, col: usize| -> f32 {
            if transposed {
                data[col * stride_row + row]
            } else {
                data[row * stride_row + col]
            }
        };

        let cx = val(i, 0) as f64;
        let cy = val(i, 1) as f64;
        let w = val(i, 2) as f64;
        let h = val(i, 3) as f64;

        // Encontrar clase con mayor score
        let mut best_cls = 0;
        let mut best_score: f64 = f64::NEG_INFINITY;
        for c in 0..actual_num_classes {
            let score = val(i, 4 + c) as f64;
            if score > best_score {
                best_score = score;
                best_cls = c;
            }
        }

        // Aplicar sigmoid si es necesario
        if needs_sigmoid {
            best_score = 1.0 / (1.0 + (-best_score).exp());
        }

        if best_score < conf_threshold {
            continue;
        }

        // Convertir de center format a top-left, normalizar a 0..1
        let x1 = ((cx - w / 2.0) / isz_f).max(0.0);
        let y1 = ((cy - h / 2.0) / isz_f).max(0.0);
        let bw = (w / isz_f).min(1.0);
        let bh = (h / isz_f).min(1.0);

        detections.push(Detection {
            class_id: best_cls,
            confidence: best_score,
            x: x1,
            y: y1,
            width: bw,
            height: bh,
        });
    }

    log::info!(
        "[ORT] pre-NMS detections: {} (conf_threshold={})",
        detections.len(), conf_threshold
    );
    if let Some(d) = detections.first() {
        log::info!(
            "[ORT] sample detection: class={} conf={:.3} x={:.4} y={:.4} w={:.4} h={:.4}",
            d.class_id, d.confidence, d.x, d.y, d.width, d.height
        );
    }

    // NMS
    detections = nms(detections, iou_threshold);

    Ok(detections)
}

/// Non-Maximum Suppression
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

/// IoU entre dos bboxes normalizados
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
