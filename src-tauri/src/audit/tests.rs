//! Pruebas del registro de auditoría.
//!
//! Las tres que importan: que la cadena detecte una línea retocada, que detecte
//! una borrada, y que un cierre abrupto se recupere sin romper lo anterior.

use std::io::Write;
use std::path::Path;

use super::events;
use super::log;
use super::verify;

fn registrar(dir: &Path, event: &str, payload: serde_json::Value) {
    registrar_como(dir, "proj-1", event, payload);
}

fn registrar_como(dir: &Path, project_id: &str, event: &str, payload: serde_json::Value) {
    log::record(dir, project_id, event, payload).expect("registrar");
}

fn leer(dir: &Path) -> Vec<String> {
    std::fs::read_to_string(dir.join(log::FILE_NAME))
        .unwrap_or_default()
        .lines()
        .map(String::from)
        .collect()
}

#[test]
fn la_cadena_se_verifica_de_punta_a_punta() {
    let tmp = tempfile::tempdir().unwrap();
    registrar(
        tmp.path(),
        events::ANNOTATIONS_SAVED,
        serde_json::json!({ "image_id": "img-1", "created": ["a1"], "deleted": [] }),
    );
    registrar(
        tmp.path(),
        events::CLASSES_CHANGED,
        serde_json::json!({ "before": ["cat"], "after": ["cat", "dog"] }),
    );
    log::close(tmp.path());

    let r = verify::verify_project(tmp.path()).expect("verificar");
    assert!(r.exists);
    assert!(r.valid, "cadena inválida: {:?}", r.errors);
    // Los dos eventos más el `log.opened` de apertura.
    assert_eq!(r.n_events, 3);
    assert_eq!(r.by_event.get(events::LOG_OPENED), Some(&1));
    assert_eq!(r.actors, vec!["local".to_string()]);
    assert!(!r.truncated_tail);
}

#[test]
fn un_proyecto_sin_cambios_no_tiene_registro_y_eso_no_es_un_error() {
    let tmp = tempfile::tempdir().unwrap();
    let r = verify::verify_project(tmp.path()).expect("verificar");
    assert!(!r.exists);
    assert!(r.valid);
    assert_eq!(r.n_events, 0);
}

#[test]
fn retocar_una_linea_a_mano_se_detecta() {
    let tmp = tempfile::tempdir().unwrap();
    registrar(
        tmp.path(),
        events::ANNOTATIONS_SAVED,
        serde_json::json!({ "image_id": "img-1", "deleted": ["a1"] }),
    );
    registrar(
        tmp.path(),
        events::ANNOTATIONS_SAVED,
        serde_json::json!({ "image_id": "img-2", "deleted": ["a2"] }),
    );
    log::close(tmp.path());

    // Alguien cambia a qué imagen se refería el borrado.
    let mut lineas = leer(tmp.path());
    lineas[1] = lineas[1].replace("img-1", "img-9");
    std::fs::write(tmp.path().join(log::FILE_NAME), lineas.join("\n") + "\n").unwrap();

    let r = verify::verify_project(tmp.path()).expect("verificar");
    assert!(!r.valid, "se editó una línea y el verificador no lo vio");
    assert!(
        r.errors.iter().any(|e| e.contains("modificado")),
        "errores: {:?}",
        r.errors
    );
}

#[test]
fn borrar_una_linea_del_medio_se_detecta() {
    let tmp = tempfile::tempdir().unwrap();
    for i in 0..3 {
        registrar(
            tmp.path(),
            events::ANNOTATIONS_SAVED,
            serde_json::json!({ "image_id": format!("img-{i}") }),
        );
    }
    log::close(tmp.path());

    let mut lineas = leer(tmp.path());
    lineas.remove(2);
    std::fs::write(tmp.path().join(log::FILE_NAME), lineas.join("\n") + "\n").unwrap();

    let r = verify::verify_project(tmp.path()).expect("verificar");
    assert!(!r.valid, "se borró una línea y el verificador no lo vio");
}

