//! Auditoría del tráfico saliente (sección 3.7).
//!
//! Estas pruebas leen el código fuente: son la garantía de que nadie vuelva a
//! abrir un cliente HTTP por fuera de `crate::net` y de que ninguna petición
//! quede clasificada como `other`.

use std::path::{Path, PathBuf};

use super::{host_of, Purpose};

fn src_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
}

fn rust_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            rust_files(&path, out);
        } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
            out.push(path);
        }
    }
}

/// Archivos del proyecto, salvo el propio `net` (que sí construye clientes).
fn instrumentable_files() -> Vec<PathBuf> {
    let mut files = Vec::new();
    rust_files(&src_dir(), &mut files);
    files.retain(|p| !p.components().any(|c| c.as_os_str() == "net"));
    files
}

#[test]
fn ningun_modulo_construye_su_propio_cliente_http() {
    let prohibidos = [
        "reqwest::Client::new",
        "reqwest::blocking::Client::new",
        "reqwest::Client::builder",
        "reqwest::blocking::Client::builder",
        "reqwest::get(",
        "reqwest::blocking::get(",
    ];
    let mut ofensas = Vec::new();
    for file in instrumentable_files() {
        let Ok(content) = std::fs::read_to_string(&file) else {
            continue;
        };
        for (i, line) in content.lines().enumerate() {
            let code = line.split("//").next().unwrap_or(line);
            for p in prohibidos {
                if code.contains(p) {
                    ofensas.push(format!("{}:{}: {}", file.display(), i + 1, code.trim()));
                }
            }
        }
    }
    assert!(
        ofensas.is_empty(),
        "todo el tráfico saliente debe pasar por crate::net:\n{}",
        ofensas.join("\n")
    );
}

#[test]
fn ninguna_peticion_queda_sin_clasificar() {
    let mut ofensas = Vec::new();
    for file in instrumentable_files() {
        let Ok(content) = std::fs::read_to_string(&file) else {
            continue;
        };
        for (i, line) in content.lines().enumerate() {
            let code = line.split("//").next().unwrap_or(line);
            if code.contains("Purpose::Other") {
                ofensas.push(format!("{}:{}: {}", file.display(), i + 1, code.trim()));
            }
        }
    }
    assert!(
        ofensas.is_empty(),
        "estas peticiones salen sin propósito declarado:\n{}",
        ofensas.join("\n")
    );
}

#[test]
fn el_dominio_sale_sin_ruta_credenciales_ni_puerto() {
    assert_eq!(host_of("https://api.github.com/repos/x/y"), "api.github.com");
    assert_eq!(host_of("http://localhost:8090/health"), "localhost");
    assert_eq!(host_of("https://user:pass@Files.Example.COM/a?b=c"), "files.example.com");
    assert_eq!(host_of("https://storage.googleapis.com"), "storage.googleapis.com");
}

#[test]
fn los_nombres_de_proposito_son_los_de_la_taxonomia() {
    let all = [
        Purpose::UpdateCheck,
        Purpose::ModelWeights,
        Purpose::RemoteTraining,
        Purpose::CollabP2p,
        Purpose::RemoteLlm,
        Purpose::Other,
    ];
    let names: Vec<&str> = all.iter().map(|p| p.as_str()).collect();
    assert_eq!(names, crate::study::events::NET_PURPOSES);
}
