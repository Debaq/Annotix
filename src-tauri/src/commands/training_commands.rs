use tauri::{AppHandle, Emitter, State};

use crate::store::AppState;
use crate::store::project_file::TrainingJobEntry;
use crate::training::runner::TrainingProcessManager;
use crate::training::{
    GpuInfo, TrainingConfig, TrainingEnvCache, TrainingEnvInfo,
    TrainingPreset, YoloModelInfo, BackendInfo, TrainingRequest,
    TrainingBackend, ExecutionMode,
};

#[tauri::command]
pub fn check_python_env(cache: State<'_, TrainingEnvCache>) -> Result<TrainingEnvInfo, String> {
    // Devolver caché si existe (instantáneo)
    if let Some(cached) = cache.get() {
        return Ok(cached);
    }

    // Primera vez: ejecutar Python (un solo proceso para env + GPU)
    let (env, gpu) = crate::training::python_env::check_env_full()?;
    let info = TrainingEnvInfo { env, gpu };

    // Cachear solo si el entorno está instalado
    if info.env.installed {
        cache.set(info.clone());
    }

    Ok(info)
}

#[tauri::command]
pub async fn setup_python_env(
    app: AppHandle,
    cache: State<'_, TrainingEnvCache>,
    python_version: String,
) -> Result<TrainingEnvInfo, String> {
    // Invalidar caché antes de instalar
    cache.invalidate();

    // 1. Asegurar Micromamba
    let mm = crate::training::micromamba::Micromamba::new()?;
    if !mm.is_installed() {
        let app_clone = app.clone();
        mm.download(move |msg, p| {
            let _ = app_clone.emit("training:env-setup-progress", serde_json::json!({ "message": msg, "progress": p }));
        }).await?;
    }

    // 2. Crear entorno con versión elegida
    crate::training::python_env::setup_env_base(&python_version, |msg, progress, log| {
        let _ = app.emit(
            "training:env-setup-progress",
            serde_json::json!({
                "message": msg,
                "progress": progress,
                "log": log,
            }),
        );
    })?;

    // Re-verificar y cachear
    let (env, gpu) = crate::training::python_env::check_env_full()?;
    let info = TrainingEnvInfo { env, gpu };
    if info.env.installed {
        cache.set(info.clone());
    }
    Ok(info)
}

#[tauri::command]
pub fn detect_gpu(cache: State<'_, TrainingEnvCache>) -> Result<GpuInfo, String> {
    // Si hay caché, devolver la info de GPU del caché
    if let Some(cached) = cache.get() {
        return Ok(cached.gpu);
    }
    // Fallback: ejecutar detección standalone
    crate::training::gpu::detect_gpu()
}

#[tauri::command]
pub fn get_training_presets(_project_type: String) -> Result<Vec<TrainingPreset>, String> {
    // Presets now live in the frontend (scenario-based)
    Ok(vec![])
}

