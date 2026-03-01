use std::path::PathBuf;
use std::process::Command;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::training::python_env;
use crate::training::TrainingEnvCache;

// ─── Types ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct VenvInfo {
    pub exists: bool,
    pub path: String,
    #[serde(rename = "diskUsageBytes")]
    pub disk_usage_bytes: u64,
    #[serde(rename = "diskUsageHuman")]
    pub disk_usage_human: String,
    #[serde(rename = "pythonVersion")]
    pub python_version: Option<String>,
    #[serde(rename = "systemPython")]
    pub system_python: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstalledPackage {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemGpuInfo {
    #[serde(rename = "hasNvidia")]
    pub has_nvidia: bool,
    #[serde(rename = "nvidiaDriverVersion")]
    pub nvidia_driver_version: Option<String>,
    #[serde(rename = "suggestedCuda")]
    pub suggested_cuda: Option<String>,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn dir_size(path: &PathBuf) -> u64 {
    if !path.exists() {
        return 0;
    }
    let mut total: u64 = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total += dir_size(&p);
            } else if let Ok(meta) = p.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

fn human_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.0} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

fn get_python_version(python_path: &PathBuf) -> Option<String> {
    let output = Command::new(python_path)
        .args(["--version"])
        .output()
        .ok()?;
    if output.status.success() {
        let ver = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Some(ver.replace("Python ", ""))
    } else {
        None
    }
}

// ─── Commands ───────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_venv_info() -> Result<VenvInfo, String> {
    let venv = python_env::venv_dir()?;
    let exists = venv.exists();
    let system_python = python_env::find_system_python();

    if !exists {
        return Ok(VenvInfo {
            exists: false,
            path: venv.to_string_lossy().to_string(),
            disk_usage_bytes: 0,
            disk_usage_human: "0 B".to_string(),
            python_version: None,
            system_python,
        });
    }

    let python = python_env::venv_python()?;
    let python_version = get_python_version(&python);
    let disk_usage_bytes = dir_size(&venv);
    let disk_usage_human = human_bytes(disk_usage_bytes);

    Ok(VenvInfo {
        exists: true,
        path: venv.to_string_lossy().to_string(),
        disk_usage_bytes,
        disk_usage_human,
        python_version,
        system_python,
    })
}

