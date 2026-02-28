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
        let result = Command::new(candidate)
            .args(["--version"])
            .output();

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

/// Verifica el estado actual del entorno Python
pub fn check_env() -> Result<PythonEnvStatus, String> {
    let python = venv_python()?;

    if !python.exists() {
        return Ok(PythonEnvStatus {
            installed: false,
            python_path: None,
            ultralytics_version: None,
            torch_version: None,
            cuda_available: false,
        });
    }

    // Verificar ultralytics y torch
    let check_script = r#"
import json
result = {"ultralytics": None, "torch": None, "cuda": False}
try:
    import ultralytics
    result["ultralytics"] = ultralytics.__version__
except ImportError:
    pass
try:
    import torch
    result["torch"] = torch.__version__
    result["cuda"] = torch.cuda.is_available()
except ImportError:
    pass
print(json.dumps(result))
"#;

    let output = Command::new(&python)
        .args(["-c", check_script])
        .output()
        .map_err(|e| format!("Error ejecutando python: {}", e))?;

    if !output.status.success() {
        return Ok(PythonEnvStatus {
            installed: true,
            python_path: Some(python.to_string_lossy().to_string()),
            ultralytics_version: None,
            torch_version: None,
            cuda_available: false,
        });
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let info: serde_json::Value = serde_json::from_str(stdout.trim())
        .unwrap_or_default();

    let ultralytics_version = info["ultralytics"].as_str().map(|s| s.to_string());
    let torch_version = info["torch"].as_str().map(|s| s.to_string());
    let cuda_available = info["cuda"].as_bool().unwrap_or(false);
    let installed = ultralytics_version.is_some();

    Ok(PythonEnvStatus {
        installed,
        python_path: Some(python.to_string_lossy().to_string()),
        ultralytics_version,
        torch_version,
        cuda_available,
    })
}

/// Crea el virtualenv e instala ultralytics
pub fn setup_env<F: Fn(&str, f64)>(emit_progress: F) -> Result<PythonEnvStatus, String> {
    let system_python = find_system_python()
        .ok_or("No se encontró Python 3 en el sistema. Por favor instala Python 3.10+ primero.")?;

    let venv = venv_dir()?;

    emit_progress("Creando entorno virtual...", 10.0);

    // Crear venv
    let output = Command::new(&system_python)
        .args(["-m", "venv", &venv.to_string_lossy()])
        .output()
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
    let output = Command::new(&python)
        .args(["-m", "pip", "install", "--upgrade", "pip"])
        .output()
        .map_err(|e| format!("Error actualizando pip: {}", e))?;

    if !output.status.success() {
        log::warn!("pip upgrade falló, continuando...");
    }

    emit_progress("Instalando ultralytics (esto puede tardar unos minutos)...", 30.0);

    // Install ultralytics (trae torch como dependencia)
    let output = Command::new(&python)
        .args(["-m", "pip", "install", "ultralytics"])
        .output()
        .map_err(|e| format!("Error instalando ultralytics: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Error instalando ultralytics: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    emit_progress("Verificando instalación...", 90.0);

    let status = check_env()?;

    emit_progress("Entorno listo", 100.0);

    Ok(status)
}
