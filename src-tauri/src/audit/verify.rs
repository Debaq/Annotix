//! Verificación del registro de auditoría de un proyecto.
//!
//! Comprueba la cadena de hash, que `seq` no salte y que todos los eventos
//! pertenezcan a la taxonomía. Lo que detecta es **manipulación y pérdida**: una
//! línea editada rompe su propio hash, una borrada rompe el `prev_hash` de la
//! siguiente y un salto de `seq` delata una escritura que no llegó a disco.

use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use super::events;
use super::log::FILE_NAME;
use crate::hashchain::{sha256_hex, split_line};

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AuditReport {
    /// No hay registro todavía: el proyecto no ha cambiado desde que existe la
    /// auditoría. No es un error.
    pub exists: bool,
    pub valid: bool,
    pub n_events: u64,
    /// Cuántos eventos de cada tipo, para poder resumir sin releer el archivo.
    pub by_event: std::collections::BTreeMap<String, u64>,
    /// Quiénes escribieron en él.
    pub actors: Vec<String>,
    pub first_at: Option<String>,
    pub last_at: Option<String>,
    /// La última línea quedó a medio escribir. No invalida lo anterior: se
    /// descarta al volver a abrir el registro.
    pub truncated_tail: bool,
    pub errors: Vec<String>,
}

/// Verifica el `audit.jsonl` del directorio de un proyecto.
pub fn verify_project(project_dir: &Path) -> Result<AuditReport, String> {
    let path = project_dir.join(FILE_NAME);
    if !path.exists() {
        return Ok(AuditReport {
            exists: false,
            valid: true,
            ..Default::default()
        });
    }
    let mut report = verify_file(&path)?;
    report.exists = true;
    Ok(report)
}

pub fn verify_file(path: &Path) -> Result<AuditReport, String> {
    // Descifrando si hace falta: la cadena se calcula sobre el texto en claro,
    // así que el verificador no cambia de criterio por estar cifrado.
    let lectura = super::cifrado::leer(path)?;
    let cola_ilegible = lectura.cola_ilegible;
    let content = lectura.plano;

    let mut report = AuditReport {
        exists: true,
        valid: true,
        // Una línea cifrada que no abre es indistinguible de una escritura a
        // medias: se declara como cola truncada en vez de descartarla callando.
        truncated_tail: cola_ilegible,
        ..Default::default()
    };
    let mut actores: std::collections::BTreeSet<String> = Default::default();

    let ends_with_newline = content.ends_with('\n');
    let lines: Vec<&str> = content.lines().collect();

    let mut prev_hash = String::new();
    let mut expected_seq: u64 = 0;

    for (i, line) in lines.iter().enumerate() {
        let is_last = i + 1 == lines.len();

        let Some((base, declared)) = split_line(line) else {
            if is_last && !ends_with_newline {
                report.truncated_tail = true;
                break;
            }
            report
                .errors
                .push(format!("línea {}: sin campo hash", i + 1));
            report.valid = false;
            continue;
        };

        let obj: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(e) => {
                if is_last && !ends_with_newline {
                    report.truncated_tail = true;
                    break;
                }
                report
                    .errors
                    .push(format!("línea {}: JSON inválido ({})", i + 1, e));
                report.valid = false;
                continue;
            }
        };

        if sha256_hex(&base) != declared {
            report
                .errors
                .push(format!("línea {}: el evento fue modificado", i + 1));
            report.valid = false;
        }

        let got_prev = obj["prev_hash"].as_str().unwrap_or_default();
        if got_prev != prev_hash {
            report.errors.push(format!(
                "línea {}: no enlaza con la anterior (¿se borró una línea?)",
                i + 1
            ));
            report.valid = false;
        }

        let seq = obj["seq"].as_u64().unwrap_or(u64::MAX);
        if seq != expected_seq {
            report.errors.push(format!(
                "línea {}: seq {} (se esperaba {})",
                i + 1,
                seq,
                expected_seq
            ));
            report.valid = false;
        }
        expected_seq = seq.wrapping_add(1);

        let name = obj["event"].as_str().unwrap_or_default();
        if !events::is_valid_event(name) {
            report.errors.push(format!(
                "línea {}: evento fuera de la taxonomía ({})",
                i + 1,
                name
            ));
            report.valid = false;
        }
        *report.by_event.entry(name.to_string()).or_insert(0) += 1;

        if let Some(a) = obj["actor"].as_str() {
            actores.insert(a.to_string());
        }
        if let Some(t) = obj["t_wall"].as_str() {
            if report.first_at.is_none() {
                report.first_at = Some(t.to_string());
            }
            report.last_at = Some(t.to_string());
        }

        prev_hash = sha256_hex(line);
        report.n_events += 1;
    }

    report.actors = actores.into_iter().collect();
    Ok(report)
}
