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
    let mut best = None;
    let mut salida = Vec::new();
    let inicio = Instant::now();

    for linea in BufReader::new(stdout).lines().map_while(Result::ok) {
        salida.push(linea.clone());
        if let Some(json) = linea.strip_prefix("ANNOTIX_EVENT:") {
            if let Ok(ev) = serde_json::from_str::<serde_json::Value>(json) {
                match ev["type"].as_str().unwrap_or("") {
                    "epoch" => epocas += 1,
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

    Ok(Resultado {
        epocas,
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
#[ignore = "requiere entorno Python con scikit-learn"]
fn smoke_sklearn_tabular() {
    smoke(TrainingBackend::Sklearn, "tabular");
}

// Los backends de clasificación, series temporales y OpenMMLab todavía no pasan
// el contrato: sus smoke tests se añaden al arreglarlos (Fases 2 y 3 del plan en
// docs/plan_train_fix.md). Añadirlos ahora sólo repetiría lo que ya afirman los
// tests de contrato.
