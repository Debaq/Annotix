//! Tests de contrato entre el preparador de dataset y el generador de script.
//!
//! Estos tests existen por una razón concreta: al auditar el sistema de
//! entrenamiento (ver `docs/roadmap_train.md`) resultó que 13 de 19 backends no
//! podían entrenar nunca, porque el preparador escribía un layout y el `train.py`
//! generado leía otro. Nadie se enteraba hasta que el proceso Python moría.
//!
//! Cada caso aquí:
//!   1. Prepara un dataset sintético real en disco.
//!   2. Comprueba que **todo lo que el preparador declara existe** de verdad.
//!   3. Genera los scripts y comprueba que sólo piden rutas declaradas, que
//!      incluyen la cabecera de constantes y que compilan como Python.
//!
//! Los backends que hoy siguen rotos están declarados como tales en `Expect`, con
//! la clave que les falta. Son la línea base de las Fases 2 y 3 del plan
//! (`docs/plan_train_fix.md`): cuando se arreglen, este test falla y hay que
//! moverlos a `Expect::Genera` — que es exactamente el aviso que queremos.

use std::path::PathBuf;
use std::process::Command;

use crate::training::contract::{keys, PreparedDataset};
use crate::training::dataset::{self, DatasetSpec};
use crate::training::scripts;
use crate::training::test_fixtures::{fixture, request};
use crate::training::TrainingBackend;

// ─── Verificaciones ─────────────────────────────────────────────────────────

/// Todo lo que el preparador declara tiene que existir en disco. Una declaración
/// que miente es peor que no declarar nada: el generador confiaría en ella.
fn assert_declarado_existe(ds: &PreparedDataset, etiqueta: &str) {
    for key in keys::ALL {
        if !ds.has(key) {
            continue;
        }
        let path = ds.abs(key).expect("clave declarada");
        assert!(
            path.exists(),
            "{etiqueta}: el dataset declara '{key}' → {path:?}, pero no existe en disco"
        );
    }
}

/// El cuerpo del script no puede componer rutas de entrada a mano: todas las
/// rutas del dataset llegan por la cabecera de constantes. Lo único que puede
/// colgar de `dataset_dir` es la salida del entrenamiento.
fn assert_sin_rutas_inventadas(script: &str, etiqueta: &str) {
    const SALIDAS_PERMITIDAS: &[&str] = &["train_output"];
    let mut resto = script;
    while let Some(pos) = resto.find("os.path.join(dataset_dir, \"") {
        let tail = &resto[pos + "os.path.join(dataset_dir, \"".len()..];
        let literal = tail.split('"').next().unwrap_or("");
        assert!(
            SALIDAS_PERMITIDAS.contains(&literal),
            "{etiqueta}: el script compone a mano la ruta de entrada {literal:?}. \
             Debe pedirla al contrato (training/contract.rs) y usar la constante."
        );
        resto = tail;
    }
}

/// Los literales booleanos de Rust son sintaxis válida en Python —un identificador—
/// pero explotan al ejecutarse con `NameError: name 'false' is not defined`. Pasó de
/// verdad: `{multi_label}` capturó el `bool` de Rust en vez del `py_bool`, y
/// `py_compile` no lo ve porque es un error de ejecución, no de sintaxis.
fn assert_sin_booleanos_de_rust(script: &str, etiqueta: &str) {
    for linea in script.lines() {
        let t = linea.trim_end();
        assert!(
            !(t.ends_with("= false") || t.ends_with("= true")),
            "{etiqueta}: el script contiene un booleano de Rust sin convertir: {t:?}. \
             Interpola con py_bool()."
        );
    }
}

/// Intérprete para `py_compile`. Sin él, la comprobación de sintaxis se salta.
fn python_de_pruebas() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("ANNOTIX_TEST_PYTHON") {
        let p = PathBuf::from(p);
        if p.exists() {
            return Some(p);
        }
    }
    let venv = dirs_next_home()?.join(".local/share/annotix/python-env/bin/python");
    venv.exists().then_some(venv)
}

fn dirs_next_home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

fn assert_python_valido(script: &str, etiqueta: &str) {
    let Some(python) = python_de_pruebas() else {
        return; // sin intérprete disponible: el resto de las comprobaciones siguen valiendo
    };
    let tmp = tempfile::tempdir().unwrap();
    let file = tmp.path().join("generado.py");
    std::fs::write(&file, script).unwrap();
    let out = Command::new(python)
        .args(["-m", "py_compile"])
        .arg(&file)
        .output()
        .expect("ejecutar py_compile");
    assert!(
        out.status.success(),
        "{etiqueta}: el script generado no es Python válido:\n{}",
        String::from_utf8_lossy(&out.stderr)
    );
}

