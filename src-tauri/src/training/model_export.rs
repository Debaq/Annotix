use std::path::Path;
use std::process::Command;

use super::python_env;
use super::scripts;

/// Exporta un modelo entrenado a otro formato.
///
/// Sólo ultralytics tiene un exportador universal (`YOLO(...).export()`), y esto lo
/// aplicaba a todo: con un `best.pth` de SMP, un directorio de HuggingFace o un
/// `.joblib` de sklearn, fallaba con un error de ultralytics que no explicaba nada.
///
/// Para el resto de los backends el propio script de entrenamiento ya escribe un
/// ONNX junto al modelo, así que aquí se localiza en vez de reexportar: reconstruir
/// la arquitectura fuera del script exigiría duplicar su definición.
pub fn export_model(model_path: &str, format: &str) -> Result<String, String> {
    let ruta = Path::new(model_path);
    if !ruta.exists() {
        return Err(format!("Modelo no encontrado: {}", model_path));
    }

    if es_ultralytics(ruta) {
        return exportar_con_ultralytics(model_path, format);
    }

    if format.eq_ignore_ascii_case("onnx") {
        if let Some(onnx) = buscar_onnx(ruta) {
            return Ok(onnx);
        }
        return Err(
            "Este backend exporta el ONNX al terminar el entrenamiento y no se encontró \
             junto al modelo. Vuelve a entrenar con la exportación activada."
                .to_string(),
        );
    }

    Err(format!(
        "La exportación a {} sólo está disponible para modelos de ultralytics \
         (YOLO y RT-DETR). Este backend entrega el modelo en su formato nativo y un ONNX.",
        format.to_uppercase()
    ))
}

/// `true` si el archivo es un checkpoint de ultralytics (`.pt`).
fn es_ultralytics(ruta: &Path) -> bool {
    ruta.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("pt"))
        .unwrap_or(false)
}

/// ONNX que el script de entrenamiento dejó junto al modelo.
fn buscar_onnx(modelo: &Path) -> Option<String> {
    let dir = if modelo.is_dir() {
        modelo
    } else {
        modelo.parent()?
    };
    for candidato in ["model.onnx", "best.onnx"] {
        let ruta = dir.join(candidato);
        if ruta.exists() {
            return Some(ruta.to_string_lossy().to_string());
        }
    }
    // Cualquier .onnx del directorio de resultados.
    std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("onnx"))
                .unwrap_or(false)
        })
        .map(|p| p.to_string_lossy().to_string())
}

fn exportar_con_ultralytics(model_path: &str, format: &str) -> Result<String, String> {
    let python = python_env::venv_python()?;
    if !python.exists() {
        return Err("Entorno Python no configurado".to_string());
    }

    let script = scripts::generate_export_script(model_path, format);

    let mut cmd = Command::new(&python);
    cmd.args(["-c", &script]);
    super::hide_console_window(&mut cmd);
    let output = cmd
        .output()
        .map_err(|e| format!("Error ejecutando export: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Error exportando modelo: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconoce_los_checkpoints_de_ultralytics() {
        assert!(es_ultralytics(Path::new("/x/weights/best.pt")));
        assert!(!es_ultralytics(Path::new("/x/train_output/best.pth")));
        assert!(!es_ultralytics(Path::new("/x/train_output/best")));
    }

    #[test]
    fn encuentra_el_onnx_que_dejo_el_script() {
        let tmp = tempfile::tempdir().unwrap();
        let modelo = tmp.path().join("best.pth");
        std::fs::write(&modelo, b"x").unwrap();
        std::fs::write(tmp.path().join("model.onnx"), b"x").unwrap();

        let encontrado = buscar_onnx(&modelo).expect("debería encontrar el onnx");
        assert!(encontrado.ends_with("model.onnx"));
    }

    #[test]
    fn formato_no_soportado_explica_por_que() {
        let tmp = tempfile::tempdir().unwrap();
        let modelo = tmp.path().join("best.pth");
        std::fs::write(&modelo, b"x").unwrap();

        let err = export_model(&modelo.to_string_lossy(), "tensorrt").unwrap_err();
        assert!(err.contains("ultralytics"), "{err}");
    }

    #[test]
    fn onnx_ausente_lo_dice_claro() {
        let tmp = tempfile::tempdir().unwrap();
        let modelo = tmp.path().join("best.pth");
        std::fs::write(&modelo, b"x").unwrap();

        let err = export_model(&modelo.to_string_lossy(), "onnx").unwrap_err();
        assert!(err.contains("ONNX"), "{err}");
    }
}
