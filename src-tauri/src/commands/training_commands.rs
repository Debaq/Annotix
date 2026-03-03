use tauri::{AppHandle, Emitter, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::AppState;
use crate::store::config::{CloudProviderConfig, GcpConfig, KaggleConfig, LightningAiConfig, HuggingFaceConfig, SaturnCloudConfig};
use crate::store::project_file::TrainingJobEntry;
use crate::training::runner::TrainingProcessManager;
use crate::training::cloud::CloudTrainingManager;
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
pub async fn start_training(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    manager: State<'_, TrainingProcessManager>,
    project_id: String,
    config: TrainingConfig,
) -> Result<String, String> {
    p2p.check_permission(P2pPermission::Manage).await?;
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
            cloud_provider: None,
            cloud_job_id: None,
            cloud_job_url: None,
            model_download_url: None,
        });
        pf.updated = now;
    })?;

    // Iniciar entrenamiento en background
    manager.start_training(&state, &app, &project_id, &job_id, config)?;

    Ok(job_id)
}

#[tauri::command]
pub async fn cancel_training(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    manager: State<'_, TrainingProcessManager>,
    project_id: String,
    job_id: String,
) -> Result<(), String> {
    p2p.check_permission(P2pPermission::Manage).await?;
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
pub async fn delete_training_job(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    manager: State<'_, TrainingProcessManager>,
    project_id: String,
    job_id: String,
) -> Result<(), String> {
    p2p.check_permission(P2pPermission::Delete).await?;
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
    let (env_info, _gpu_info) = crate::training::python_env::check_env_full()?;
    
    let packages: Vec<String> = match backend.as_str() {
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

    // 2. Si el backend usa Torch y no está instalado, instalarlo
    let needs_torch = !matches!(backend.as_str(), "tslearn" | "stumpy" | "sklearn");

    if needs_torch && env_info.torch_version.is_none() {
        let app_clone = app.clone();
        let emit = move |msg: &str, p: f64, log: Option<String>| {
            let _ = app_clone.emit("training:env-setup-progress", serde_json::json!({ "message": msg, "progress": p, "log": log }));
        };

        emit("Preparando instalación de PyTorch...", 5.0, None);

        let python = crate::training::python_env::venv_python()?;
        let mut cmd = std::process::Command::new(&python);
        cmd.args(["-m", "pip", "install", "torch", "torchvision", "torchaudio"]);

        // Detectar hardware real (nvidia-smi) — no depender del torch actual que aún no existe
        let has_nvidia = detect_nvidia_hardware();

        if has_nvidia {
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

/// Detecta si hay hardware NVIDIA ejecutando nvidia-smi (no depende de torch)
fn detect_nvidia_hardware() -> bool {
    std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=name", "--format=csv,noheader"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn start_training_v2(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    manager: State<'_, TrainingProcessManager>,
    cloud_manager: State<'_, CloudTrainingManager>,
    project_id: String,
    request: TrainingRequest,
) -> Result<String, String> {
    p2p.check_permission(P2pPermission::Manage).await?;
    // For download-package mode, delegate to package generation
    if request.execution_mode == ExecutionMode::DownloadPackage {
        return Err("Usa generate_training_package para modo descarga".to_string());
    }

    // For cloud mode, delegate to CloudTrainingManager
    if request.execution_mode == ExecutionMode::Cloud {
        let cloud_config = request.cloud_config.as_ref()
            .ok_or("Falta cloudConfig para modo cloud")?;

        let config_json = serde_json::to_value(&request).map_err(|e| e.to_string())?;
        let now = js_timestamp();
        let job_id = uuid::Uuid::new_v4().to_string();
        let job_id_clone = job_id.clone();

        // Read project for classes and dataset
        let pf = state.read_project_file(&project_id)?;
        let classes: Vec<String> = pf.classes.iter().map(|c| c.name.clone()).collect();

        // Create job entry
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
                cloud_provider: None,
                cloud_job_id: None,
                cloud_job_url: None,
                model_download_url: None,
            });
            pf.updated = now;
        })?;

        // Prepare dataset (reuse existing package logic to create a zip)
        let images_dir = state.project_images_dir(&project_id)?;
        let temp_dir = tempfile::tempdir().map_err(|e| e.to_string())?;
        let dataset_zip = temp_dir.path().join("dataset.zip");
        let dataset_zip_str = dataset_zip.to_string_lossy().to_string();

        let images: Vec<crate::store::project_file::ImageEntry> = pf.images.iter().cloned().map(|mut img| {
            img.annotations.retain(|ann| {
                pf.classes.iter().any(|c| c.id == ann.class_id)
            });
            img
        }).collect();

        crate::training::package::generate_training_package(
            &images_dir, &pf, &images, &request, &dataset_zip_str,
        )?;

        // Start cloud training
        cloud_manager.start_cloud_training(
            &app, &state, &project_id, &job_id,
            &request, cloud_config, &dataset_zip_str, &classes,
        )?;

        return Ok(job_id);
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
                cloud_provider: None,
                cloud_job_id: None,
                cloud_job_url: None,
                model_download_url: None,
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
            cloud_provider: None,
            cloud_job_id: None,
            cloud_job_url: None,
            model_download_url: None,
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

// ─── Cloud Provider Config Commands ──────────────────────────────────────────

#[tauri::command]
pub fn get_cloud_providers_config(
    state: State<'_, AppState>,
) -> Result<CloudProviderConfig, String> {
    let config = state.get_app_config()?;
    Ok(config.cloud_providers)
}

#[tauri::command]
pub fn save_cloud_provider_config(
    state: State<'_, AppState>,
    provider: String,
    config_data: serde_json::Value,
) -> Result<(), String> {
    let mut app_config = state.get_app_config()?;

    match provider.as_str() {
        "gcp" => {
            let gcp: GcpConfig = serde_json::from_value(config_data)
                .map_err(|e| format!("Error parseando config GCP: {}", e))?;
            app_config.cloud_providers.gcp = Some(gcp);
        }
        "kaggle" => {
            let kaggle: KaggleConfig = serde_json::from_value(config_data)
                .map_err(|e| format!("Error parseando config Kaggle: {}", e))?;
            app_config.cloud_providers.kaggle = Some(kaggle);
        }
        "lightning_ai" => {
            let lai: LightningAiConfig = serde_json::from_value(config_data)
                .map_err(|e| format!("Error parseando config Lightning AI: {}", e))?;
            app_config.cloud_providers.lightning_ai = Some(lai);
        }
        "huggingface" => {
            let hf: HuggingFaceConfig = serde_json::from_value(config_data)
                .map_err(|e| format!("Error parseando config Hugging Face: {}", e))?;
            app_config.cloud_providers.huggingface = Some(hf);
        }
        "saturn_cloud" => {
            let sc: SaturnCloudConfig = serde_json::from_value(config_data)
                .map_err(|e| format!("Error parseando config Saturn Cloud: {}", e))?;
            app_config.cloud_providers.saturn_cloud = Some(sc);
        }
        _ => return Err(format!("Proveedor desconocido: {}", provider)),
    }

    app_config.save(&state.data_dir)?;

    // Update in-memory config
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    *config = app_config;

    Ok(())
}

#[tauri::command]
pub fn validate_cloud_credentials(
    state: State<'_, AppState>,
    provider: String,
) -> Result<(), String> {
    let config = state.get_app_config()?;

    match provider.as_str() {
        "gcp" => {
            let gcp = config.cloud_providers.gcp
                .ok_or("GCP no configurado")?;
            let sa_path = gcp.service_account_path
                .ok_or("Falta Service Account JSON path")?;
            crate::training::cloud::gcp_auth::validate_credentials(&sa_path)
        }
        "kaggle" => {
            let kaggle = config.cloud_providers.kaggle
                .ok_or("Kaggle no configurado")?;
            let username = kaggle.username.ok_or("Falta username")?;
            let api_key = kaggle.api_key.ok_or("Falta API key")?;
            crate::training::cloud::kaggle::validate_credentials(&username, &api_key)
        }
        "lightning_ai" => {
            let lai = config.cloud_providers.lightning_ai
                .ok_or("Lightning AI no configurado")?;
            let api_key = lai.api_key.ok_or("Falta API key")?;
            crate::training::cloud::lightning::validate_credentials(&api_key)
        }
        "huggingface" => {
            let hf = config.cloud_providers.huggingface
                .ok_or("Hugging Face no configurado")?;
            let token = hf.token.ok_or("Falta token")?;
            crate::training::cloud::huggingface::validate_credentials(&token)
        }
        "saturn_cloud" => {
            let sc = config.cloud_providers.saturn_cloud
                .ok_or("Saturn Cloud no configurado")?;
            let api_token = sc.api_token.ok_or("Falta API token")?;
            crate::training::cloud::saturn::validate_credentials(&api_token)
        }
        _ => Err(format!("Proveedor desconocido: {}", provider)),
    }
}

#[tauri::command]
pub fn download_cloud_model(
    state: State<'_, AppState>,
    project_id: String,
    job_id: String,
    output_path: String,
) -> Result<String, String> {
    let pf = state.read_project_file(&project_id)?;
    let job = pf.training_jobs.iter()
        .find(|j| j.id == job_id)
        .ok_or("Job no encontrado")?;

    let download_url = job.model_download_url.as_deref()
        .ok_or("No hay URL de descarga del modelo")?;

    let config = state.get_app_config()?;
    let provider = job.cloud_provider.as_deref().unwrap_or("");

    match provider {
        "kaggle" => {
            // For Kaggle, model is already downloaded or available via output endpoint
            Ok(download_url.to_string())
        }
        "lightning_ai" | "hugging_face" | "saturn_cloud" => {
            // These providers store the download URL directly
            Ok(download_url.to_string())
        }
        "vertex_ai_custom" | "colab_enterprise" | "vertex_ai_gemini_tuning" => {
            let gcp = config.cloud_providers.gcp
                .ok_or("GCP no configurado")?;
            let sa_path = gcp.service_account_path
                .ok_or("Falta Service Account path")?;
            let token = crate::training::cloud::gcp_auth::get_access_token(&sa_path)?;

            if let Some(uri) = download_url.strip_prefix("gs://") {
                let (bucket, object) = uri.split_once('/')
                    .ok_or("URI GCS inválida")?;
                crate::training::cloud::gcs::download_file(&token, bucket, object, &output_path)
            } else {
                Ok(download_url.to_string())
            }
        }
        _ => Err(format!("Proveedor desconocido: {}", provider)),
    }
}

fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}
