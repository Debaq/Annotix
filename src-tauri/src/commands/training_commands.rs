use tauri::{AppHandle, Emitter, State};

use crate::store::AppState;
use crate::store::project_file::TrainingJobEntry;
use crate::training::runner::TrainingProcessManager;
use crate::training::{
    GpuInfo, PythonEnvStatus, TrainingConfig, TrainingPreset, YoloModelInfo,
};

#[tauri::command]
pub fn check_python_env() -> Result<PythonEnvStatus, String> {
    crate::training::python_env::check_env()
}

#[tauri::command]
pub fn setup_python_env(app: AppHandle) -> Result<PythonEnvStatus, String> {
    crate::training::python_env::setup_env(|msg, progress| {
        let _ = app.emit(
            "training:env-setup-progress",
            serde_json::json!({
                "message": msg,
                "progress": progress,
            }),
        );
    })
}

#[tauri::command]
pub fn detect_gpu() -> Result<GpuInfo, String> {
    crate::training::gpu::detect_gpu()
}

#[tauri::command]
pub fn get_training_presets(_project_type: String) -> Result<Vec<TrainingPreset>, String> {
    let presets = vec![
        TrainingPreset {
            name: "quick".to_string(),
            epochs: 50,
            batch_size: 16,
            image_size: 640,
            patience: 10,
            augmentation_level: "light".to_string(),
        },
        TrainingPreset {
            name: "balanced".to_string(),
            epochs: 100,
            batch_size: 16,
            image_size: 640,
            patience: 25,
            augmentation_level: "medium".to_string(),
        },
        TrainingPreset {
            name: "full".to_string(),
            epochs: 300,
            batch_size: -1, // auto
            image_size: 640,
            patience: 50,
            augmentation_level: "heavy".to_string(),
        },
    ];

    Ok(presets)
}

#[tauri::command]
pub fn get_yolo_models(project_type: String) -> Result<Vec<YoloModelInfo>, String> {
    let task = match project_type.as_str() {
        "bbox" | "object-detection" => "detect",
        "instance-segmentation" | "polygon" => "segment",
        "classification" => "classify",
        "keypoints" => "pose",
        "obb" => "obb",
        _ => "detect",
    };

    let all_models = vec![
        YoloModelInfo {
            version: "yolo26".to_string(),
            tasks: vec![
                "detect".to_string(),
                "segment".to_string(),
                "classify".to_string(),
                "pose".to_string(),
                "obb".to_string(),
            ],
            sizes: vec![
                "n".to_string(),
                "s".to_string(),
                "m".to_string(),
                "l".to_string(),
                "x".to_string(),
            ],
            recommended: true,
        },
        YoloModelInfo {
            version: "yolo12".to_string(),
            tasks: vec![
                "detect".to_string(),
                "segment".to_string(),
                "classify".to_string(),
            ],
            sizes: vec![
                "n".to_string(),
                "s".to_string(),
                "m".to_string(),
                "l".to_string(),
                "x".to_string(),
            ],
            recommended: false,
        },
        YoloModelInfo {
            version: "yolo11".to_string(),
            tasks: vec![
                "detect".to_string(),
                "segment".to_string(),
                "classify".to_string(),
                "pose".to_string(),
                "obb".to_string(),
            ],
            sizes: vec![
                "n".to_string(),
                "s".to_string(),
                "m".to_string(),
                "l".to_string(),
                "x".to_string(),
            ],
            recommended: false,
        },
        YoloModelInfo {
            version: "yolov10".to_string(),
            tasks: vec!["detect".to_string()],
            sizes: vec![
                "n".to_string(),
                "s".to_string(),
                "m".to_string(),
                "l".to_string(),
                "x".to_string(),
            ],
            recommended: false,
        },
        YoloModelInfo {
            version: "yolov9".to_string(),
            tasks: vec!["detect".to_string(), "segment".to_string()],
            sizes: vec![
                "t".to_string(),
                "s".to_string(),
                "m".to_string(),
                "c".to_string(),
                "e".to_string(),
            ],
            recommended: false,
        },
        YoloModelInfo {
            version: "yolov8".to_string(),
            tasks: vec![
                "detect".to_string(),
                "segment".to_string(),
                "classify".to_string(),
                "pose".to_string(),
                "obb".to_string(),
            ],
            sizes: vec![
                "n".to_string(),
                "s".to_string(),
                "m".to_string(),
                "l".to_string(),
                "x".to_string(),
            ],
            recommended: false,
        },
        YoloModelInfo {
            version: "yolov5".to_string(),
            tasks: vec![
                "detect".to_string(),
                "segment".to_string(),
                "classify".to_string(),
            ],
            sizes: vec![
                "n".to_string(),
                "s".to_string(),
                "m".to_string(),
                "l".to_string(),
                "x".to_string(),
            ],
            recommended: false,
        },
    ];

    // Filtrar solo modelos que soportan la tarea del proyecto
    let filtered: Vec<YoloModelInfo> = all_models
        .into_iter()
        .filter(|m| m.tasks.contains(&task.to_string()))
        .collect();

    Ok(filtered)
}

