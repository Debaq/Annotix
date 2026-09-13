//! Taxonomía de eventos del modo estudio.
//!
//! Fuente única de verdad: cualquier evento que no esté en [`EVENT_NAMES`] es
//! rechazado por el escritor. El espejo en TypeScript
//! (`src/features/study/events.ts`) y la documentación (`docs/study-mode.md`)
//! se verifican contra esta lista en los tests del módulo.

// ─── Sesión (3.1) ───────────────────────────────────────────────────────────
pub const SESSION_START: &str = "session.start";
pub const SESSION_END: &str = "session.end";

// ─── Ciclo de vida del flujo (3.2) ──────────────────────────────────────────
pub const PROJECT_CREATE: &str = "project.create";
pub const PROJECT_OPEN: &str = "project.open";
pub const DATA_IMPORT_START: &str = "data.import.start";
pub const DATA_IMPORT_END: &str = "data.import.end";
pub const ANNOT_FIRST: &str = "annot.first";
pub const ANNOT_COMPLETE: &str = "annot.complete";
pub const TRAIN_START: &str = "train.start";
pub const TRAIN_EPOCH: &str = "train.epoch";
pub const TRAIN_END: &str = "train.end";
pub const EXPORT_START: &str = "export.start";
pub const EXPORT_END: &str = "export.end";

// ─── Pasos del flujo (3.3) ──────────────────────────────────────────────────
pub const STEP_ENTER: &str = "step.enter";
pub const STEP_EXIT: &str = "step.exit";

// ─── Configuración declarativa (3.4) ────────────────────────────────────────
pub const CONFIG_CHANGE: &str = "config.change";

// ─── Anotación (3.5) ────────────────────────────────────────────────────────
pub const TOOL_SELECT: &str = "tool.select";
pub const ANNOT_COMMIT: &str = "annot.commit";
pub const ANNOT_DELETE: &str = "annot.delete";
pub const ASSIST_PROPOSE: &str = "assist.propose";
pub const VIDEO_KEYFRAME_SET: &str = "video.keyframe.set";
pub const VIDEO_KEYFRAME_REVIEW: &str = "video.keyframe.review";
pub const VIDEO_CONSOLIDATE: &str = "video.consolidate";

// ─── Fricción (3.6) ─────────────────────────────────────────────────────────
pub const IDLE_START: &str = "idle.start";
pub const IDLE_END: &str = "idle.end";
pub const HELP_OPEN: &str = "help.open";
pub const ERROR_SHOWN: &str = "error.shown";

// ─── Red (3.7) ──────────────────────────────────────────────────────────────
pub const NET_REQUEST: &str = "net.request";

// ─── Inferencia (3.8) ───────────────────────────────────────────────────────
pub const INFER_RUN: &str = "infer.run";

/// Todos los eventos válidos. El orden es el de la sección 3 del documento.
pub const EVENT_NAMES: &[&str] = &[
    SESSION_START,
    SESSION_END,
    PROJECT_CREATE,
    PROJECT_OPEN,
    DATA_IMPORT_START,
    DATA_IMPORT_END,
    ANNOT_FIRST,
    ANNOT_COMPLETE,
    TRAIN_START,
    TRAIN_EPOCH,
    TRAIN_END,
    EXPORT_START,
    EXPORT_END,
    STEP_ENTER,
    STEP_EXIT,
    CONFIG_CHANGE,
    TOOL_SELECT,
    ANNOT_COMMIT,
    ANNOT_DELETE,
    ASSIST_PROPOSE,
    VIDEO_KEYFRAME_SET,
    VIDEO_KEYFRAME_REVIEW,
    VIDEO_CONSOLIDATE,
    IDLE_START,
    IDLE_END,
    HELP_OPEN,
    ERROR_SHOWN,
    NET_REQUEST,
    INFER_RUN,
];

/// Identificadores estables de paso del flujo (3.3). No se derivan de rutas de
/// la interfaz ni de nombres de botones: agregar aquí, nunca en línea.
pub const STEP_IDS: &[&str] = &[
    "create_project",
    "import_data",
    "configure_classes",
    "annotate",
    "review_assisted",
    "configure_training",
    "train",
    "evaluate",
    "export",
];

/// Modalidades de anotación (3.2).
pub const MODALITIES: &[&str] = &[
    "image_bbox",
    "image_mask",
    "image_point",
    "video_track",
    "timeseries_event",
    "other",
];

/// Propósitos de tráfico saliente (3.7). `other` existe para que una prueba
/// pueda fallar si algún cliente HTTP queda sin clasificar.
pub const NET_PURPOSES: &[&str] = &[
    "update_check",
    "model_weights",
    "remote_training",
    "collab_p2p",
    "remote_llm",
    "other",
];

/// Modalidad que corresponde a un tipo de proyecto. Espejo de
/// `src/features/study/modality.ts`; si un proyecto mezcla modalidades, la
/// interfaz manda la de la herramienta activa.
pub fn modality_for_project_kind(kind: &str) -> &'static str {
    match kind {
        "bbox" | "obb" => "image_bbox",
        "mask" | "polygon" | "instance-segmentation" => "image_mask",
        "keypoints" | "landmarks" => "image_point",
        "timeseries-classification"
        | "timeseries-forecasting"
        | "anomaly-detection"
        | "timeseries-segmentation"
        | "pattern-recognition"
        | "event-detection"
        | "timeseries-regression"
        | "clustering"
        | "imputation" => "timeseries_event",
        _ => "other",
    }
}

pub fn is_valid_event(name: &str) -> bool {
    EVENT_NAMES.contains(&name)
}

/// Usado por las pruebas de sincronía y por quien instrumente pasos nuevos.
#[allow(dead_code)]
pub fn is_valid_step(step_id: &str) -> bool {
    STEP_IDS.contains(&step_id)
}
