use std::process::Command;

use super::python_env;
use super::scripts;

/// Exporta un modelo entrenado a un formato específico (ONNX, TensorRT, etc.)
pub fn export_model(model_path: &str, format: &str) -> Result<String, String> {
    let python = python_env::venv_python()?;
    if !python.exists() {
        return Err("Entorno Python no configurado".to_string());
    }

    if !std::path::Path::new(model_path).exists() {
        return Err(format!("Modelo no encontrado: {}", model_path));
    }

    let script = scripts::generate_export_script(model_path, format);

    let mut cmd = Command::new(&python);
    cmd.args(["-c", &script]);
    super::hide_console_window(&mut cmd);
    let output = cmd.output()
        .map_err(|e| format!("Error ejecutando export: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Error exportando modelo: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Buscar la línea ANNOTIX_EVENT con el resultado
    for line in stdout.lines() {
        if let Some(json_str) = line.strip_prefix("ANNOTIX_EVENT:") {
            if let Ok(event) = serde_json::from_str::<serde_json::Value>(json_str) {
                if event["type"].as_str() == Some("export_done") {
                    return event["path"]
                        .as_str()
                        .map(|s| s.to_string())
                        .ok_or("No se obtuvo ruta del modelo exportado".to_string());
                }
            }
        }
    }

    Err("No se recibió resultado de exportación".to_string())
}