#[tauri::command]
pub fn start_training(
    state: State<'_, AppState>,
    app: AppHandle,
    manager: State<'_, TrainingProcessManager>,
    project_id: String,
    config: TrainingConfig,
) -> Result<String, String> {
    let config_json = serde_json::to_value(&config).map_err(|e| e.to_string())?;
    let now = js_timestamp();
    let job_id = uuid::Uuid::new_v4().to_string();
    let job_id_clone = job_id.clone();

    // Crear job en project.json
    state.with_project_mut(&project_id, |pf| {
        pf.training_jobs.push(TrainingJobEntry {
            id: job_id_clone,
            status: "pending".to_string(),
            config: config_json,
            progress: 0.0,
            logs: vec![],
            metrics: None,
            created_at: now,
            updated_at: now,
            result_dir: None,
            best_model_path: None,
            dataset_dir: None,
        });
        pf.updated = now;
    })?;

    // Iniciar entrenamiento en background
    manager.start_training(&state, &app, &project_id, &job_id, config)?;

    Ok(job_id)
}

#[tauri::command]
pub fn cancel_training(
    state: State<'_, AppState>,
    app: AppHandle,
    manager: State<'_, TrainingProcessManager>,
    project_id: String,
    job_id: String,
) -> Result<(), String> {
    manager.cancel_training(&job_id)?;

    state.with_project_mut(&project_id, |pf| {
        if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id) {
            job.status = "cancelled".to_string();
            job.updated_at = js_timestamp();
        }
        pf.updated = js_timestamp();
    })?;

    let _ = app.emit(
        "training:cancelled",
        serde_json::json!({ "jobId": job_id }),
    );
    Ok(())
}

#[tauri::command]
pub fn get_training_job(
    state: State<'_, AppState>,
    project_id: String,
    job_id: String,
) -> Result<Option<TrainingJobEntry>, String> {
    state.with_project(&project_id, |pf| {
        pf.training_jobs.iter().find(|j| j.id == job_id).cloned()
    })
}

#[tauri::command]
pub fn list_training_jobs(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<TrainingJobEntry>, String> {
    state.with_project(&project_id, |pf| {
        pf.training_jobs.clone()
    })
}

#[tauri::command]
pub fn delete_training_job(
    state: State<'_, AppState>,
    manager: State<'_, TrainingProcessManager>,
    project_id: String,
    job_id: String,
) -> Result<(), String> {
    // Cancelar si está corriendo
    if manager.is_running(&job_id) {
        let _ = manager.cancel_training(&job_id);
    }

    // Obtener dataset_dir antes de eliminar
    let dataset_dir: Option<String> = state.with_project(&project_id, |pf| {
        pf.training_jobs.iter()
            .find(|j| j.id == job_id)
            .and_then(|j| j.dataset_dir.clone())
    })?;

    // Eliminar directorio de dataset/resultados
    if let Some(dir) = dataset_dir {
        let path = std::path::PathBuf::from(&dir);
        if path.exists() {
            let _ = std::fs::remove_dir_all(&path);
        }
    }

    // Eliminar de project.json
    state.with_project_mut(&project_id, |pf| {
        pf.training_jobs.retain(|j| j.id != job_id);
        pf.updated = js_timestamp();
    })?;

    Ok(())
}

#[tauri::command]
pub fn export_trained_model(
    model_path: String,
    format: String,
) -> Result<String, String> {
    crate::training::model_export::export_model(&model_path, &format)
}

fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}