#[tauri::command]
pub fn get_yolo_models(project_type: String) -> Result<Vec<YoloModelInfo>, String> {
    let task = match project_type.as_str() {
        "bbox" | "object-detection" => "detect",
        "instance-segmentation" | "polygon" | "mask" | "semantic-segmentation" => "segment",
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

#[tauri::command]
pub fn get_available_backends(project_type: String) -> Result<Vec<BackendInfo>, String> {
    Ok(crate::training::backends::get_available_backends(&project_type))
}

#[tauri::command]
pub fn install_backend_packages(
    app: AppHandle,
    cache: State<'_, TrainingEnvCache>,
    backend: String,
) -> Result<(), String> {
    cache.invalidate();

    // 1. Detectar hardware para decidir qué versión de Torch instalar
    let (env_info, gpu_info) = crate::training::python_env::check_env_full()?;
    
    let mut packages: Vec<String> = match backend.as_str() {
        "yolo" | "rt_detr" => vec!["ultralytics".to_string()],
        "rf_detr" => vec!["rfdetr".to_string()],
        "mmdetection" => vec!["openmim".to_string(), "mmengine".to_string(), "mmcv".to_string(), "mmdet".to_string()],
        "smp" => vec!["segmentation-models-pytorch".to_string(), "albumentations".to_string()],
        "hf_segmentation" => vec!["transformers".to_string(), "datasets".to_string(), "evaluate".to_string()],
        "mmsegmentation" => vec!["openmim".to_string(), "mmengine".to_string(), "mmcv".to_string(), "mmsegmentation".to_string()],
        "detectron2" => vec!["detectron2".to_string()],
        "mmpose" => vec!["openmim".to_string(), "mmengine".to_string(), "mmcv".to_string(), "mmpose".to_string(), "mmdet".to_string()],
        "mmrotate" => vec!["openmim".to_string(), "mmengine".to_string(), "mmcv".to_string(), "mmrotate".to_string()],
        "timm" => vec!["timm".to_string()],
        "hf_classification" => vec!["transformers".to_string(), "datasets".to_string(), "evaluate".to_string()],
        "tsai" => vec!["tsai".to_string()],
        "pytorch_forecasting" => vec!["pytorch-forecasting".to_string(), "pytorch-lightning".to_string()],
        "pyod" => vec!["pyod".to_string()],
        "tslearn" => vec!["tslearn".to_string(), "scikit-learn".to_string()],
        "pypots" => vec!["pypots".to_string()],
        "stumpy" => vec!["stumpy".to_string(), "numpy".to_string()],
        _ => return Err(format!("Backend desconocido: {}", backend)),
    };

    // 2. Si el backend usa Torch y no está instalado o queremos asegurar la versión correcta
    let needs_torch = matches!(backend.as_str(), "yolo" | "rt_detr" | "smp" | "mmdetection" | "mmpose" | "tsai");
    
    if needs_torch && env_info.torch_version.is_none() {
        let app_clone = app.clone();
        let emit = move |msg: &str, p: f64, log: Option<String>| {
            let _ = app_clone.emit("training:env-setup-progress", serde_json::json!({ "message": msg, "progress": p, "log": log }));
        };

        emit("Preparando instalación de PyTorch...", 5.0, None);
        
        let python = crate::training::python_env::venv_python()?;
        let mut cmd = std::process::Command::new(&python);
        cmd.args(["-m", "pip", "install", "torch", "torchvision", "torchaudio"]);

        // Lógica de hardware inteligente
        if gpu_info.cuda_available {
            emit("GPU NVIDIA detectada, usando CUDA", 10.0, Some("Hardware: NVIDIA CUDA".to_string()));
            cmd.args(["--index-url", "https://download.pytorch.org/whl/cu121"]);
        } else if cfg!(target_os = "macos") {
            emit("macOS detectado, usando optimización Metal (MPS)", 10.0, Some("Hardware: Apple Silicon/Metal".to_string()));
        } else {
            emit("No se detectó GPU compatible, usando versión CPU", 10.0, Some("Hardware: CPU Only".to_string()));
            cmd.args(["--index-url", "https://download.pytorch.org/whl/cpu"]);
        }

        crate::training::python_env::run_with_feedback(cmd, "Instalando PyTorch", 10.0, 40.0, &emit)?;
    }

    // 3. Instalar el resto de paquetes
    let pkgs_ref: Vec<&str> = packages.iter().map(|s| s.as_str()).collect();
    let app_clone = app.clone();
    crate::training::python_env::install_packages(&pkgs_ref, Some(|msg: &str, progress: f64, log: Option<String>| {
        let _ = app_clone.emit(
            "training:env-setup-progress",
            serde_json::json!({
                "message": msg,
                "progress": progress,
                "log": log,
            }),
        );
    }))?;

    Ok(())
}

#[tauri::command]
pub fn start_training_v2(
    state: State<'_, AppState>,
    app: AppHandle,
    manager: State<'_, TrainingProcessManager>,
    project_id: String,
    request: TrainingRequest,
) -> Result<String, String> {
    // For download-package mode, delegate to package generation
    if request.execution_mode == ExecutionMode::DownloadPackage {
        return Err("Usa generate_training_package para modo descarga".to_string());
    }

    // For YOLO backend with local execution, convert to legacy TrainingConfig for backward compat
    if request.backend == TrainingBackend::Yolo {
        let yolo_config = convert_request_to_yolo_config(&request);
        let config_json = serde_json::to_value(&yolo_config).map_err(|e| e.to_string())?;
        let now = js_timestamp();
        let job_id = uuid::Uuid::new_v4().to_string();
        let job_id_clone = job_id.clone();

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

        manager.start_training(&state, &app, &project_id, &job_id, yolo_config)?;
        return Ok(job_id);
    }

    // For other backends, use start_training_v2
    let config_json = serde_json::to_value(&request).map_err(|e| e.to_string())?;
    let now = js_timestamp();
    let job_id = uuid::Uuid::new_v4().to_string();
    let job_id_clone = job_id.clone();

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

    manager.start_training_v2(&state, &app, &project_id, &job_id, request)?;
    Ok(job_id)
}

#[tauri::command]
pub fn generate_training_package(
    state: State<'_, AppState>,
    project_id: String,
    request: TrainingRequest,
    output_path: String,
) -> Result<String, String> {
    let pf = state.read_project_file(&project_id)?;
    let images_dir = state.project_images_dir(&project_id)?;

    let images: Vec<crate::store::project_file::ImageEntry> = pf.images.iter().cloned().map(|mut img| {
        img.annotations.retain(|ann| {
            pf.classes.iter().any(|c| c.id == ann.class_id)
        });
        img
    }).collect();

    crate::training::package::generate_training_package(
        &images_dir, &pf, &images, &request, &output_path,
    )
}

/// Convert TrainingRequest to legacy TrainingConfig for YOLO backward compat
fn convert_request_to_yolo_config(req: &TrainingRequest) -> TrainingConfig {
    let bp = &req.backend_params;

    TrainingConfig {
        yolo_version: req.model_id.clone(),
        task: req.task.clone(),
        model_size: bp.get("modelSize").and_then(|v| v.as_str()).unwrap_or("n").to_string(),
        epochs: req.epochs,
        batch_size: req.batch_size,
        imgsz: req.image_size,
        device: req.device.clone(),
        optimizer: bp.get("optimizer").and_then(|v| v.as_str()).unwrap_or("auto").to_string(),
        lr0: req.lr,
        lrf: bp.get("lrf").and_then(|v| v.as_f64()).unwrap_or(0.01),
        patience: req.patience,
        val_split: req.val_split,
        workers: req.workers,
        augmentation: serde_json::from_value(
            bp.get("augmentation").cloned().unwrap_or_default()
        ).unwrap_or_else(|_| crate::training::AugmentationConfig {
            mosaic: 1.0, mixup: 0.0, hsv_h: 0.015, hsv_s: 0.7, hsv_v: 0.4,
            flipud: 0.0, fliplr: 0.5, degrees: 0.0, scale: 0.5, shear: 0.0,
            perspective: 0.0, copy_paste: 0.0, erasing: 0.4, translate: 0.1,
        }),
        export_formats: req.export_formats.clone(),
        resume: req.resume,
        cos_lr: bp.get("cos_lr").and_then(|v| v.as_bool()).unwrap_or(false),
        warmup_epochs: bp.get("warmup_epochs").and_then(|v| v.as_f64()).unwrap_or(3.0),
        warmup_momentum: bp.get("warmup_momentum").and_then(|v| v.as_f64()).unwrap_or(0.8),
        warmup_bias_lr: bp.get("warmup_bias_lr").and_then(|v| v.as_f64()).unwrap_or(0.1),
        momentum: bp.get("momentum").and_then(|v| v.as_f64()).unwrap_or(0.937),
        weight_decay: bp.get("weight_decay").and_then(|v| v.as_f64()).unwrap_or(0.0005),
        nbs: bp.get("nbs").and_then(|v| v.as_u64()).unwrap_or(64) as u32,
        box_weight: bp.get("box").and_then(|v| v.as_f64()).unwrap_or(7.5),
        cls: bp.get("cls").and_then(|v| v.as_f64()).unwrap_or(0.5),
        dfl: bp.get("dfl").and_then(|v| v.as_f64()).unwrap_or(1.5),
        close_mosaic: bp.get("close_mosaic").and_then(|v| v.as_u64()).unwrap_or(10) as u32,
        max_det: bp.get("max_det").and_then(|v| v.as_u64()).unwrap_or(300) as u32,
        multi_scale: bp.get("multi_scale").and_then(|v| v.as_f64()).unwrap_or(0.0),
        rect: bp.get("rect").and_then(|v| v.as_bool()).unwrap_or(false),
        cache: serde_json::from_value(
            bp.get("cache").cloned().unwrap_or(serde_json::Value::Bool(false))
        ).unwrap_or(crate::training::CacheOption::Bool(false)),
        amp: req.amp,
        single_cls: bp.get("single_cls").and_then(|v| v.as_bool()).unwrap_or(false),
        pretrained: bp.get("pretrained").and_then(|v| v.as_bool()).unwrap_or(true),
        freeze: bp.get("freeze").and_then(|v| v.as_u64()).map(|v| v as u32),
        base_model_path: req.base_model_path.clone(),
    }
}

fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}
