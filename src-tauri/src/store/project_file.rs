use serde::{Deserialize, Serialize};

/// Versión del formato de `project.json`.
///
/// - 1: formato inicial.
/// - 2: las anotaciones producidas por la consolidación de tracks de video se
///   guardan en píxeles (antes se escribían en porcentaje 0-100, la unidad en
///   la que viven los keyframes) y llevan `trackId` + `source: "track"`.
///   La migración vive en `io::migrate_project`.
/// - 3: los datos de las series temporales se guardan en
///   `timeseries/{id}.json` en vez de dentro de `project.json`.
/// - 4: las muestras pueden declarar a qué sujeto pertenecen (`subjectId`). El
///   campo es opcional y los proyectos anteriores se leen con `None`, así que la
///   migración sólo sube el número de versión: no hay datos que reescribir.
pub const CURRENT_VERSION: u32 = 4;

// ─── ProjectFile: todo el contenido de project.json ─────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectFile {
    pub version: u32,
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub project_type: String,
    pub classes: Vec<ClassDef>,
    pub created: f64,
    pub updated: f64,
    #[serde(default)]
    pub images: Vec<ImageEntry>,
    #[serde(default)]
    pub timeseries: Vec<TimeSeriesEntry>,
    #[serde(default)]
    pub videos: Vec<VideoEntry>,
    #[serde(default)]
    pub training_jobs: Vec<TrainingJobEntry>,
    #[serde(default)]
    pub tabular_data: Vec<TabularDataEntry>,
    #[serde(default)]
    pub audio: Vec<AudioEntry>,
    #[serde(default)]
    pub p2p: Option<P2pProjectConfig>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "p2pDownload"
    )]
    pub p2p_download: Option<P2pDownloadStatus>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub inference_models: Vec<InferenceModelEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tts_sentences: Vec<TtsSentence>,
    /// Formato de imágenes para uploads/frames nuevos: "jpg" | "webp"
    #[serde(default = "default_image_format", rename = "imageFormat")]
    pub image_format: String,
    /// Preset de calidad WebP: "lossless" | "max" | "high" | "balanced" | "fast"
    #[serde(default = "default_webp_preset", rename = "webpQualityPreset")]
    pub webp_quality_preset: String,
}

fn default_image_format() -> String {
    "jpg".to_string()
}
fn default_webp_preset() -> String {
    "high".to_string()
}

/// Estado de descarga P2P pendiente (imágenes por descargar)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct P2pDownloadStatus {
    pub total_images: usize,
    pub downloaded_images: usize,
}

// ─── P2P ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct P2pProjectConfig {
    /// "host" o "collaborator"
    pub role: String,
    /// Nombre de display para re-join
    pub display_name: String,
    /// ID del documento iroh (hex) para re-abrir al reiniciar
    pub namespace_id: String,
    /// Reglas de sesión serializadas
    pub rules: serde_json::Value,
    /// Secreto del host (solo presente para rol host)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_secret: Option<String>,
}

// ─── Clases ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassDef {
    pub id: i64,
    pub name: String,
    pub color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

// ─── Imágenes ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageEntry {
    pub id: String,
    pub name: String,
    pub file: String,
    pub width: u32,
    pub height: u32,
    pub uploaded: f64,
    pub annotated: Option<f64>,
    pub status: String,
    #[serde(default)]
    pub annotations: Vec<AnnotationEntry>,
    /// Sujeto al que pertenece la muestra: paciente, animal, cultivo, lámina.
    ///
    /// Es opcional y un proyecto generalista nunca lo ve. Cuando está, el reparto
    /// train/val/test agrupa por él (ver `training::dataset::group_key`), que es
    /// lo que evita que dos cortes del mismo paciente caigan en particiones
    /// distintas y la métrica mida memoria en vez de generalización.
    ///
    /// Guarda lo que el usuario cargue. Si viene de un identificador clínico real,
    /// seudonimizarlo es responsabilidad de quien lo carga: este campo se exporta
    /// y viaja con el proyecto.
    #[serde(default, rename = "subjectId", skip_serializing_if = "Option::is_none")]
    pub subject_id: Option<String>,
    #[serde(default, rename = "videoId")]
    pub video_id: Option<String>,
    #[serde(default, rename = "frameIndex")]
    pub frame_index: Option<i64>,
    /// Marcada a mano como fondo: una imagen donde de verdad no hay ningún
    /// objeto. Sin esto una imagen sin anotaciones es indistinguible de una que
    /// nadie ha anotado todavía, y el entrenamiento las descarta todas.
    #[serde(default, rename = "isBackground", skip_serializing_if = "is_false")]
    pub is_background: bool,
    #[serde(default, rename = "lockedBy")]
    pub locked_by: Option<String>,
    #[serde(default, rename = "lockExpires")]
    pub lock_expires: Option<f64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "downloadStatus"
    )]
    pub download_status: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub predictions: Vec<PredictionEntry>,
}

