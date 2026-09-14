//! Fixtures compartidos por los tests de contrato y los smoke tests de entrenamiento.
//!
//! Construyen un proyecto sintético **en disco**, con el mismo layout que usa la app
//! (`{proyecto}/images`, `/timeseries`, `/tabular`), porque los preparadores leen
//! archivos reales: un fixture en memoria no probaría nada.

use std::path::{Path, PathBuf};

use serde_json::json;
use tempfile::TempDir;

use crate::store::project_file::{
    AnnotationEntry, ClassDef, ImageEntry, ProjectFile, TabularColumnInfo, TabularDataEntry,
    TimeSeriesEntry,
};
use crate::training::{ExecutionMode, TrainingBackend, TrainingRequest};

// ─── Fixtures ───────────────────────────────────────────────────────────────

pub fn classes() -> Vec<ClassDef> {
    vec![
        ClassDef {
            id: 10,
            name: "gato".into(),
            color: "#ff0000".into(),
            description: None,
        },
        ClassDef {
            id: 20,
            name: "perro".into(),
            color: "#00ff00".into(),
            description: None,
        },
    ]
}

pub fn ann(kind: &str, class_id: i64, data: serde_json::Value) -> AnnotationEntry {
    AnnotationEntry {
        origin: None,
        model_id: None,
        review: None,
        reviewed_by: None,
        reviewed_at: None,
        created_at: None,
        updated_at: None,
        id: uuid::Uuid::new_v4().to_string(),
        annotation_type: kind.into(),
        class_id,
        data,
        source: "user".into(),
        confidence: None,
        model_class_name: None,
        created_by: None,
        track_id: None,
    }
}

/// Anotación del tipo que la tarea espera, para que el dataset salga no vacío.
pub fn ann_for_task(task: &str, class_id: i64) -> AnnotationEntry {
    match task {
        "segment" | "instance_segment" => ann(
            "polygon",
            class_id,
            json!({"points": [{"x": 4.0, "y": 4.0}, {"x": 40.0, "y": 4.0}, {"x": 40.0, "y": 40.0}]}),
        ),
        "pose" | "landmarks" => ann(
            "keypoints",
            class_id,
            json!({"points": [
                {"x": 10.0, "y": 10.0, "visible": true},
                {"x": 20.0, "y": 30.0, "visible": true}
            ]}),
        ),
        "obb" => ann(
            "obb",
            class_id,
            json!({"x": 32.0, "y": 32.0, "width": 20.0, "height": 10.0, "rotation": 0.4}),
        ),
        _ => ann(
            "bbox",
            class_id,
            json!({"x": 8.0, "y": 8.0, "width": 24.0, "height": 24.0}),
        ),
    }
}

pub fn write_png(path: &Path, w: u32, h: u32) {
    use image::{ImageBuffer, Rgb};
    let img: ImageBuffer<Rgb<u8>, Vec<u8>> =
        ImageBuffer::from_fn(w, h, |x, y| Rgb([(x % 255) as u8, (y % 255) as u8, 120]));
    img.save(path).expect("escribir png de prueba");
}

pub fn base_project() -> ProjectFile {
    ProjectFile {
        version: 1,
        id: "proyecto-de-prueba".into(),
        name: "contrato".into(),
        project_type: "detection".into(),
        classes: classes(),
        created: 0.0,
        updated: 0.0,
        images: vec![],
        timeseries: vec![],
        videos: vec![],
        training_jobs: vec![],
        tabular_data: vec![],
        audio: vec![],
        p2p: None,
        p2p_download: None,
        inference_models: vec![],
        folder: None,
        tts_sentences: vec![],
        image_format: "png".into(),
        webp_quality_preset: "high".into(),
        split_policy: None,
    }
}