#[test]
fn un_cierre_abrupto_se_recupera_sin_romper_lo_anterior() {
    let tmp = tempfile::tempdir().unwrap();
    registrar(
        tmp.path(),
        events::ANNOTATIONS_SAVED,
        serde_json::json!({ "image_id": "img-1" }),
    );
    log::close(tmp.path());

    // El proceso muere a mitad de escribir la línea siguiente.
    let mut f = std::fs::OpenOptions::new()
        .append(true)
        .open(tmp.path().join(log::FILE_NAME))
        .unwrap();
    f.write_all(b"{\"project_id\":\"proj-1\",\"seq\":2,\"even")
        .unwrap();
    drop(f);

    let r = verify::verify_project(tmp.path()).expect("verificar");
    assert!(r.truncated_tail, "la cola a medias no se detectó");
    assert!(
        r.valid,
        "la cola a medias invalidó lo anterior: {:?}",
        r.errors
    );

    // Al volver a escribir, la cola se descarta y la cadena sigue verificando.
    registrar(
        tmp.path(),
        events::ANNOTATIONS_SAVED,
        serde_json::json!({ "image_id": "img-2" }),
    );
    log::close(tmp.path());

    let r = verify::verify_project(tmp.path()).expect("verificar");
    assert!(r.valid, "la cadena no se recuperó: {:?}", r.errors);
    assert!(!r.truncated_tail);
    // Y queda constancia de que se descartó algo.
    let hubo_descarte = leer(tmp.path())
        .iter()
        .any(|l| l.contains("\"discarded_partial_line\":true"));
    assert!(hubo_descarte, "se descartó una cola y no quedó constancia");
}

#[test]
fn la_cadena_continua_entre_arranques_de_la_app() {
    let tmp = tempfile::tempdir().unwrap();
    registrar(
        tmp.path(),
        events::ANNOTATIONS_SAVED,
        serde_json::json!({ "image_id": "img-1" }),
    );

    // Reiniciar la app: el escritor suelta el archivo y vuelve a abrirlo.
    log::close(tmp.path());
    registrar(
        tmp.path(),
        events::ANNOTATIONS_SAVED,
        serde_json::json!({ "image_id": "img-2" }),
    );
    log::close(tmp.path());

    let r = verify::verify_project(tmp.path()).expect("verificar");
    assert!(r.valid, "la cadena se rompió al reabrir: {:?}", r.errors);
    // Dos aperturas y dos guardados.
    assert_eq!(r.n_events, 4);
    assert_eq!(r.by_event.get(events::LOG_OPENED), Some(&2));
}

#[test]
fn el_actor_declarado_queda_en_el_registro() {
    let tmp = tempfile::tempdir().unwrap();
    // Id propio: las pruebas comparten el singleton del proceso y corren a la vez.
    let pid = "proj-actor";
    log::set_actor(pid, Some("Ana".into()));
    registrar_como(
        tmp.path(),
        pid,
        events::ANNOTATIONS_SAVED,
        serde_json::json!({ "image_id": "img-1" }),
    );
    log::close(tmp.path());

    // Se acabó la sesión colaborativa: vuelve a registrarse como local.
    log::set_actor(pid, None);
    registrar_como(
        tmp.path(),
        pid,
        events::ANNOTATIONS_SAVED,
        serde_json::json!({ "image_id": "img-2" }),
    );
    log::close(tmp.path());

    let r = verify::verify_project(tmp.path()).expect("verificar");
    assert!(r.valid);
    assert_eq!(r.actors, vec!["Ana".to_string(), "local".to_string()]);
}

#[test]
fn un_evento_fuera_de_la_taxonomia_se_rechaza() {
    let tmp = tempfile::tempdir().unwrap();
    let err = log::record(
        tmp.path(),
        "proj-1",
        "annotations.borradas",
        serde_json::json!({}),
    )
    .expect_err("debería rechazarse");
    assert!(err.contains("taxonomía"), "{err}");
}

