use super::InferenceConfig;

/// Genera el script Python para inferencia con modelo .pt (ultralytics YOLO)
pub fn generate_pt_inference_script(
    model_path: &str,
    image_paths: &[(String, String)], // (image_id, file_path)
    config: &InferenceConfig,
    task: &str,
) -> String {
    let model_path_escaped = model_path.replace('\\', "/");
    let device = format_device(&config.device);
    let input_size = config.input_size.unwrap_or(640);

    // Serializar lista de imágenes como JSON
    let images_json: Vec<String> = image_paths
        .iter()
        .map(|(id, path)| {
            format!(
                "{{\"id\": \"{}\", \"path\": r\"{}\"}}",
                id,
                path.replace('\\', "/")
            )
        })
        .collect();
    let images_list = images_json.join(",\n    ");

    format!(
        r#"#!/usr/bin/env python3
"""
Script de inferencia generado por Annotix
Modelo: {model_path_escaped}
Task: {task}
"""
import sys
import json
import time
import os

def main():
    from ultralytics import YOLO

    model_path = r"{model_path_escaped}"
    model = YOLO(model_path)

    images = [
    {images_list}
    ]

    total = len(images)

    for idx, img_info in enumerate(images):
        image_id = img_info["id"]
        image_path = img_info["path"]

        if not os.path.exists(image_path):
            print(f"ANNOTIX_EVENT:" + json.dumps({{
                "type": "error",
                "imageId": image_id,
                "error": f"Archivo no encontrado: {{image_path}}"
            }}))
            continue

        start_time = time.time()

        try:
            results = model.predict(
                source=image_path,
                conf={conf},
                iou={iou},
                imgsz={imgsz},
                device={device},
                verbose=False,
            )

            predictions = []
            for result in results:
                if result.boxes is not None:
                    boxes = result.boxes
                    for i in range(len(boxes)):
                        cls_id = int(boxes.cls[i].item())
                        cls_name = model.names.get(cls_id, str(cls_id))
                        conf_val = float(boxes.conf[i].item())

                        # Coordenadas normalizadas (xyxy -> xywh normalizado)
                        xyxy = boxes.xyxy[i].cpu().numpy()
                        img_h, img_w = result.orig_shape
                        x = float(xyxy[0]) / img_w
                        y = float(xyxy[1]) / img_h
                        w = float(xyxy[2] - xyxy[0]) / img_w
                        h = float(xyxy[3] - xyxy[1]) / img_h

                        pred_data = {{
                            "x": x,
                            "y": y,
                            "width": w,
                            "height": h,
                        }}

                        # Si hay máscaras (segmentación), incluir puntos del polígono
                        if hasattr(result, 'masks') and result.masks is not None:
                            try:
                                mask_xy = result.masks.xy[i]
                                points = []
                                for pt in mask_xy:
                                    points.append({{
                                        "x": float(pt[0]) / img_w,
                                        "y": float(pt[1]) / img_h,
                                    }})
                                if points:
                                    pred_data["points"] = points
                            except (IndexError, AttributeError):
                                pass

                        predictions.append({{
                            "classId": cls_id,
                            "className": cls_name,
                            "confidence": conf_val,
                            "data": pred_data,
                        }})

            elapsed = (time.time() - start_time) * 1000

            print("ANNOTIX_EVENT:" + json.dumps({{
                "type": "result",
                "imageId": image_id,
                "predictions": predictions,
                "inferenceTimeMs": elapsed,
                "current": idx + 1,
                "total": total,
            }}))
            sys.stdout.flush()

        except Exception as e:
            print("ANNOTIX_EVENT:" + json.dumps({{
                "type": "error",
                "imageId": image_id,
                "error": str(e),
            }}))
            sys.stdout.flush()

    print("ANNOTIX_EVENT:" + json.dumps({{"type": "completed"}}))
    sys.stdout.flush()

if __name__ == "__main__":
    main()
"#,
        model_path_escaped = model_path_escaped,
        task = task,
        images_list = images_list,
        conf = config.confidence_threshold,
        iou = config.iou_threshold,
        imgsz = input_size,
        device = device,
    )
}