fn is_false(v: &bool) -> bool {
    !*v
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnnotationEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub annotation_type: String,
    #[serde(rename = "classId")]
    pub class_id: i64,
    pub data: serde_json::Value,
    /// "user" (default) o "ai"
    #[serde(default = "default_source")]
    pub source: String,
    /// Confianza del modelo (solo para source="ai")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f64>,
    /// Nombre de clase del modelo (solo para source="ai")
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        rename = "modelClassName"
    )]
    pub model_class_name: Option<String>,
    /// Nombre del peer que creó la anotación (solo en sesiones P2P)
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "createdBy")]
    pub created_by: Option<String>,
    /// Track de video del que salió la anotación (solo para source="track").
    /// Permite reconsolidar reemplazando solo lo interpolado y conservando lo
    /// anotado a mano o por inferencia sobre el mismo fotograma.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "trackId")]
    pub track_id: Option<String>,
}

fn default_source() -> String {
    "user".to_string()
}

// ─── TimeSeries ─────────────────────────────────────────────────────────────

/// Metadatos de una serie temporal. Los datos (los arrays de marcas de tiempo y
/// valores) viven en `timeseries/{id}.json` dentro del proyecto, no aquí: una
/// serie de medio millón de puntos dentro de `project.json` obliga a
/// reserializar el archivo entero cada vez que se coloca una anotación.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSeriesEntry {
    pub id: String,
    pub name: String,
    /// Sujeto al que pertenece la muestra. Ver `ImageEntry::subject_id`.
    #[serde(default, rename = "subjectId", skip_serializing_if = "Option::is_none")]
    pub subject_id: Option<String>,

    /// Solo presente en proyectos anteriores a la versión 3 del formato; la
    /// migración la vacía al escribir los datos a su archivo.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    /// Número de puntos de la serie, para poder listarla sin abrir sus datos.
    #[serde(default, rename = "pointCount")]
    pub point_count: usize,
    /// Número de variables (1 = univariante).
    #[serde(default = "default_series_count", rename = "seriesCount")]
    pub series_count: usize,
    /// Nombres de las columnas de valor (multivariante).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub columns: Option<Vec<String>>,
    #[serde(default)]
    pub annotations: Vec<TsAnnotationEntry>,
    pub uploaded: f64,
    pub annotated: Option<f64>,
    pub status: String,
}

fn default_series_count() -> usize {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TsAnnotationEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub annotation_type: String,
    #[serde(rename = "classId")]
    pub class_id: Option<i64>,
    pub data: serde_json::Value,
}

// ─── Videos ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoEntry {
    pub id: String,
    pub name: String,
    pub file: String,
    /// Sujeto al que pertenece la muestra. Ver `ImageEntry::subject_id`.
    #[serde(default, rename = "subjectId", skip_serializing_if = "Option::is_none")]
    pub subject_id: Option<String>,
    #[serde(rename = "fpsExtraction")]
    pub fps_extraction: f64,
    #[serde(rename = "fpsOriginal")]
    pub fps_original: Option<f64>,
    #[serde(rename = "totalFrames")]
    pub total_frames: i64,
    #[serde(rename = "durationMs")]
    pub duration_ms: i64,
    pub width: i64,
    pub height: i64,
    pub uploaded: f64,
    pub status: String,
    #[serde(default)]
    pub tracks: Vec<TrackEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackEntry {
    pub id: String,
    #[serde(rename = "classId")]
    pub class_id: i64,
    pub label: Option<String>,
    pub enabled: bool,
    /// Cómo se rellenan los fotogramas entre dos keyframes: `linear`, `ease`
    /// (arranque y frenada suaves) o `smooth` (spline sobre los keyframes
    /// vecinos). Texto y no enum: un `project.json` editado a mano con un valor
    /// desconocido cae a `linear` en vez de romper la lectura del proyecto.
    #[serde(default = "default_interpolation")]
    pub interpolation: String,
    /// Qué pasa fuera del rango de keyframes: `none` (nada), `after` (la última
    /// caja sigue hasta el final del video) o `both` (también la primera hacia
    /// atrás). Los tracks nuevos nacen en `after`; los proyectos anteriores a
    /// este campo se leen como `none`, que es lo que hacían.
    #[serde(default = "default_extend")]
    pub extend: String,
    #[serde(default)]
    pub keyframes: Vec<KeyframeEntry>,
}

fn default_interpolation() -> String {
    "linear".to_string()
}

