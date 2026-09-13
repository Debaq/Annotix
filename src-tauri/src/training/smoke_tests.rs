//! Smoke tests de entrenamiento: corren de verdad el `train.py` generado.
//!
//! Los tests de contrato (`contract_tests.rs`) verifican que las rutas cuadran,
//! pero no que la librería de cada backend se comporte como el script espera
//! (nombres de argumentos, callbacks, métricas). Eso sólo lo dice una corrida real.
//!
//! Están marcados `#[ignore]` porque necesitan el entorno Python de Annotix con el
//! backend instalado y tardan minutos. Se ejecutan con:
//!
//! ```sh
//! scripts/train_smoke.sh            # todos
//! scripts/train_smoke.sh yolo       # uno
//! ```
//!
//! Criterio de éxito, el mismo para todos los backends:
//!   1. el proceso termina con código 0,
//!   2. emitió al menos un `ANNOTIX_EVENT` de época (el gráfico en vivo funciona),
//!   3. emitió `completed` con un `bestModelPath` que existe en disco.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::training::dataset::{self, DatasetSpec};
use crate::training::scripts;
use crate::training::test_fixtures::{fixture, request};
use crate::training::TrainingBackend;

/// Tiempo máximo por corrida. En CPU con 4 imágenes de 64×64 y 2 épocas sobra,
/// pero la primera vez puede incluir la descarga de los pesos preentrenados.
const TIMEOUT: Duration = Duration::from_secs(900);

fn python() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ANNOTIX_TEST_PYTHON") {
        let p = PathBuf::from(p);
        if p.exists() {
            return Some(p);
        }
    }
    let home = std::env::var_os("HOME").map(PathBuf::from)?;
    let venv = home.join(".local/share/annotix/python-env/bin/python");
    venv.exists().then_some(venv)
}

struct Resultado {
    epocas: usize,
    /// Épocas que además traían métricas: sin esto el gráfico dibuja una línea vacía.
    epocas_con_metricas: usize,
    best: Option<String>,
    salida: Vec<String>,
}