/// Genera el script Python para inferencia con modelo ONNX
pub fn generate_onnx_inference_script(
    model_path: &str,
    image_paths: &[(String, String)], // (image_id, file_path)
    config: &InferenceConfig,
    class_names: &[String],
    task: &str,
) -> String {
    let model_path_escaped = model_path.replace('\\', "/");
    let input_size = config.input_size.unwrap_or(640);

    let images_json: Vec<String> = image_paths
        .iter()
        .map(|(id, path)| {
            format!(
                "{{\"id\": \"{}\", \"path\": r\"{}\"}}",
                id,
                path.replace('\\', "/")
            )
        })
        .collect();
    let images_list = images_json.join(",\n    ");

    let class_names_json = serde_json::to_string(class_names).unwrap_or_else(|_| "[]".to_string());

    format!(
        r#"#!/usr/bin/env python3
"""
Script de inferencia ONNX generado por Annotix
Modelo: {model_path_escaped}
Task: {task}
"""
import sys
import json
import time
import os
import numpy as np

def main():
    import onnxruntime as ort

    model_path = r"{model_path_escaped}"
    class_names = {class_names_json}
    conf_threshold = {conf}
    iou_threshold = {iou}
    input_size = {imgsz}

    # Crear sesión ONNX
    providers = ['CUDAExecutionProvider', 'CPUExecutionProvider']
    session = ort.InferenceSession(model_path, providers=providers)

    input_name = session.get_inputs()[0].name
    input_shape = session.get_inputs()[0].shape

    images = [
    {images_list}
    ]

    total = len(images)

    for idx, img_info in enumerate(images):
        image_id = img_info["id"]
        image_path = img_info["path"]

        if not os.path.exists(image_path):
            print("ANNOTIX_EVENT:" + json.dumps({{
                "type": "error",
                "imageId": image_id,
                "error": f"Archivo no encontrado: {{image_path}}"
            }}))
            continue

        start_time = time.time()

        try:
            from PIL import Image

            img = Image.open(image_path).convert("RGB")
            orig_w, orig_h = img.size

            # Preprocesar: resize + normalizar
            img_resized = img.resize((input_size, input_size))
            img_array = np.array(img_resized).astype(np.float32) / 255.0
            img_array = np.transpose(img_array, (2, 0, 1))  # HWC -> CHW
            img_array = np.expand_dims(img_array, axis=0)    # Batch dim

            # Ejecutar inferencia
            outputs = session.run(None, {{input_name: img_array}})

            predictions = parse_yolo_output(
                outputs[0], class_names, conf_threshold, iou_threshold,
                input_size, orig_w, orig_h
            )

            elapsed = (time.time() - start_time) * 1000

            print("ANNOTIX_EVENT:" + json.dumps({{
                "type": "result",
                "imageId": image_id,
                "predictions": predictions,
                "inferenceTimeMs": elapsed,
                "current": idx + 1,
                "total": total,
            }}))
            sys.stdout.flush()

        except Exception as e:
            print("ANNOTIX_EVENT:" + json.dumps({{
                "type": "error",
                "imageId": image_id,
                "error": str(e),
            }}))
            sys.stdout.flush()

    print("ANNOTIX_EVENT:" + json.dumps({{"type": "completed"}}))
    sys.stdout.flush()


def parse_yolo_output(output, class_names, conf_threshold, iou_threshold, input_size, orig_w, orig_h):
    """Parsea la salida YOLO ONNX (formato [1, num_detections, 4+num_classes] o [1, 4+num_classes, num_detections])"""
    predictions = []

    if output.ndim == 3:
        data = output[0]

        # Detectar orientación: si cols > rows, transponer
        if data.shape[0] < data.shape[1] and data.shape[0] == (4 + len(class_names)):
            data = data.T

        num_classes = len(class_names)

        for det in data:
            if len(det) < 4 + num_classes:
                continue

            # Formato: cx, cy, w, h, class_scores...
            cx, cy, w, h = det[:4]
            class_scores = det[4:4 + num_classes]
            cls_id = int(np.argmax(class_scores))
            conf_val = float(class_scores[cls_id])

            if conf_val < conf_threshold:
                continue

            # Convertir de center format a top-left, normalizar
            x1 = (cx - w / 2) / input_size
            y1 = (cy - h / 2) / input_size
            bw = w / input_size
            bh = h / input_size

            cls_name = class_names[cls_id] if cls_id < len(class_names) else str(cls_id)

            predictions.append({{
                "classId": cls_id,
                "className": cls_name,
                "confidence": conf_val,
                "data": {{
                    "x": max(0.0, float(x1)),
                    "y": max(0.0, float(y1)),
                    "width": min(1.0, float(bw)),
                    "height": min(1.0, float(bh)),
                }},
            }})

    # NMS simple
    predictions = nms(predictions, iou_threshold)

    return predictions


def nms(predictions, iou_threshold):
    """Non-Maximum Suppression simple"""
    if not predictions:
        return predictions

    # Ordenar por confianza descendente
    predictions.sort(key=lambda p: p["confidence"], reverse=True)

    keep = []
    for pred in predictions:
        should_keep = True
        for kept in keep:
            if pred["classId"] == kept["classId"]:
                iou = compute_iou(pred["data"], kept["data"])
                if iou > iou_threshold:
                    should_keep = False
                    break
        if should_keep:
            keep.append(pred)

    return keep


def compute_iou(a, b):
    """Calcula IoU entre dos bboxes normalizados"""
    x1 = max(a["x"], b["x"])
    y1 = max(a["y"], b["y"])
    x2 = min(a["x"] + a["width"], b["x"] + b["width"])
    y2 = min(a["y"] + a["height"], b["y"] + b["height"])

    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = a["width"] * a["height"]
    area_b = b["width"] * b["height"]
    union = area_a + area_b - inter

    return inter / union if union > 0 else 0


if __name__ == "__main__":
    main()
"#,
        model_path_escaped = model_path_escaped,
        task = task,
        images_list = images_list,
        class_names_json = class_names_json,
        conf = config.confidence_threshold,
        iou = config.iou_threshold,
        imgsz = input_size,
    )
}

