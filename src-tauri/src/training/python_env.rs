use std::path::PathBuf;
use std::process::Command;

use super::PythonEnvStatus;

/// Obtiene la ruta del directorio del virtualenv
pub fn venv_dir() -> Result<PathBuf, String> {
    let base_dir = directories::ProjectDirs::from("com", "tecmedhub", "annotix")
        .ok_or("No se pudo determinar el directorio de datos")?;
    Ok(base_dir.data_dir().join("python-env"))
}

/// Ruta al ejecutable python dentro del venv
pub fn venv_python() -> Result<PathBuf, String> {
    let venv = venv_dir()?;
    if cfg!(target_os = "windows") {
        Ok(venv.join("Scripts").join("python.exe"))
    } else {
        Ok(venv.join("bin").join("python"))
    }
}

/// Busca un python3 del sistema en PATH
pub fn find_system_python() -> Option<String> {
    let candidates = if cfg!(target_os = "windows") {
        vec!["python", "python3"]
    } else {
        vec!["python3", "python3.12", "python3.11", "python3.10", "python"]
    };

    for candidate in candidates {
        let mut cmd = Command::new(candidate);
        cmd.args(["--version"]);
        super::hide_console_window(&mut cmd);
        let result = cmd.output();

        if let Ok(output) = result {
            if output.status.success() {
                let version_str = String::from_utf8_lossy(&output.stdout);
                // Verificar que es Python 3.x
                if version_str.contains("Python 3.") {
                    return Some(candidate.to_string());
                }
            }
        }
    }
    None
}

