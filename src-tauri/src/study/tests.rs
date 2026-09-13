//! Pruebas del modo estudio.
//!
//! El escritor es un singleton de proceso, así que los tests que abren una
//! sesión se serializan con `TEST_LOCK`.

use std::sync::{Mutex, MutexGuard, OnceLock};

use serde_json::{json, Value};

use super::events;
use super::export;
use super::log;
use super::verify;

fn test_lock() -> MutexGuard<'static, ()> {
    static L: OnceLock<Mutex<()>> = OnceLock::new();
    // Un panic en un test previo no debe envenenar al resto.
    match L.get_or_init(|| Mutex::new(())).lock() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn temp_dir(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "annotix-study-{}-{}",
        tag,
        uuid::Uuid::new_v4().simple()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

// ─── Escritor ───────────────────────────────────────────────────────────────

#[test]
fn desactivado_no_escribe_nada() {
    let _g = test_lock();
    let dir = temp_dir("off");
    log::reset_for_test(&dir);

    assert!(!log::is_active());
    log::emit(events::PROJECT_OPEN, json!({"project_kind":"image","modality":"image_bbox"}))
        .expect("emit apagado debe ser un no-op exitoso");

    let n = std::fs::read_dir(&dir).unwrap().count();
    assert_eq!(n, 0, "no debe crearse ningún archivo con el modo apagado");
}

#[test]
fn diez_mil_eventos_sin_perdida_ni_desorden() {
    let _g = test_lock();
    let dir = temp_dir("bulk");
    log::reset_for_test(&dir);

    let path = log::start_session("bulk-session", "A", 1920, 1080).unwrap();
    for i in 0..10_000u64 {
        log::emit(events::TRAIN_EPOCH, json!({"epoch": i, "duration_ms": 1, "mem_peak_mb": 0}))
            .unwrap();
    }
    log::end_session("user");

    let content = std::fs::read_to_string(&path).unwrap();
    let lines: Vec<&str> = content.lines().collect();
    // session.start + 10 000 + session.end
    assert_eq!(lines.len(), 10_002);

    for (i, line) in lines.iter().enumerate() {
        let v: Value = serde_json::from_str(line).unwrap();
        assert_eq!(v["seq"].as_u64().unwrap(), i as u64, "seq fuera de orden");
    }
}

#[test]
fn cadena_de_hash_valida_y_detecta_edicion() {
    let _g = test_lock();
    let dir = temp_dir("hash");
    log::reset_for_test(&dir);

    let path = log::start_session("hash-session", "B", 800, 600).unwrap();
    log::emit(events::TOOL_SELECT, json!({"tool_id":"bbox","modality":"image_bbox"})).unwrap();
    log::emit(
        events::ANNOT_COMMIT,
        json!({"tool_id":"bbox","modality":"image_bbox","origin":"manual","duration_ms":1200,"n_edits":2}),
    )
    .unwrap();
    log::end_session("user");

    let report = verify::verify_file(&path).unwrap();
    assert!(report.valid, "errores: {:?}", report.errors);
    assert_eq!(report.n_events, 4);
    assert!(!report.truncated_tail);
    assert_eq!(report.session_id.as_deref(), Some("hash-session"));

    // Editar un valor del payload rompe el hash de esa línea.
    let content = std::fs::read_to_string(&path).unwrap();
    let tampered = content.replacen("\"n_edits\":2", "\"n_edits\":9", 1);
    assert_ne!(tampered, content);
    let bad = dir.join("tampered.jsonl");
    std::fs::write(&bad, tampered).unwrap();

    let report = verify::verify_file(&bad).unwrap();
    assert!(!report.valid, "la edición debió detectarse");
}

#[test]
fn cadena_detecta_linea_borrada() {
    let _g = test_lock();
    let dir = temp_dir("gap");
    log::reset_for_test(&dir);

    let path = log::start_session("gap-session", "", 800, 600).unwrap();
    for _ in 0..3 {
        log::emit(events::IDLE_START, json!({})).unwrap();
    }
    log::end_session("user");

    let content = std::fs::read_to_string(&path).unwrap();
    let mut lines: Vec<&str> = content.lines().collect();
    lines.remove(2);
    let bad = dir.join("gap.jsonl");
    std::fs::write(&bad, format!("{}\n", lines.join("\n"))).unwrap();

    let report = verify::verify_file(&bad).unwrap();
    assert!(!report.valid);
    assert!(report.errors.iter().any(|e| e.contains("prev_hash")));
    assert!(report.errors.iter().any(|e| e.contains("seq")));
}

#[test]
fn cierre_abrupto_deja_lineas_completas() {
    let _g = test_lock();
    let dir = temp_dir("crash");
    log::reset_for_test(&dir);

    let path = log::start_session("crash-session", "", 100, 100).unwrap();
    for i in 0..50u64 {
        log::emit(events::STEP_ENTER, json!({"step_id":"annotate","modality":"image_bbox", "n": i}))
            .unwrap();
    }
    // Muerte del proceso: no se emite session.end ni se cierra ordenadamente.
    log::abort_session_for_test();

    let content = std::fs::read_to_string(&path).unwrap();
    assert!(content.ends_with('\n'), "la última línea quedó a medio escribir");
    for line in content.lines() {
        serde_json::from_str::<Value>(line).expect("línea truncada");
    }
    let report = verify::verify_file(&path).unwrap();
    assert!(report.valid, "errores: {:?}", report.errors);
    assert_eq!(report.n_events, 51);
}

#[test]
fn cola_truncada_se_informa_sin_invalidar_lo_anterior() {
    let _g = test_lock();
    let dir = temp_dir("tail");
    log::reset_for_test(&dir);

    let path = log::start_session("tail-session", "", 100, 100).unwrap();
    log::emit(events::IDLE_START, json!({})).unwrap();
    log::abort_session_for_test();

    let mut content = std::fs::read_to_string(&path).unwrap();
    content.push_str("{\"session_id\":\"tail-sess");
    let bad = dir.join("tail.jsonl");
    std::fs::write(&bad, content).unwrap();

    let report = verify::verify_file(&bad).unwrap();
    assert!(report.truncated_tail);
    assert!(report.valid, "errores: {:?}", report.errors);
    assert_eq!(report.n_events, 2);
}

// ─── Validación ─────────────────────────────────────────────────────────────

#[test]
fn evento_fuera_de_taxonomia_se_rechaza() {
    let _g = test_lock();
    let dir = temp_dir("tax");
    log::reset_for_test(&dir);
    log::start_session("tax-session", "", 10, 10).unwrap();

    let err = log::emit("annot.invented", json!({})).unwrap_err();
    assert!(err.contains("taxonomía"));
    log::end_session("user");
}

#[test]
fn payload_con_ruta_o_texto_largo_se_rechaza() {
    let _g = test_lock();
    let dir = temp_dir("guard");
    log::reset_for_test(&dir);
    log::start_session("guard-session", "", 10, 10).unwrap();

    let err = log::emit(events::EXPORT_START, json!({"format": "/home/u/data.zip"})).unwrap_err();
    assert!(err.contains("rutas"), "{}", err);

    let long = "x".repeat(200);
    let err = log::emit(events::ERROR_SHOWN, json!({"error_class": long, "scope": "export"}))
        .unwrap_err();
    assert!(err.contains("texto"), "{}", err);
    log::end_session("user");
}

#[test]
fn session_id_y_condition_validan() {
    assert!(log::validate_session_id("ab").is_err());
    assert!(log::validate_session_id(&"a".repeat(33)).is_err());
    assert!(log::validate_session_id("con espacio").is_err());
    assert!(log::validate_session_id("p01-cond-a").is_ok());
    assert!(log::validate_condition(&"c".repeat(33)).is_err());
    assert!(log::validate_condition("").is_ok());
}

// ─── Exportación ────────────────────────────────────────────────────────────

#[test]
fn exportacion_copia_archivos_y_escribe_manifiesto() {
    let _g = test_lock();
    let dir = temp_dir("export");
    log::reset_for_test(&dir);

    log::start_session("exp-session", "cond-x", 100, 100).unwrap();
    log::emit(events::HELP_OPEN, json!({"topic_id": "training"})).unwrap();
    log::end_session("user");

    let dest = temp_dir("export-dest");
    let res = export::export_session("exp-session", &dest).unwrap();
    assert_eq!(res.files.len(), 1);

    let manifest: Value =
        serde_json::from_str(&std::fs::read_to_string(dest.join("manifest.json")).unwrap())
            .unwrap();
    assert_eq!(manifest["session_id"], "exp-session");
    assert_eq!(manifest["condition"], "cond-x");
    assert_eq!(manifest["n_events"], 3);
    assert_eq!(manifest["files"][0]["verify"]["valid"], true);
    assert!(manifest["files"][0]["sha256"].as_str().unwrap().len() == 64);

    // El manifiesto no arrastra nada más que lo especificado.
    let keys: Vec<&String> = manifest.as_object().unwrap().keys().collect();
    assert_eq!(
        keys,
        vec!["app_version", "condition", "files", "n_events", "session_id", "t_mono_ms_last"]
    );
}

/// Comprueba que la herramienta de análisis en Python lee y valida un archivo
/// escrito por el escritor de Rust. Es la única prueba que cruza las dos
/// implementaciones del formato; si `python3` no está, se salta.
#[test]
fn el_analizador_python_valida_un_archivo_real() {
    let _g = test_lock();
    let dir = temp_dir("cross");
    log::reset_for_test(&dir);

    let path = log::start_session("cross-session", "cond-1", 1280, 800).unwrap();
    log::emit(events::TOOL_SELECT, json!({"tool_id":"bbox","modality":"image_bbox"})).unwrap();
    log::emit(
        events::ANNOT_COMMIT,
        json!({"tool_id":"bbox","modality":"image_bbox","origin":"manual","duration_ms":1200,"n_edits":2}),
    )
    .unwrap();
    log::emit(events::EXPORT_END, json!({"ok": true, "format": "onnx", "contract_valid": true}))
        .unwrap();
    log::end_session("user");

    let tool_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("tools/study_analysis");

    let out = std::process::Command::new("python3")
        .arg("-c")
        .arg(
            "import sys, json; sys.path.insert(0, sys.argv[1]); import analyze; \
             from pathlib import Path; \
             events, valid = analyze.read_session(Path(sys.argv[2])); \
             print(json.dumps({'valid': valid, 'n': len(events), \
             'row': analyze.session_metrics(Path(sys.argv[2]))['completed_cycle']}))",
        )
        .arg(&tool_dir)
        .arg(&path)
        .output();

    let Ok(out) = out else {
        eprintln!("python3 no disponible: se salta la verificación cruzada");
        return;
    };
    if !out.status.success() {
        panic!(
            "el analizador de Python falló: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
    let parsed: Value = serde_json::from_slice(&out.stdout).unwrap();
    assert_eq!(parsed["valid"], true, "Python no validó la cadena de hash");
    assert_eq!(parsed["n"], 5);
    assert_eq!(parsed["row"], true);
}

// ─── Sincronía entre fuentes ────────────────────────────────────────────────

fn repo_file(rel: &str) -> String {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join(rel);
    std::fs::read_to_string(&root).unwrap_or_else(|e| panic!("{}: {}", root.display(), e))
}

/// Extrae los literales de una lista `const X = [...] as const;` de TypeScript.
fn ts_list(src: &str, name: &str) -> Vec<String> {
    let start = src
        .find(&format!("const {} = [", name))
        .unwrap_or_else(|| panic!("no se encontró {} en el espejo TS", name));
    let rest = &src[start..];
    let end = rest.find(']').expect("lista TS sin cerrar");
    rest[..end]
        .split('\'')
        .skip(1)
        .step_by(2)
        .map(String::from)
        .collect()
}

#[test]
fn los_pasos_declarados_validan() {
    for step in events::STEP_IDS {
        assert!(events::is_valid_step(step));
    }
    assert!(!events::is_valid_step("annotate_v2"));
}

#[test]
fn espejo_typescript_coincide_con_la_taxonomia() {
    let src = repo_file("src/features/study/events.ts");
    assert_eq!(ts_list(&src, "STUDY_EVENTS"), events::EVENT_NAMES);
    assert_eq!(ts_list(&src, "MODALITIES"), events::MODALITIES);
    assert_eq!(ts_list(&src, "NET_PURPOSES"), events::NET_PURPOSES);

    let steps = repo_file("src/features/study/studySteps.ts");
    assert_eq!(ts_list(&steps, "STUDY_STEPS"), events::STEP_IDS);
}

#[test]
fn documentacion_cubre_todos_los_eventos() {
    let doc = repo_file("docs/study-mode.md");
    for name in events::EVENT_NAMES {
        assert!(
            doc.contains(&format!("`{}`", name)),
            "el evento {} no está documentado en docs/study-mode.md",
            name
        );
    }
    for step in events::STEP_IDS {
        assert!(
            doc.contains(&format!("`{}`", step)),
            "el paso {} no está documentado en docs/study-mode.md",
            step
        );
    }
    // A la inversa: la doc no puede inventar eventos.
    for cap in doc.split('`') {
        let looks_like_event = cap.contains('.')
            && !cap.contains(' ')
            && !cap.contains('/')
            && cap.chars().all(|c| c.is_ascii_lowercase() || c == '.' || c == '_')
            && cap.split('.').count() >= 2
            && !cap.ends_with(".md")
            && !cap.ends_with(".jsonl")
            && !cap.ends_with(".json")
            && !cap.ends_with(".py")
            && !cap.ends_with(".ts")
            && !cap.ends_with(".rs");
        if looks_like_event {
            assert!(
                events::is_valid_event(cap),
                "docs/study-mode.md documenta un evento inexistente: {}",
                cap
            );
        }
    }
}