/// Genera script para detectar metadatos del modelo
pub fn generate_detect_metadata_script(model_path: &str) -> String {
    let model_path_escaped = model_path.replace('\\', "/");

    format!(
        r#"#!/usr/bin/env python3
"""Detecta metadatos de un modelo .pt u .onnx"""
import sys
import json
import os

def main():
    model_path = r"{model_path_escaped}"
    ext = os.path.splitext(model_path)[1].lower()
    result = {{"format": ext.lstrip(".")}}

    if ext == ".pt":
        try:
            from ultralytics import YOLO
            model = YOLO(model_path)
            result["task"] = getattr(model, 'task', 'detect') or 'detect'
            result["classNames"] = list(model.names.values()) if hasattr(model, 'names') else []
            # Intentar obtener imgsz
            if hasattr(model, 'overrides') and 'imgsz' in model.overrides:
                imgsz = model.overrides['imgsz']
                if isinstance(imgsz, (list, tuple)):
                    result["inputSize"] = imgsz[0]
                else:
                    result["inputSize"] = imgsz
        except Exception as e:
            result["error"] = str(e)

    elif ext == ".onnx":
        try:
            import onnxruntime as ort
            session = ort.InferenceSession(model_path)
            inp = session.get_inputs()[0]
            result["inputShape"] = list(inp.shape) if inp.shape else []
            if len(inp.shape) >= 3:
                # Intentar extraer tamaño de entrada
                h, w = inp.shape[-2], inp.shape[-1]
                if isinstance(h, int) and isinstance(w, int):
                    result["inputSize"] = max(h, w)

            out = session.get_outputs()[0]
            result["outputShape"] = list(out.shape) if out.shape else []

            # Inferir task y número de clases desde output shape
            if len(out.shape) >= 2:
                last_dim = out.shape[-1] if isinstance(out.shape[-1], int) else 0
                second_dim = out.shape[-2] if len(out.shape) >= 3 and isinstance(out.shape[-2], int) else 0
                num_preds = max(last_dim, second_dim)
                # num_classes = num_preds - 4 (para YOLO detect)
                if num_preds > 4:
                    result["numClasses"] = min(last_dim, second_dim) - 4 if min(last_dim, second_dim) > 4 else num_preds - 4

            # Intentar leer metadatos del modelo ONNX
            try:
                import onnx
                model = onnx.load(model_path)
                for prop in model.metadata_props:
                    if prop.key == "names":
                        try:
                            names = json.loads(prop.value) if prop.value.startswith("{{") else eval(prop.value)
                            if isinstance(names, dict):
                                result["classNames"] = list(names.values())
                            elif isinstance(names, list):
                                result["classNames"] = names
                        except:
                            pass
                    elif prop.key == "task":
                        result["task"] = prop.value
            except ImportError:
                pass

        except Exception as e:
            result["error"] = str(e)

    print("ANNOTIX_EVENT:" + json.dumps(result))
    sys.stdout.flush()

if __name__ == "__main__":
    main()
"#,
        model_path_escaped = model_path_escaped,
    )
}

/// Formatea el dispositivo para Python
fn format_device(device: &str) -> String {
    match device {
        "cpu" => "\"cpu\"".to_string(),
        "mps" => "\"mps\"".to_string(),
        d if d.starts_with("cuda") => format!("\"{}\"", d),
        d => {
            // Intentar como índice numérico
            if d.parse::<u32>().is_ok() {
                format!("\"cuda:{}\"", d)
            } else {
                format!("\"{}\"", d)
            }
        }
    }
}