fn correr(script_dir: &Path, python: &Path) -> Result<Resultado, String> {
    let mut child = Command::new(python)
        .args(["-u", "train.py"])
        .current_dir(script_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("no se pudo lanzar python: {e}"))?;

    let stdout = child.stdout.take().expect("stdout");
    let stderr = child.stderr.take().expect("stderr");
    let err_handle = std::thread::spawn(move || {
        BufReader::new(stderr)
            .lines()
            .map_while(Result::ok)
            .collect::<Vec<_>>()
    });

    let mut epocas = 0usize;
    let mut epocas_con_metricas = 0usize;
    let mut eventos_invalidos: Vec<String> = Vec::new();
    let mut best = None;
    let mut salida = Vec::new();
    let inicio = Instant::now();

    for linea in BufReader::new(stdout).lines().map_while(Result::ok) {
        salida.push(linea.clone());
        // Igual que el runner: el marcador puede venir pegado a una barra de progreso.
        if let Some(json) = linea
            .find("ANNOTIX_EVENT:")
            .map(|pos| &linea[pos + "ANNOTIX_EVENT:".len()..])
        {
            if serde_json::from_str::<serde_json::Value>(json).is_err() {
                // Un evento que no parsea es invisible para el runner: normalmente
                // son `Infinity`/`NaN`, que json.dumps escribe y JSON no admite.
                eventos_invalidos.push(json.chars().take(160).collect::<String>());
            }
            if let Ok(ev) = serde_json::from_str::<serde_json::Value>(json) {
                match ev["type"].as_str().unwrap_or("") {
                    "epoch" => {
                        epocas += 1;
                        let con_valores = ev["metrics"]
                            .as_object()
                            .map(|m| m.values().any(|v| v.is_number()))
                            .unwrap_or(false);
                        if con_valores {
                            epocas_con_metricas += 1;
                        }
                    }
                    "completed" => {
                        best = ev["bestModelPath"].as_str().map(|s| s.to_string());
                    }
                    _ => {}
                }
            }
        }
        if inicio.elapsed() > TIMEOUT {
            let _ = child.kill();
            return Err(format!("timeout tras {:?}", inicio.elapsed()));
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    let errores = err_handle.join().unwrap_or_default();
    salida.extend(errores.iter().cloned());

    if !status.success() {
        let cola: Vec<&String> = salida.iter().rev().take(25).collect();
        return Err(format!(
            "el entrenamiento salió con {:?}. Últimas líneas:\n{}",
            status.code(),
            cola.iter()
                .rev()
                .map(|l| l.as_str())
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    if !eventos_invalidos.is_empty() {
        return Err(format!(
            "emitió {} evento(s) con JSON inválido, que el runner descarta en \
             silencio. Primero: {}",
            eventos_invalidos.len(),
            eventos_invalidos[0]
        ));
    }

    Ok(Resultado {
        epocas,
        epocas_con_metricas,
        best,
        salida,
    })
}

/// Prepara dataset + genera script + entrena, y verifica el criterio de éxito.
fn smoke(backend: TrainingBackend, task: &str) {
    let Some(python) = python() else {
        panic!(
            "sin intérprete Python: instala el entorno de Annotix o exporta \
             ANNOTIX_TEST_PYTHON=/ruta/al/python"
        );
    };
    let etiqueta = format!("{backend:?}/{task}");

    let (pf, proyecto, images_dir) = fixture(task);
    let job = proyecto.path().join("job");
    std::fs::create_dir_all(&job).unwrap();

    let imagenes = dataset::select_trainable_images(pf.images.clone(), &pf.classes);
    let ds = dataset::prepare_dataset_for_backend(
        &images_dir,
        &pf,
        &imagenes,
        &job,
        DatasetSpec {
            ts: dataset::TsSpec::default(),
            val_split: 0.25,
            test_split: 0.0,
            task,
            backend: &backend,
        },
    )
    .unwrap_or_else(|e| panic!("{etiqueta}: preparar dataset falló: {e}"));

    let req = request(backend, task);
    let archivos = scripts::generate_train_script_for_backend(&req, &ds)
        .unwrap_or_else(|e| panic!("{etiqueta}: generar script falló: {e}"));
    for (nombre, contenido) in &archivos {
        std::fs::write(job.join(nombre), contenido).unwrap();
    }

    let res = correr(&job, &python).unwrap_or_else(|e| panic!("{etiqueta}: {e}"));

    assert!(
        res.epocas > 0,
        "{etiqueta}: no emitió ningún evento de época, así que el gráfico en vivo \
         quedaría vacío. Salida:\n{}",
        res.salida.join("\n")
    );
    assert!(
        res.epocas_con_metricas > 0,
        "{etiqueta}: emitió {} épocas pero ninguna con métricas numéricas, así que el \
         gráfico quedaría en blanco. Salida:\n{}",
        res.epocas,
        res.salida.join("\n")
    );
    let best = res.best.unwrap_or_else(|| {
        panic!(
            "{etiqueta}: terminó sin evento 'completed' con bestModelPath. Salida:\n{}",
            res.salida.join("\n")
        )
    });
    assert!(
        Path::new(&best).exists(),
        "{etiqueta}: bestModelPath apunta a {best}, que no existe"
    );
}

// ─── Un test por backend ────────────────────────────────────────────────────

#[test]
#[ignore = "requiere entorno Python con ultralytics"]
fn smoke_yolo_detect() {
    smoke(TrainingBackend::Yolo, "detect");
}

#[test]
#[ignore = "requiere entorno Python con ultralytics"]
fn smoke_yolo_segment() {
    smoke(TrainingBackend::Yolo, "segment");
}

#[test]
#[ignore = "requiere entorno Python con ultralytics"]
fn smoke_yolo_classify() {
    smoke(TrainingBackend::Yolo, "classify");
}

#[test]
#[ignore = "requiere entorno Python con ultralytics"]
fn smoke_rt_detr_detect() {
    smoke(TrainingBackend::RtDetr, "detect");
}

#[test]
#[ignore = "requiere entorno Python con rfdetr"]
fn smoke_rf_detr_detect() {
    smoke(TrainingBackend::RfDetr, "detect");
}

#[test]
#[ignore = "requiere entorno Python con segmentation-models-pytorch"]
fn smoke_smp_segment() {
    smoke(TrainingBackend::Smp, "segment");
}

#[test]
#[ignore = "requiere entorno Python con transformers"]
fn smoke_hf_segmentation_segment() {
    smoke(TrainingBackend::HfSegmentation, "segment");
}

#[test]
#[ignore = "requiere entorno Python con timm"]
fn smoke_timm_classify() {
    smoke(TrainingBackend::Timm, "classify");
}

#[test]
#[ignore = "requiere entorno Python con timm"]
fn smoke_timm_multi_classify() {
    smoke(TrainingBackend::Timm, "multi_classify");
}

#[test]
#[ignore = "requiere entorno Python con transformers"]
fn smoke_hf_classification() {
    smoke(TrainingBackend::HfClassification, "classify");
}

#[test]
#[ignore = "requiere entorno Python con transformers"]
fn smoke_hf_classification_multi() {
    smoke(TrainingBackend::HfClassification, "multi_classify");
}

#[test]
#[ignore = "requiere entorno Python con scikit-learn"]
fn smoke_sklearn_tabular() {
    smoke(TrainingBackend::Sklearn, "tabular");
}

#[test]
#[ignore = "requiere entorno Python con tsai"]
fn smoke_tsai_ts_classify() {
    smoke(TrainingBackend::Tsai, "ts_classify");
}

#[test]
#[ignore = "requiere entorno Python con tsai"]
fn smoke_tsai_ts_forecast() {
    smoke(TrainingBackend::Tsai, "ts_forecast");
}

#[test]
#[ignore = "requiere entorno Python con pytorch-forecasting"]
fn smoke_pytorch_forecasting() {
    smoke(TrainingBackend::PytorchForecasting, "ts_forecast");
}

#[test]
#[ignore = "requiere entorno Python con pyod"]
fn smoke_pyod_ts_anomaly() {
    smoke(TrainingBackend::Pyod, "ts_anomaly");
}

#[test]
#[ignore = "requiere entorno Python con tslearn"]
fn smoke_tslearn_ts_cluster() {
    smoke(TrainingBackend::Tslearn, "ts_cluster");
}

#[test]
#[ignore = "requiere entorno Python con pypots"]
fn smoke_pypots_ts_impute() {
    smoke(TrainingBackend::Pypots, "ts_impute");
}

#[test]
#[ignore = "requiere entorno Python con stumpy"]
fn smoke_stumpy_ts_pattern() {
    smoke(TrainingBackend::Stumpy, "ts_pattern");
}

#[test]
#[ignore = "requiere entorno Python con transformers"]
fn smoke_hf_detection() {
    smoke(TrainingBackend::HfDetection, "detect");
}

#[test]
#[ignore = "requiere entorno Python con transformers"]
fn smoke_hf_instance() {
    smoke(TrainingBackend::HfInstance, "instance_segment");
}

#[test]
#[ignore = "requiere entorno Python con timm"]
fn smoke_hf_pose() {
    smoke(TrainingBackend::HfPose, "pose");
}

#[test]
#[ignore = "requiere entorno Python con timm"]
fn smoke_hf_pose_landmarks() {
    smoke(TrainingBackend::HfPose, "landmarks");
}