#[tauri::command]
pub fn list_installed_packages() -> Result<Vec<InstalledPackage>, String> {
    let python = python_env::venv_python()?;
    if !python.exists() {
        return Ok(vec![]);
    }

    let output = Command::new(&python)
        .args(["-m", "pip", "list", "--format=json"])
        .output()
        .map_err(|e| format!("Error ejecutando pip list: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "pip list falló: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let packages: Vec<serde_json::Value> =
        serde_json::from_str(stdout.trim()).unwrap_or_default();

    Ok(packages
        .into_iter()
        .filter_map(|p| {
            Some(InstalledPackage {
                name: p["name"].as_str()?.to_string(),
                version: p["version"].as_str()?.to_string(),
            })
        })
        .collect())
}

#[tauri::command]
pub async fn update_packages(
    app: AppHandle,
    cache: State<'_, TrainingEnvCache>,
    packages: Vec<String>,
) -> Result<(), String> {
    let pkgs_ref: Vec<&str> = packages.iter().map(|s| s.as_str()).collect();
    
    let app_clone = app.clone();
    python_env::install_packages(&pkgs_ref, Some(|msg: &str, progress: f64, log: Option<String>| {
        let _ = app_clone.emit(
            "settings:package-update-progress",
            serde_json::json!({
                "message": msg,
                "progress": progress,
                "log": log,
            }),
        );
    }))?;

    let _ = app.emit(
        "settings:package-update-progress",
        serde_json::json!({
            "message": "Actualización completada",
            "progress": 100.0,
            "log": None::<String>,
        }),
    );

    cache.invalidate();
    Ok(())
}

#[tauri::command]
pub async fn install_pytorch(
    app: AppHandle,
    cache: State<'_, TrainingEnvCache>,
    cuda_version: String,
) -> Result<(), String> {
    let python = python_env::venv_python()?;
    if !python.exists() {
        return Err("El entorno virtual no existe".to_string());
    }

    let app_clone = app.clone();
    let emit = move |msg: &str, progress: f64, log: Option<String>| {
        let _ = app_clone.emit(
            "settings:pytorch-install-progress",
            serde_json::json!({
                "message": msg,
                "progress": progress,
                "log": log,
            }),
        );
    };

    // Paso 1: Desinstalar torch existente
    emit("Desinstalando PyTorch existente...", 10.0, None);

    let mut cmd_un = Command::new(&python);
    cmd_un.args(["-m", "pip", "uninstall", "-y", "torch", "torchvision", "torchaudio"]);
    let _ = python_env::run_with_feedback(cmd_un, "Desinstalando", 10.0, 20.0, &emit);

    // Paso 2: Instalar según variante
    emit(&format!("Instalando PyTorch ({})...", if cuda_version == "cpu" { "CPU".to_string() } else { format!("CUDA {}", cuda_version) }), 30.0, None);

    let mut cmd_in = Command::new(&python);
    cmd_in.args(["-m", "pip", "install", "torch", "torchvision", "torchaudio"]);

    match cuda_version.as_str() {
        "cpu" => {
            cmd_in.args(["--index-url", "https://download.pytorch.org/whl/cpu"]);
        }
        "12.1" => {
            cmd_in.args(["--index-url", "https://download.pytorch.org/whl/cu121"]);
        }
        "12.4" => {
            cmd_in.args(["--index-url", "https://download.pytorch.org/whl/cu124"]);
        }
        _ => {
            return Err(format!("Versión CUDA no soportada: {}", cuda_version));
        }
    }

    python_env::run_with_feedback(cmd_in, "Instalando PyTorch", 30.0, 70.0, &emit)?;

    emit("PyTorch instalado correctamente", 100.0, None);

    cache.invalidate();
    Ok(())
}

#[tauri::command]
pub async fn install_onnx(
    app: AppHandle,
    cache: State<'_, TrainingEnvCache>,
    with_gpu: bool,
) -> Result<(), String> {
    let python = python_env::venv_python()?;
    if !python.exists() {
        return Err("El entorno virtual no existe".to_string());
    }

    let app_clone = app.clone();
    let emit = move |msg: &str, progress: f64, log: Option<String>| {
        let _ = app_clone.emit(
            "settings:onnx-install-progress",
            serde_json::json!({
                "message": msg,
                "progress": progress,
                "log": log,
            }),
        );
    };

    emit("Instalando ONNX toolkit...", 5.0, None);

    let runtime_pkg = if with_gpu { "onnxruntime-gpu" } else { "onnxruntime" };
    let packages = vec!["onnx", runtime_pkg, "skl2onnx", "onnxmltools"];

    let total = packages.len();
    for (i, pkg) in packages.iter().enumerate() {
        let base_p = 5.0 + (i as f64 / total as f64) * 90.0;
        let span = 90.0 / total as f64;
        let msg = format!("Instalando {}", pkg);

        let mut cmd = Command::new(&python);
        cmd.args(["-m", "pip", "install", pkg]);
        python_env::run_with_feedback(cmd, &msg, base_p, span, &emit)?;
    }

    emit("ONNX toolkit instalado correctamente", 100.0, None);

    cache.invalidate();
    Ok(())
}

#[tauri::command]
pub fn remove_venv(cache: State<'_, TrainingEnvCache>) -> Result<(), String> {
    let venv = python_env::venv_dir()?;
    if venv.exists() {
        std::fs::remove_dir_all(&venv)
            .map_err(|e| format!("Error eliminando venv: {}", e))?;
    }
    cache.invalidate();
    Ok(())
}

#[tauri::command]
pub fn detect_system_gpu() -> Result<SystemGpuInfo, String> {
    // Intentar ejecutar nvidia-smi
    let output = Command::new("nvidia-smi")
        .args(["--query-gpu=driver_version", "--format=csv,noheader,nounits"])
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let driver = String::from_utf8_lossy(&out.stdout).trim().to_string();
            // Extraer primera línea si hay múltiples GPUs
            let driver_version = driver.lines().next().unwrap_or("").to_string();

            // Sugerir CUDA según versión del driver
            let suggested_cuda = suggest_cuda_from_driver(&driver_version);

            Ok(SystemGpuInfo {
                has_nvidia: true,
                nvidia_driver_version: Some(driver_version),
                suggested_cuda,
            })
        }
        _ => Ok(SystemGpuInfo {
            has_nvidia: false,
            nvidia_driver_version: None,
            suggested_cuda: None,
        }),
    }
}

fn suggest_cuda_from_driver(driver_version: &str) -> Option<String> {
    // Parsear versión mayor del driver
    let major: u32 = driver_version
        .split('.')
        .next()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    // Driver >= 525 soporta CUDA 12.1, >= 550 soporta CUDA 12.4
    if major >= 550 {
        Some("12.4".to_string())
    } else if major >= 525 {
        Some("12.1".to_string())
    } else {
        None
    }
}
