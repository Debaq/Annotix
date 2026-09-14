//! Taxonomía del registro de auditoría.
//!
//! Fuente única de verdad: un evento que no esté en [`EVENT_NAMES`] lo rechaza
//! el escritor, y hay un test que falla si el código emite uno sin documentar.
//!
//! Qué entra y qué no: **sólo lo que cambia el ground truth o lo que se puede
//! afirmar sobre él**. Abrir un proyecto, mover el zoom o cambiar de imagen no
//! entran; crear una etiqueta, aceptar una predicción, redefinir las clases o
//! declarar cómo se reparte el corpus, sí. El registro no es telemetría de uso
//! —eso es el modo estudio, y es anónimo—: es la respuesta a «quién cambió qué y
//! cuándo» sobre los datos con los que se entrenó un modelo.

// ─── Cadena ─────────────────────────────────────────────────────────────────
/// Se abre el registro al arrancar la app o al crear el proyecto. Lleva si hubo
/// que descartar una cola a medio escribir de un cierre abrupto.
pub const LOG_OPENED: &str = "log.opened";

// ─── Etiquetas ──────────────────────────────────────────────────────────────
/// Un guardado de anotaciones de una imagen: qué se creó, editó y borró.
pub const ANNOTATIONS_SAVED: &str = "annotations.saved";
/// Predicciones de un modelo convertidas en etiquetas.
pub const PREDICTIONS_ACCEPTED: &str = "predictions.accepted";
/// Predicciones que una persona refutó.
pub const PREDICTIONS_REJECTED: &str = "predictions.rejected";
/// Consolidación de los tracks de un video en etiquetas por fotograma.
pub const VIDEO_CONSOLIDATED: &str = "video.consolidated";
/// Discrepancia entre lecturas resuelta: alguien decidió qué etiqueta queda.
pub const ADJUDICATED: &str = "annotations.adjudicated";

// ─── Definiciones del proyecto ──────────────────────────────────────────────
/// Alta, baja, renombrado o reordenado de clases. Reordenar no es cosmético: el
/// índice de clase es la posición, y un dataset exportado antes y otro después
/// no significan lo mismo.
pub const CLASSES_CHANGED: &str = "classes.changed";
/// Asignación del sujeto de un conjunto de muestras.
pub const SUBJECTS_ASSIGNED: &str = "subjects.assigned";
/// Declaración de la política de partición.
pub const SPLIT_POLICY_CHANGED: &str = "split_policy.changed";

// ─── Entradas y salidas ─────────────────────────────────────────────────────
pub const DATA_IMPORTED: &str = "data.imported";
pub const DATA_EXPORTED: &str = "data.exported";
pub const TRAINING_STARTED: &str = "training.started";
pub const TRAINING_FINISHED: &str = "training.finished";

/// Todos los eventos válidos.
pub const EVENT_NAMES: &[&str] = &[
    LOG_OPENED,
    ANNOTATIONS_SAVED,
    PREDICTIONS_ACCEPTED,
    PREDICTIONS_REJECTED,
    VIDEO_CONSOLIDATED,
    ADJUDICATED,
    CLASSES_CHANGED,
    SUBJECTS_ASSIGNED,
    SPLIT_POLICY_CHANGED,
    DATA_IMPORTED,
    DATA_EXPORTED,
    TRAINING_STARTED,
    TRAINING_FINISHED,
];

pub fn is_valid_event(name: &str) -> bool {
    EVENT_NAMES.contains(&name)
}