/// Verifica el estado del entorno Python Y detecta GPU en un solo proceso
pub fn check_env_full() -> Result<(PythonEnvStatus, super::GpuInfo), String> {
    let python = venv_python()?;

    let no_env = PythonEnvStatus {
        installed: false,
        python_path: None,
        ultralytics_version: None,
        torch_version: None,
        cuda_available: false,
        rfdetr_version: None,
        mmdet_version: None,
    };
    let no_gpu = super::GpuInfo {
        cuda_available: false,
        cuda_version: None,
        gpus: vec![],
        mps_available: false,
    };

    if !python.exists() {
        return Ok((no_env, no_gpu));
    }

    // Un solo script que recopila env + GPU info + extra backends
    let check_script = r#"
import json
result = {
    "ultralytics": None, "torch": None, "cuda": False,
    "cuda_version": None, "gpus": [], "mps_available": False,
    "rfdetr": None, "mmdet": None
}
try:
    import ultralytics
    result["ultralytics"] = ultralytics.__version__
except ImportError:
    pass
try:
    import rfdetr
    result["rfdetr"] = getattr(rfdetr, "__version__", "installed")
except ImportError:
    pass
try:
    import mmdet
    result["mmdet"] = mmdet.__version__
except ImportError:
    pass
try:
    import torch
    result["torch"] = torch.__version__
    result["cuda"] = torch.cuda.is_available()
    if result["cuda"]:
        result["cuda_version"] = torch.version.cuda
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            result["gpus"].append({
                "index": i,
                "name": props.name,
                "memory_total": props.total_mem,
                "memory_free": props.total_mem
            })
    if hasattr(torch.backends, "mps"):
        result["mps_available"] = torch.backends.mps.is_available()
except ImportError:
    pass
print(json.dumps(result))
"#;

    let mut cmd = Command::new(&python);
    cmd.args(["-c", check_script]);
    super::hide_console_window(&mut cmd);
    let output = cmd.output()
        .map_err(|e| format!("Error ejecutando python: {}", e))?;

    if !output.status.success() {
        let env = PythonEnvStatus {
            installed: true,
            python_path: Some(python.to_string_lossy().to_string()),
            ultralytics_version: None,
            torch_version: None,
            cuda_available: false,
            rfdetr_version: None,
            mmdet_version: None,
        };
        return Ok((env, no_gpu));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let info: serde_json::Value = serde_json::from_str(stdout.trim())
        .unwrap_or_default();

    let ultralytics_version = info["ultralytics"].as_str().map(|s| s.to_string());
    let torch_version = info["torch"].as_str().map(|s| s.to_string());
    let cuda_available = info["cuda"].as_bool().unwrap_or(false);
    let rfdetr_version = info["rfdetr"].as_str().map(|s| s.to_string());
    let mmdet_version = info["mmdet"].as_str().map(|s| s.to_string());
    let installed = ultralytics_version.is_some();

    let env = PythonEnvStatus {
        installed,
        python_path: Some(python.to_string_lossy().to_string()),
        ultralytics_version,
        torch_version,
        cuda_available,
        rfdetr_version,
        mmdet_version,
    };

    let cuda_version = info["cuda_version"].as_str().map(|s| s.to_string());
    let mps_available = info["mps_available"].as_bool().unwrap_or(false);
    let gpus = info["gpus"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|g| {
                    Some(super::GpuDevice {
                        index: g["index"].as_u64()? as u32,
                        name: g["name"].as_str()?.to_string(),
                        memory_total: g["memory_total"].as_u64().unwrap_or(0),
                        memory_free: g["memory_free"].as_u64().unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    let gpu = super::GpuInfo {
        cuda_available,
        cuda_version,
        gpus,
        mps_available,
    };

    Ok((env, gpu))
}

/// Instala paquetes extra en el venv existente
pub fn install_packages(packages: &[&str]) -> Result<(), String> {
    let python = venv_python()?;
    if !python.exists() {
        return Err("Entorno Python no configurado".to_string());
    }

    for pkg in packages {
        let mut cmd = Command::new(&python);
        // For mmcv/mmdet we use mim install
        if *pkg == "mmcv" || *pkg == "mmdet" || *pkg == "mmengine" {
            cmd = Command::new(&python);
            cmd.args(["-m", "mim", "install", pkg]);
        } else {
            cmd.args(["-m", "pip", "install", pkg]);
        }
        super::hide_console_window(&mut cmd);
        let output = cmd.output()
            .map_err(|e| format!("Error instalando {}: {}", pkg, e))?;

        if !output.status.success() {
            return Err(format!(
                "Error instalando {}: {}",
                pkg,
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }

    Ok(())
}

/// Checks if a Python package is installed in the venv
pub fn is_package_installed(name: &str) -> bool {
    let python = match venv_python() {
        Ok(p) => p,
        Err(_) => return false,
    };
    if !python.exists() {
        return false;
    }

    let script = format!(
        "try:\n    import {}\n    print('yes')\nexcept ImportError:\n    print('no')",
        name
    );
    let mut cmd = Command::new(&python);
    cmd.args(["-c", &script]);
    super::hide_console_window(&mut cmd);
    match cmd.output() {
        Ok(output) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim() == "yes"
        }
        _ => false,
    }
}

/// Crea el virtualenv e instala ultralytics
pub fn setup_env<F: Fn(&str, f64)>(emit_progress: F) -> Result<(), String> {
    let system_python = find_system_python()
        .ok_or("No se encontró Python 3 en el sistema. Por favor instala Python 3.10+ primero.")?;

    let venv = venv_dir()?;

    emit_progress("Creando entorno virtual...", 10.0);

    // Crear venv
    let mut cmd = Command::new(&system_python);
    cmd.args(["-m", "venv", &venv.to_string_lossy()]);
    super::hide_console_window(&mut cmd);
    let output = cmd.output()
        .map_err(|e| format!("Error creando venv: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Error creando virtualenv: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let python = venv_python()?;

    emit_progress("Actualizando pip...", 20.0);

    // Upgrade pip
    let mut cmd = Command::new(&python);
    cmd.args(["-m", "pip", "install", "--upgrade", "pip"]);
    super::hide_console_window(&mut cmd);
    let output = cmd.output()
        .map_err(|e| format!("Error actualizando pip: {}", e))?;

    if !output.status.success() {
        log::warn!("pip upgrade falló, continuando...");
    }

    emit_progress("Instalando ultralytics (esto puede tardar unos minutos)...", 30.0);

    // Install ultralytics (trae torch como dependencia)
    let mut cmd = Command::new(&python);
    cmd.args(["-m", "pip", "install", "ultralytics"]);
    super::hide_console_window(&mut cmd);
    let output = cmd.output()
        .map_err(|e| format!("Error instalando ultralytics: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Error instalando ultralytics: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    emit_progress("Entorno listo", 100.0);

    Ok(())
}
