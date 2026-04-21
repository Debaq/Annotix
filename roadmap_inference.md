# Roadmap Inferencia ONNX — Annotix

Optimizaciones de rendimiento para el runner nativo `ort` (modelos `.onnx`)
en `src-tauri/src/inference/`.

---

## Hecho

### Session builder unificado (`ort_runner::new_configured_builder`)
- Graph optimization level `Level3`.
- `intra_threads = num_cpus::get()` explícito.
- Execution providers en orden: TensorRT → CUDA → DirectML → CoreML → CPU
  (fallback automático si el EP no está disponible en runtime).
- Se reutiliza en `ort_runner::load_model`, `sam::encoder::load_encoder`,
  `sam::decoder::load_decoder`.

### Features opt-in para EPs GPU (`Cargo.toml`)
- `--features cuda` / `tensorrt` / `directml` / `coreml`.
- Build por defecto solo registra CPU (distribución sin libs extra).

### Preprocess SIMD (`ort_runner::preprocess_image`)
- `fast_image_resize` (Bilinear) reemplaza `DynamicImage::resize_exact(Lanczos3)`.
- Loop HWC→CHW sobre buffer contiguo (sin `get_pixel`), cache-friendly.

### Pipeline paralelo preprocess ↔ inferencia (`runner::start_onnx_native`)
- Thread productor preprocesa imagen N+1 mientras el consumidor corre
  `session.run` sobre N. Canal bounded=2, respeta `cancel_flag`.

---

## Pendiente

### Batch inference (opcional)
**Requiere**: postprocess refactor + detección de batch dinámico + UI.

Pasos:
1. Inspeccionar `session.inputs()[0].shape[0]` — si es `-1` soporta batch
   dinámico; si es `1` forzar `bs=1` con warning.
2. Acumular `bs` items del productor, construir tensor `[B, 3, H, W]`,
   una sola `session.run`.
3. **Refactor postprocess**: cinco formatos soportados (YoloV5, YoloV8,
   YoloV10, MultiOutput, Classification) actualmente asumen `B=1` en
   `run_inference_prepared`. Cada uno necesita loop sobre batch dim con
   slicing por sample.
4. UI: `batch_size` en `InferenceConfig` + select 1/2/4/8 en
   `InferencePanel` (guardado por modelo o job).

Ganancia esperada:
- CPU: ≈0 o negativa (ORT ya satura cores con `intra_threads`).
- GPU EP: 2-4× throughput cuando la GPU no está saturada con `bs=1`.

Justificación del diferimiento: no compensa la complejidad hasta que
los builds con `--features cuda|directml|coreml` sean de uso regular.

### FP16 export (opcional)
- Flag `half=True` en `model.export(format="onnx")` (ultralytics) —
  ver `training/scripts.rs`.
- Útil con GPU EP (≈2× inferencia). En CPU sin AVX512-FP16 puede empeorar.
- UI: checkbox "FP16 (requiere GPU)" en export del modelo entrenado.

### IoBinding GPU
- Con EP GPU activo, reusar buffers device entre inferencias (evitar copias
  CPU↔GPU por frame).
- Solo aplica cuando `ort::ExecutionProvider` activo es CUDA/DirectML/CoreML.
- Requiere rearmar `run_inference_prepared` para aceptar `IoBinding`.

### Quantización INT8 CPU
- `ort`-side: usar `ort::session::builder::SessionBuilder::with_optimization_level`
  con `Level3` ya aplica fusiones; INT8 real requiere modelo quantizado
  (ultralytics `int8=True` o `onnxruntime.quantization`).
- Ganancia CPU: 2-4× con pérdida mínima de mAP.
- UI: flag en export.

---

## Métricas a capturar (cuando se ataque)
- ms/imagen promedio por job (log ya emitido por imagen; agregar total).
- Desglose preprocess vs `session.run` vs postprocess.
- Comparación CPU baseline vs CPU + graph opt vs GPU EP.