/// Qué se espera hoy de cada backend.
#[allow(dead_code)] // FaltaClave queda para el próximo backend que entre a medias
enum Expect {
    /// Genera scripts correctamente.
    Genera,
    /// Sigue roto: el generador pide una clave que el preparador no escribe.
    /// El texto es la clave que falta (Fases 2 y 3 de docs/plan_train_fix.md).
    FaltaClave(&'static str),
}

fn caso(backend: TrainingBackend, task: &str, espera: Expect) {
    let etiqueta = format!("{backend:?}/{task}");
    let (pf, proyecto, images_dir) = fixture(task);
    let salida = proyecto.path().join("job");
    std::fs::create_dir_all(&salida).unwrap();

    let imagenes = dataset::select_trainable_images(pf.images.clone(), &pf.classes);
    let ds = dataset::prepare_dataset_for_backend(
        &images_dir,
        &pf,
        &imagenes,
        &salida,
        DatasetSpec {
            ts: dataset::TsSpec::default(),
            val_split: 0.25,
            test_split: 0.0,
            task,
            backend: &backend,
        },
    )
    .unwrap_or_else(|e| panic!("{etiqueta}: preparar dataset falló: {e}"));

    assert_declarado_existe(&ds, &etiqueta);

    let req = request(backend, task);
    let generado = scripts::generate_train_script_for_backend(&req, &ds);

    match espera {
        Expect::Genera => {
            let archivos =
                generado.unwrap_or_else(|e| panic!("{etiqueta}: generar script falló: {e}"));
            assert!(
                archivos.iter().any(|(n, _)| n == "train.py"),
                "{etiqueta}: no se generó train.py"
            );
            for (nombre, contenido) in &archivos {
                let et = format!("{etiqueta} [{nombre}]");
                assert!(!contenido.trim().is_empty(), "{et}: contenido vacío");
                if nombre.ends_with(".py") {
                    assert_sin_rutas_inventadas(contenido, &et);
                    assert_sin_booleanos_de_rust(contenido, &et);
                    assert_python_valido(contenido, &et);
                }
            }
        }
        Expect::FaltaClave(clave) => {
            let err = generado.err().unwrap_or_else(|| {
                panic!(
                    "{etiqueta}: se esperaba que faltara '{clave}' en el contrato, \
                     pero la generación funcionó. Si el backend ya está arreglado, \
                     muévelo a Expect::Genera."
                )
            });
            assert!(
                err.contains(clave),
                "{etiqueta}: se esperaba un error por '{clave}', pero fue: {err}"
            );
        }
    }
}

// ─── Backends que funcionan ─────────────────────────────────────────────────

#[test]
fn yolo_detect() {
    caso(TrainingBackend::Yolo, "detect", Expect::Genera);
}

#[test]
fn yolo_segment() {
    caso(TrainingBackend::Yolo, "segment", Expect::Genera);
}

#[test]
fn yolo_classify() {
    caso(TrainingBackend::Yolo, "classify", Expect::Genera);
}

#[test]
fn rt_detr_detect() {
    caso(TrainingBackend::RtDetr, "detect", Expect::Genera);
}

#[test]
fn rf_detr_detect() {
    caso(TrainingBackend::RfDetr, "detect", Expect::Genera);
}

#[test]
fn smp_segment() {
    caso(TrainingBackend::Smp, "segment", Expect::Genera);
}

#[test]
fn hf_segmentation_segment() {
    caso(TrainingBackend::HfSegmentation, "segment", Expect::Genera);
}

#[test]
fn timm_classify() {
    caso(TrainingBackend::Timm, "classify", Expect::Genera);
}

#[test]
fn timm_multi_classify() {
    caso(TrainingBackend::Timm, "multi_classify", Expect::Genera);
}

#[test]
fn hf_classification_classify() {
    caso(
        TrainingBackend::HfClassification,
        "classify",
        Expect::Genera,
    );
}

#[test]
fn hf_classification_multi_classify() {
    caso(
        TrainingBackend::HfClassification,
        "multi_classify",
        Expect::Genera,
    );
}

#[test]
fn sklearn_tabular() {
    caso(TrainingBackend::Sklearn, "tabular", Expect::Genera);
}

// ─── Backends HuggingFace de visión ─────────────────────────────────────────

#[test]
fn hf_detection_detect() {
    caso(TrainingBackend::HfDetection, "detect", Expect::Genera);
}

#[test]
fn hf_instance_segment() {
    caso(
        TrainingBackend::HfInstance,
        "instance_segment",
        Expect::Genera,
    );
}

#[test]
fn hf_pose_pose() {
    caso(TrainingBackend::HfPose, "pose", Expect::Genera);
}

#[test]
fn hf_pose_landmarks() {
    caso(TrainingBackend::HfPose, "landmarks", Expect::Genera);
}

// ─── Series temporales ──────────────────────────────────────────────────────

#[test]
fn yolo_obb() {
    // OBB queda sólo con ultralytics: MMRotate se retiró por dependencias muertas.
    caso(TrainingBackend::Yolo, "obb", Expect::Genera);
}

#[test]
fn tsai_ts_classify() {
    caso(TrainingBackend::Tsai, "ts_classify", Expect::Genera);
}

#[test]
fn tsai_ts_forecast() {
    caso(TrainingBackend::Tsai, "ts_forecast", Expect::Genera);
}

#[test]
fn tsai_ts_segment() {
    caso(TrainingBackend::Tsai, "ts_segment", Expect::Genera);
}

#[test]
fn pytorch_forecasting_ts_forecast() {
    caso(
        TrainingBackend::PytorchForecasting,
        "ts_forecast",
        Expect::Genera,
    );
}

#[test]
fn pyod_ts_anomaly() {
    caso(TrainingBackend::Pyod, "ts_anomaly", Expect::Genera);
}

#[test]
fn tslearn_ts_cluster() {
    caso(TrainingBackend::Tslearn, "ts_cluster", Expect::Genera);
}

#[test]
fn pypots_ts_impute() {
    caso(TrainingBackend::Pypots, "ts_impute", Expect::Genera);
}

#[test]
fn stumpy_ts_pattern() {
    caso(TrainingBackend::Stumpy, "ts_pattern", Expect::Genera);
}