/// El registro no puede volver lento el trabajo de anotar: dos mil guardados es
/// una sesión intensa de verdad, y tiene que quedar en cosa de un segundo.
#[test]
fn dos_mil_eventos_no_degradan_el_trabajo() {
    let tmp = tempfile::tempdir().unwrap();
    let t0 = std::time::Instant::now();
    for i in 0..2000 {
        registrar(
            tmp.path(),
            events::ANNOTATIONS_SAVED,
            serde_json::json!({ "image_id": format!("img-{i}"), "created": [format!("a{i}")] }),
        );
    }
    let tardanza = t0.elapsed();
    log::close(tmp.path());

    let r = verify::verify_project(tmp.path()).expect("verificar");
    assert!(r.valid, "{:?}", r.errors);
    assert_eq!(r.n_events, 2001);
    assert!(
        tardanza.as_secs_f64() < 10.0,
        "2000 eventos tardaron {:?}: el registro está estorbando al canvas",
        tardanza
    );
}

// ─── Pruebas normativas ─────────────────────────────────────────────────────

fn repo_file(rel: &str) -> String {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("raíz del repo")
        .join(rel);
    std::fs::read_to_string(&root).unwrap_or_else(|e| panic!("{}: {}", root.display(), e))
}

/// Un evento sin documentar es un evento que nadie sabe leer. La documentación
/// tampoco puede inventarse eventos que el código no emite.
#[test]
fn la_documentacion_cubre_la_taxonomia() {
    let doc = repo_file("docs/audit-log.md");
    for name in events::EVENT_NAMES {
        assert!(
            doc.contains(&format!("`{}`", name)),
            "el evento {} no está en docs/audit-log.md",
            name
        );
    }
    for cap in doc.split('`') {
        let parece_evento = cap.contains('.')
            && !cap.contains(' ')
            && !cap.contains('/')
            && cap.split('.').count() == 2
            && cap
                .chars()
                .all(|c| c.is_ascii_lowercase() || c == '.' || c == '_')
            && !cap.ends_with(".md")
            && !cap.ends_with(".jsonl")
            && !cap.ends_with(".rs");
        if parece_evento {
            assert!(
                events::is_valid_event(cap),
                "docs/audit-log.md documenta un evento inexistente: {}",
                cap
            );
        }
    }
}

/// Una taxonomía con eventos que nadie emite miente sobre lo que el registro
/// contiene: quien la lea esperará líneas que no van a aparecer nunca.
#[test]
fn todos_los_eventos_se_emiten_desde_algun_sitio() {
    let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut codigo = String::new();
    let mut pendientes = vec![src];
    while let Some(dir) = pendientes.pop() {
        for e in std::fs::read_dir(&dir).expect("leer src").flatten() {
            let p = e.path();
            if p.is_dir() {
                pendientes.push(p);
            } else if p.extension().and_then(|x| x.to_str()) == Some("rs") {
                // El propio módulo de auditoría define y prueba los nombres: lo que
                // se busca es quién los usa desde fuera.
                if p.components().any(|c| c.as_os_str() == "audit") {
                    continue;
                }
                codigo.push_str(&std::fs::read_to_string(&p).unwrap_or_default());
            }
        }
    }

    for (nombre, constante) in [
        (events::ANNOTATIONS_SAVED, "ANNOTATIONS_SAVED"),
        (events::PREDICTIONS_ACCEPTED, "PREDICTIONS_ACCEPTED"),
        (events::PREDICTIONS_REJECTED, "PREDICTIONS_REJECTED"),
        (events::VIDEO_CONSOLIDATED, "VIDEO_CONSOLIDATED"),
        (events::CLASSES_CHANGED, "CLASSES_CHANGED"),
        (events::SUBJECTS_ASSIGNED, "SUBJECTS_ASSIGNED"),
        (events::SPLIT_POLICY_CHANGED, "SPLIT_POLICY_CHANGED"),
        (events::DATA_IMPORTED, "DATA_IMPORTED"),
        (events::DATA_EXPORTED, "DATA_EXPORTED"),
        (events::TRAINING_STARTED, "TRAINING_STARTED"),
        (events::TRAINING_FINISHED, "TRAINING_FINISHED"),
    ] {
        assert!(
            codigo.contains(constante),
            "el evento {} está en la taxonomía y no lo emite nadie",
            nombre
        );
    }
}