/// Proyecto sintético en disco con la forma que la tarea necesita.
///
/// Devuelve `(proyecto, tempdir del proyecto, images_dir)`. El layout imita el
/// real: `{proyecto}/images`, `{proyecto}/timeseries`, `{proyecto}/tabular`.
pub fn fixture(task: &str) -> (ProjectFile, TempDir, PathBuf) {
    let tmp = tempfile::tempdir().expect("tempdir");
    let images_dir = tmp.path().join("images");
    std::fs::create_dir_all(&images_dir).unwrap();

    let mut pf = base_project();

    // 4 imágenes: suficientes para que el split deje train y val no vacíos.
    for i in 0..4 {
        let name = format!("img{i}.png");
        write_png(&images_dir.join(&name), 64, 64);
        let class_id = if i % 2 == 0 { 10 } else { 20 };
        pf.images.push(ImageEntry {
            subject_id: None,
            id: format!("img-{i}"),
            name: name.clone(),
            file: name,
            width: 64,
            height: 64,
            uploaded: 0.0,
            annotated: Some(1.0),
            status: "annotated".into(),
            annotations: vec![ann_for_task(task, class_id)],
            video_id: None,
            frame_index: None,
            is_background: false,
            locked_by: None,
            lock_expires: None,
            download_status: None,
            predictions: vec![],
            rejected: vec![],
        });
    }

    if task.starts_with("ts_") {
        let ts_dir = tmp.path().join("timeseries");
        std::fs::create_dir_all(&ts_dir).unwrap();
        for s in 0..2 {
            let id = format!("serie-{s}");
            let timestamps: Vec<f64> = (0..64).map(|t| t as f64).collect();
            let values: Vec<f64> = (0..64).map(|t| (t as f64 * 0.1).sin()).collect();
            std::fs::write(
                ts_dir.join(format!("{id}.json")),
                serde_json::to_string(&json!({
                    "timestamps": timestamps,
                    "values": values,
                    "columns": ["valor"],
                }))
                .unwrap(),
            )
            .unwrap();
            pf.timeseries.push(TimeSeriesEntry {
                subject_id: None,
                id,
                name: format!("serie {s}"),
                data: None,
                point_count: 64,
                series_count: 1,
                columns: Some(vec!["valor".into()]),
                annotations: vec![],
                uploaded: 0.0,
                annotated: Some(1.0),
                status: "annotated".into(),
            });
        }
    }

    if task == "tabular" {
        let tab_dir = tmp.path().join("tabular");
        std::fs::create_dir_all(&tab_dir).unwrap();
        let mut csv = String::from("feature_a,feature_b,target\n");
        for i in 0..20 {
            csv.push_str(&format!("{},{},{}\n", i, i * 2, i % 2));
        }
        std::fs::write(tab_dir.join("data.csv"), csv).unwrap();
        pf.tabular_data.push(TabularDataEntry {
            subject_id: None,
            id: "tab-1".into(),
            name: "datos".into(),
            file: "data.csv".into(),
            uploaded: 0.0,
            rows: 20,
            columns: vec![TabularColumnInfo {
                name: "target".into(),
                dtype: "numeric".into(),
                unique_count: 2,
                null_count: 0,
                sample_values: vec![],
            }],
            target_column: Some("target".into()),
            feature_columns: vec!["feature_a".into(), "feature_b".into()],
            task_type: Some("classification".into()),
        });
    }

    (pf, tmp, images_dir)
}

/// Un id de modelo real del catálogo de cada backend.
///
/// No es cosmético: varios scripts interpolan el id como identificador Python
/// (`from rfdetr import {model_id}`) o como checkpoint de HuggingFace, así que un
/// id inventado produciría un script inválido y el test mediría lo que no es.
pub fn model_id_real(backend: &TrainingBackend) -> &'static str {
    match backend {
        TrainingBackend::Yolo => "yolo11",
        TrainingBackend::RtDetr => "rtdetr-l",
        TrainingBackend::RfDetr => "RFDETRMedium",
        TrainingBackend::HfDetection => "facebook/detr-resnet-50",
        TrainingBackend::Smp => "DeepLabV3Plus-resnet50",
        TrainingBackend::HfSegmentation => "nvidia/segformer-b0-finetuned-ade-512-512",

        TrainingBackend::HfInstance => "facebook/mask2former-swin-tiny-coco-instance",
        // Pose: backbone de timm con cabeza de heatmaps (ver generate_hf_pose_script).
        TrainingBackend::HfPose => "resnet18",

        TrainingBackend::Timm => "resnet50",
        TrainingBackend::HfClassification => "google/vit-base-patch16-224",
        TrainingBackend::Tsai => "InceptionTimePlus",
        TrainingBackend::PytorchForecasting => "deepar",
        TrainingBackend::Pyod => "pyod-iforest",
        TrainingBackend::Tslearn => "tslearn-kmeans-dtw",
        TrainingBackend::Pypots => "pypots-saits",
        TrainingBackend::Stumpy => "stumpy-mp",
        TrainingBackend::Sklearn => "random_forest_classifier",
    }
}

/// Resolución del fixture: la mínima que el backend acepta, pero nunca menos de 64
/// px, que es lo que mantiene los smoke tests en segundos.
pub fn image_size_minima(backend: &TrainingBackend) -> u32 {
    crate::training::backends::min_image_size(backend).max(64)
}

pub fn request(backend: TrainingBackend, task: &str) -> TrainingRequest {
    let model_id = model_id_real(&backend).into();
    let image_size = image_size_minima(&backend);
    TrainingRequest {
        class_ids: None,
        model_id,
        image_size,
        backend,
        task: task.into(),
        execution_mode: ExecutionMode::Local,
        epochs: 2,
        batch_size: 2,
        device: "cpu".into(),
        lr: 0.001,
        patience: 5,
        val_split: 0.25,
        test_split: 0.0,
        workers: 0,
        amp: false,
        resume: false,
        export_formats: vec![],
        backend_params: json!({}),
        base_model_path: None,
        cloud_config: None,
    }
}
