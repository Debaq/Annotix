//! Verificación de un archivo de registro (Tarea 2, parte final).
//!
//! Comprueba la cadena de hash, la monotonía de `seq` y `t_mono_ms`, y que
//! todos los eventos pertenezcan a la taxonomía.

use std::path::Path;

use serde::Serialize;
use serde_json::Value;

use super::events;
use super::log::{sha256_hex, split_line};

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VerifyReport {
    pub valid: bool,
    pub n_events: u64,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    pub condition: Option<String>,
    #[serde(rename = "appVersion")]
    pub app_version: Option<String>,
    #[serde(rename = "lastTMonoMs")]
    pub last_t_mono_ms: u64,
    /// La última línea quedó a medio escribir (cierre abrupto). No invalida
    /// las anteriores; se informa aparte.
    #[serde(rename = "truncatedTail")]
    pub truncated_tail: bool,
    pub errors: Vec<String>,
}

pub fn verify_file(path: &Path) -> Result<VerifyReport, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("No se pudo leer {}: {}", path.display(), e))?;

    let mut report = VerifyReport {
        valid: true,
        ..Default::default()
    };

    let ends_with_newline = content.ends_with('\n');
    let lines: Vec<&str> = content.lines().collect();

    let mut prev_hash = String::new();
    let mut expected_seq: u64 = 0;
    let mut last_mono: u64 = 0;

    for (i, line) in lines.iter().enumerate() {
        let is_last = i + 1 == lines.len();

        let Some((base, declared)) = split_line(line) else {
            if is_last && !ends_with_newline {
                report.truncated_tail = true;
                break;
            }
            report.errors.push(format!("línea {}: sin campo hash", i + 1));
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
                .push(format!("línea {}: hash del evento no coincide", i + 1));
            report.valid = false;
        }

        let got_prev = obj["prev_hash"].as_str().unwrap_or_default();
        if got_prev != prev_hash {
            report
                .errors
                .push(format!("línea {}: prev_hash roto", i + 1));
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

        let mono = obj["t_mono_ms"].as_u64().unwrap_or(0);
        if mono < last_mono {
            report
                .errors
                .push(format!("línea {}: t_mono_ms retrocede", i + 1));
            report.valid = false;
        }
        last_mono = mono;

        let name = obj["event"].as_str().unwrap_or_default();
        if !events::is_valid_event(name) {
            report.errors.push(format!(
                "línea {}: evento fuera de la taxonomía ({})",
                i + 1,
                name
            ));
            report.valid = false;
        }

        if report.session_id.is_none() {
            report.session_id = obj["session_id"].as_str().map(String::from);
            report.condition = obj["condition"].as_str().map(String::from);
            report.app_version = obj["app_version"].as_str().map(String::from);
        }

        prev_hash = sha256_hex(line);
        report.n_events += 1;
    }

    report.last_t_mono_ms = last_mono;
    Ok(report)
}

/// SHA-256 del archivo completo, para el manifiesto de exportación.
pub fn file_hash(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    h.update(&bytes);
    Ok(hex::encode(h.finalize()))
}