// ─── Registro de un proyecto cifrado ────────────────────────────────────────

const FRASE: &str = "una frase de paso suficientemente larga";

/// Directorio de proyecto cifrado y abierto.
fn proyecto_cifrado() -> tempfile::TempDir {
    let tmp = tempfile::tempdir().unwrap();
    let (vault, _) = crate::crypto::vault::Vault::crear(FRASE, "test").unwrap();
    vault.escribir(tmp.path()).unwrap();
    // El registro sólo se estrena cifrado si el proyecto existe como tal.
    std::fs::write(tmp.path().join("project.json"), b"{}").unwrap();
    crate::crypto::sesion::abrir_con_frase(tmp.path(), FRASE).unwrap();
    tmp
}

#[test]
fn el_registro_de_un_proyecto_cifrado_no_se_lee_con_un_editor() {
    let tmp = proyecto_cifrado();
    registrar(
        tmp.path(),
        events::SUBJECTS_ASSIGNED,
        serde_json::json!({ "via": "manual", "subject": "SUJ-007", "n_samples": 3 }),
    );
    let crudo = std::fs::read_to_string(tmp.path().join(log::FILE_NAME)).unwrap();
    assert!(crudo.starts_with("#ANXLOG1"));
    assert!(
        !crudo.contains("SUJ-007"),
        "el sujeto asoma en el registro:\n{crudo}"
    );
    crate::crypto::sesion::bloquear(tmp.path());
}

#[test]
fn la_cadena_cifrada_se_verifica_y_continua_entre_arranques() {
    let tmp = proyecto_cifrado();
    registrar(tmp.path(), events::LOG_OPENED, serde_json::json!({}));
    registrar(
        tmp.path(),
        events::CLASSES_CHANGED,
        serde_json::json!({ "before": [], "after": ["a"] }),
    );
    // Cerrar el archivo obliga a releer la cadena en el siguiente evento, que es
    // donde el contador del nonce se podía desincronizar.
    log::close(tmp.path());
    registrar(
        tmp.path(),
        events::CLASSES_CHANGED,
        serde_json::json!({ "before": ["a"], "after": ["a", "b"] }),
    );

    let informe = verify::verify_project(tmp.path()).unwrap();
    assert!(informe.valid, "{:?}", informe.errors);
    // Los tres declarados más el `log.opened` que el propio registro anota al
    // abrirse en cada arranque.
    assert!(informe.n_events >= 3, "{informe:?}");
    assert!(!informe.truncated_tail);
    crate::crypto::sesion::bloquear(tmp.path());
}

#[test]
fn una_linea_retocada_del_registro_cifrado_se_detecta() {
    let tmp = proyecto_cifrado();
    registrar(tmp.path(), events::LOG_OPENED, serde_json::json!({}));
    registrar(tmp.path(), events::LOG_OPENED, serde_json::json!({}));
    log::close(tmp.path());

    let path = tmp.path().join(log::FILE_NAME);
    let mut lineas: Vec<String> = std::fs::read_to_string(&path)
        .unwrap()
        .lines()
        .map(String::from)
        .collect();
    // Cambiar un carácter del base64 rompe la autenticación de esa línea.
    let ultima = lineas.len() - 1;
    lineas[ultima] = lineas[ultima].chars().rev().collect();
    std::fs::write(&path, lineas.join("\n") + "\n").unwrap();

    let informe = verify::verify_project(tmp.path()).unwrap();
    assert!(
        informe.truncated_tail,
        "una línea manipulada tiene que notarse: {informe:?}"
    );
    crate::crypto::sesion::bloquear(tmp.path());
}

#[test]
fn sin_la_frase_el_registro_no_se_lee_ni_se_escribe() {
    let tmp = proyecto_cifrado();
    registrar(tmp.path(), events::LOG_OPENED, serde_json::json!({}));
    log::close(tmp.path());
    crate::crypto::sesion::bloquear(tmp.path());

    assert!(verify::verify_project(tmp.path()).is_err());
    assert!(log::record(tmp.path(), "proj-1", events::LOG_OPENED, serde_json::json!({})).is_err());
}