fn default_extend() -> String {
    "none".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyframeEntry {
    #[serde(rename = "frameIndex")]
    pub frame_index: i64,
    #[serde(rename = "bboxX")]
    pub bbox_x: f64,
    #[serde(rename = "bboxY")]
    pub bbox_y: f64,
    #[serde(rename = "bboxWidth")]
    pub bbox_width: f64,
    #[serde(rename = "bboxHeight")]
    pub bbox_height: f64,
    #[serde(rename = "isKeyframe")]
    pub is_keyframe: bool,
    pub enabled: bool,
}

// ─── Audio (ASR) ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioEntry {
    pub id: String,
    pub name: String,
    pub file: String,
    pub duration_ms: i64,
    pub sample_rate: i32,
    #[serde(default)]
    pub transcription: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker_id: Option<String>,
    #[serde(default = "default_audio_language")]
    pub language: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub segments: Vec<AudioSegment>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub class_id: Option<i64>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub events: Vec<AudioEvent>,
    pub uploaded: f64,
    pub annotated: Option<f64>,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioSegment {
    pub id: String,
    pub start_ms: i64,
    pub end_ms: i64,
    #[serde(default)]
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub speaker_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioEvent {
    pub id: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub class_id: i64,
}

fn default_audio_language() -> String {
    "en".to_string()
}

// ─── TTS Guided Recording ──────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsSentence {
    pub id: String,
    pub text: String,
    /// "pending" | "recorded" | "skipped"
    pub status: String,
    /// ID del AudioEntry vinculado cuando se graba
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_id: Option<String>,
}

// ─── Tabular Data ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabularDataEntry {
    pub id: String,
    pub name: String,
    pub file: String,
    /// Sujeto al que pertenece la muestra. Ver `ImageEntry::subject_id`.
    #[serde(default, rename = "subjectId", skip_serializing_if = "Option::is_none")]
    pub subject_id: Option<String>,
    pub uploaded: f64,
    pub rows: usize,
    pub columns: Vec<TabularColumnInfo>,
    #[serde(default, rename = "targetColumn")]
    pub target_column: Option<String>,
    #[serde(default, rename = "featureColumns")]
    pub feature_columns: Vec<String>,
    #[serde(default, rename = "taskType")]
    pub task_type: Option<String>, // "classification" | "regression" | null (auto)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TabularColumnInfo {
    pub name: String,
    #[serde(rename = "dtype")]
    pub dtype: String, // "numeric" | "categorical" | "text" | "datetime"
    #[serde(rename = "uniqueCount")]
    pub unique_count: usize,
    #[serde(rename = "nullCount")]
    pub null_count: usize,
    #[serde(default)]
    pub sample_values: Vec<String>,
}

// ─── Training Jobs ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrainingJobEntry {
    pub id: String,
    pub status: String,
    pub config: serde_json::Value,
    pub progress: f64,
    #[serde(default)]
    pub logs: Vec<String>,
    pub metrics: Option<serde_json::Value>,
    /// Métricas sobre el split de test, si el entrenamiento lo evaluó.
    #[serde(
        default,
        rename = "testMetrics",
        skip_serializing_if = "Option::is_none"
    )]
    pub test_metrics: Option<serde_json::Value>,
    /// Historial por epoch (persistente): `{epoch, metrics, ts}`. Se append-ea en
    /// cada evento `on_fit_epoch_end` para no perder la curva si el proceso
    /// crashea o se cierra la app antes del `completed`.
    #[serde(default, rename = "metricsHistory")]
    pub metrics_history: Vec<serde_json::Value>,
    #[serde(rename = "createdAt")]
    pub created_at: f64,
    #[serde(rename = "updatedAt")]
    pub updated_at: f64,
    #[serde(default, rename = "resultDir")]
    pub result_dir: Option<String>,
    #[serde(default, rename = "bestModelPath")]
    pub best_model_path: Option<String>,
    #[serde(default, rename = "datasetDir")]
    pub dataset_dir: Option<String>,
    #[serde(default, rename = "cloudProvider")]
    pub cloud_provider: Option<String>,
    #[serde(default, rename = "cloudJobId")]
    pub cloud_job_id: Option<String>,
    #[serde(default, rename = "cloudJobUrl")]
    pub cloud_job_url: Option<String>,
    #[serde(default, rename = "modelDownloadUrl")]
    pub model_download_url: Option<String>,
}

// ─── Inference / Predicciones ───────────────────────────────────────────────

/// Modelo de inferencia subido al proyecto
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InferenceModelEntry {
    pub id: String,
    pub name: String,
    /// Nombre del archivo en disco (dentro de models/)
    pub file: String,
    /// "onnx" | "pt"
    pub format: String,
    /// "detect" | "segment" | "classify" | "pose" | "obb"
    pub task: String,
    pub class_names: Vec<String>,
    #[serde(default)]
    pub class_mapping: Vec<ClassMapping>,
    pub input_size: Option<u32>,
    /// Hint de formato de salida ONNX: "yolov5", "yolov8", "yolov10", "classification", null=auto
    #[serde(default)]
    pub output_format: Option<String>,
    pub model_hash: String,
    pub uploaded: f64,
    pub metadata: Option<serde_json::Value>,
}

/// Mapeo de clase del modelo a clase del proyecto
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassMapping {
    pub model_class_id: usize,
    pub model_class_name: String,
    /// UUID de la clase del proyecto, None = sin mapear
    pub project_class_id: Option<String>,
}

/// Predicción generada por inferencia
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PredictionEntry {
    pub id: String,
    pub model_id: String,
    /// Índice de clase del modelo
    pub class_id: usize,
    /// Nombre de clase del modelo
    pub class_name: String,
    pub confidence: f64,
    /// Mismo formato que AnnotationEntry.data (bbox, polígono, etc.)
    pub data: serde_json::Value,
    #[serde(default = "default_prediction_status")]
    pub status: String, // "pending" | "accepted" | "rejected"
}

fn default_prediction_status() -> String {
    "pending".to_string()
}
