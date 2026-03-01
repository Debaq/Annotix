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
    let python = python_env::venv_python()?;
    if !python.exists() {
        return Err("El entorno virtual no existe".to_string());
    }

    let total = packages.len();
    for (i, pkg) in packages.iter().enumerate() {
        let _ = app.emit(
            "settings:package-update-progress",
            serde_json::json!({
                "message": format!("Actualizando {}...", pkg),
                "progress": ((i as f64) / total as f64) * 100.0,
                "package": pkg,
            }),
        );

        let output = Command::new(&python)
            .args(["-m", "pip", "install", "--upgrade", pkg])
            .output()
            .map_err(|e| format!("Error actualizando {}: {}", pkg, e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("Error actualizando {}: {}", pkg, stderr);
        }
    }

    let _ = app.emit(
        "settings:package-update-progress",
        serde_json::json!({
            "message": "Actualización completada",
            "progress": 100.0,
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

    // Paso 1: Desinstalar torch existente
    let _ = app.emit(
        "settings:pytorch-install-progress",
        serde_json::json!({
            "message": "Desinstalando PyTorch existente...",
            "progress": 10.0,
        }),
    );

    let _ = Command::new(&python)
        .args([
            "-m", "pip", "uninstall", "-y", "torch", "torchvision", "torchaudio",
        ])
        .output();

    // Paso 2: Instalar según variante
    let _ = app.emit(
        "settings:pytorch-install-progress",
        serde_json::json!({
            "message": format!("Instalando PyTorch ({})...", if cuda_version == "cpu" { "CPU".to_string() } else { format!("CUDA {}", cuda_version) }),
            "progress": 30.0,
        }),
    );

    let mut args = vec![
        "-m".to_string(),
        "pip".to_string(),
        "install".to_string(),
        "torch".to_string(),
        "torchvision".to_string(),
        "torchaudio".to_string(),
    ];

    match cuda_version.as_str() {
        "cpu" => {
            args.push("--index-url".to_string());
            args.push("https://download.pytorch.org/whl/cpu".to_string());
        }
        "12.1" => {
            args.push("--index-url".to_string());
            args.push("https://download.pytorch.org/whl/cu121".to_string());
        }
        "12.4" => {
            args.push("--index-url".to_string());
            args.push("https://download.pytorch.org/whl/cu124".to_string());
        }
        _ => {
            return Err(format!("Versión CUDA no soportada: {}", cuda_version));
        }
    }

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let output = Command::new(&python)
        .args(&args_ref)
        .output()
        .map_err(|e| format!("Error instalando PyTorch: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Error instalando PyTorch: {}", stderr));
    }

    let _ = app.emit(
        "settings:pytorch-install-progress",
        serde_json::json!({
            "message": "PyTorch instalado correctamente",
            "progress": 100.0,
        }),
    );

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
