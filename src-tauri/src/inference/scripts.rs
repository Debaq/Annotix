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

                        # Coordenadas absolutas en píxeles (xyxy -> xywh)
                        xyxy = boxes.xyxy[i].cpu().numpy()
                        img_h, img_w = result.orig_shape
                        x = float(xyxy[0])
                        y = float(xyxy[1])
                        w = float(xyxy[2] - xyxy[0])
                        h = float(xyxy[3] - xyxy[1])

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
                                        "x": float(pt[0]),
                                        "y": float(pt[1]),
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
                h, w = inp.shape[-2], inp.shape[-1]
                if isinstance(h, int) and isinstance(w, int):
                    result["inputSize"] = max(h, w)

            # Analizar todos los outputs
            all_outputs = session.get_outputs()
            result["numOutputs"] = len(all_outputs)

            out = all_outputs[0]
            result["outputShape"] = list(out.shape) if out.shape else []

            # Inferir output format desde la shape
            if len(out.shape) == 2:
                result["outputFormat"] = "classification"
            elif len(out.shape) == 3:
                dims = out.shape
                dim1 = dims[1] if isinstance(dims[1], int) else 0
                dim2 = dims[2] if isinstance(dims[2], int) else 0
                if dim2 == 6 and 10 <= dim1 <= 2000:
                    result["outputFormat"] = "yolov10"
                elif dim1 > 0 and dim2 > 0 and dim1 < dim2 and dim1 >= 5:
                    result["outputFormat"] = "yolov8"
                elif dim1 > 0 and dim2 > 0 and dim1 > dim2 and dim2 >= 6:
                    result["outputFormat"] = "yolov5"
                elif dim1 > 0 and dim2 > 0 and dim1 > dim2 and dim2 >= 5:
                    result["outputFormat"] = "yolov8"

            # Inferir num_classes
            if len(out.shape) >= 2:
                last_dim = out.shape[-1] if isinstance(out.shape[-1], int) else 0
                second_dim = out.shape[-2] if len(out.shape) >= 3 and isinstance(out.shape[-2], int) else 0
                num_preds = max(last_dim, second_dim)
                if num_preds > 4:
                    result["numClasses"] = min(last_dim, second_dim) - 4 if min(last_dim, second_dim) > 4 else num_preds - 4

            # Analizar múltiples outputs
            if len(all_outputs) > 1:
                out1 = all_outputs[1]
                out1_shape = list(out1.shape) if out1.shape else []
                result["output1Shape"] = out1_shape
                # 2do output 4D = prototipos de segmentación
                if len(out1_shape) == 4:
                    result["task"] = "segment"

            # 3+ outputs con boxes/scores separados = multi-output (SSD/EfficientDet/RCNN)
            if len(all_outputs) >= 3:
                has_boxes = any(
                    len(o.shape) >= 2 and (o.shape[-1] == 4 if isinstance(o.shape[-1], int) else False)
                    for o in all_outputs
                )
                if has_boxes:
                    result["outputFormat"] = "multioutput"
                    # Intentar extraer nombres de outputs
                    result["outputNames"] = [o.name for o in all_outputs]

            # Leer metadatos embebidos en el modelo ONNX
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
                    elif prop.key == "stride":
                        result["stride"] = prop.value
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
