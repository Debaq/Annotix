# Documentación interna

Índice de `docs/`. Los documentos se agrupan por propósito.

## Descripción del sistema

Qué es Annotix y cómo está construido. Material de base para la tesis y para el paper.

| Documento | Contenido |
|---|---|
| [antecedentes.md](antecedentes.md) | Descripción completa del sistema en v2.9.10: arquitectura, almacenamiento, tipos de proyecto, todos los subsistemas, distribución y procedencia |
| [estado-v2.9.10.md](estado-v2.9.10.md) | Estado del proyecto: magnitud en cifras, novedades desde v2.4.4, datos corregidos en el README, estado por subsistema |
| [project_types_architecture.md](project_types_architecture.md) | Arquitectura de los tipos de proyecto |

## Subsistemas en detalle

Funcionamiento interno y flujo de trabajo del usuario, subsistema por subsistema.

| Documento | Contenido |
|---|---|
| [subsistema-video.md](subsistema-video.md) | Modelo de datos, extracción de fotogramas, tracks y keyframes, interpolación, consolidación, flujo de usuario y componentes |
| [subsistema-p2p.md](subsistema-p2p.md) | Reconexión y descubrimiento, comandos, alcance del documento replicado, roles y permisos, presencia, seguridad |

## Auditoría técnica

Revisión del 2026-09-10, orientada a la validez de los resultados experimentales.

| Documento | Contenido |
|---|---|
| [auditoria-validez-experimental.md](auditoria-validez-experimental.md) | Imágenes sin anotar como negativos, ausencia de partición por grupo en video, etiquetas OBB sin rotación, clase espuria en clasificación, inferencia sin letterbox |
| [auditoria-reproducibilidad.md](auditoria-reproducibilidad.md) | Barajado no uniforme (con mediciones), semilla no configurable, inestabilidad de la partición, dependencias sin fijar, condiciones de ejecución no registradas |
| [auditoria-robustez.md](auditoria-robustez.md) | Escritura sin sincronización a disco, concurrencia de la caché, runner de entrenamiento, cobertura de pruebas |

## Hojas de ruta

Trabajo planificado o en curso.

| Documento | Contenido |
|---|---|
| [roadmap_sam.md](roadmap_sam.md) | Integración de SAM; pendiente la auto-descarga de modelos |
| [roadmap_inference.md](roadmap_inference.md) | Inferencia ONNX; pendientes lote, FP16, IoBinding, INT8 |
| [roadmap-perf-js-rust.md](roadmap-perf-js-rust.md) | Traslado de procesamiento pesado de JS a Rust |
| [roadmap-lint-cleanup.md](roadmap-lint-cleanup.md) | Limpieza de advertencias de análisis estático |
| [security-roadmap.md](security-roadmap.md) | Vulnerabilidades y su estado |
| [collaboration_sync_plan.md](collaboration_sync_plan.md) | Diseño del motor de fusión y resolución de conflictos (no implementado) |
| [mejoras-ui.md](mejoras-ui.md) | Mejoras de interfaz pendientes |
| [remaining_annotation_types_reference.md](remaining_annotation_types_reference.md) | Tipos de anotación por implementar |

## Referencias de backends

Catálogos de modelos e hiperparámetros por backend.

| Documento | Contenido |
|---|---|
| [training_backends_reference.md](training_backends_reference.md) | Backends de entrenamiento |
| [segmentation_backends_reference.md](segmentation_backends_reference.md) | Backends de segmentación |
| [tabular_ml_backends_reference.md](tabular_ml_backends_reference.md) | Backends tabulares |
| [yolo_hyperparameters_reference.md](yolo_hyperparameters_reference.md) | Hiperparámetros de YOLO |
| [yolo_training_presets.md](yolo_training_presets.md) | Presets de entrenamiento por escenario |

## Operación

| Documento | Contenido |
|---|---|
| [fix_windows.md](fix_windows.md) | Compilación y problemas en Windows |
| [PRUEBAS_P2P.md](PRUEBAS_P2P.md) | Procedimiento de prueba de la colaboración P2P |
| [PAPER_MAKE_MDPI.md](PAPER_MAKE_MDPI.md) | Preparación del manuscrito para MDPI |
