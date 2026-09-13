//! Puntos de emisión del modo estudio para el ciclo de entrenamiento (3.2).
//!
//! Vive aquí y no en el runner para que los tiempos por época y la
//! clasificación de errores tengan un solo dueño, y para que los hilos del
//! runner solo tengan que llamar tres funciones.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use serde_json::json;

use crate::study::{emit_quiet, events};

struct JobTracking {
    started: Instant,
    last_epoch: Instant,
    epochs_done: u32,
    /// PID del proceso de Python, para leer su pico de memoria residente.
    pid: Option<u32>,
    mem_peak_mb: u64,
}

fn jobs() -> &'static Mutex<HashMap<String, JobTracking>> {
    static JOBS: OnceLock<Mutex<HashMap<String, JobTracking>>> = OnceLock::new();
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Modo de ejecución tal como lo nombra la taxonomía.
pub fn mode_name(mode: &super::ExecutionMode) -> &'static str {
    match mode {
        super::ExecutionMode::Local => "local",
        super::ExecutionMode::DownloadPackage => "package",
        super::ExecutionMode::Cloud => "remote",
        super::ExecutionMode::BrowserAutomation => "browser",
    }
}

/// Pico de memoria residente del proceso, en MB. Solo Linux lo expone barato;
/// en el resto se registra 0.
fn peak_rss_mb(pid: u32) -> u64 {
    #[cfg(target_os = "linux")]
    {
        if let Ok(status) = std::fs::read_to_string(format!("/proc/{}/status", pid)) {
            if let Some(line) = status.lines().find(|l| l.starts_with("VmHWM:")) {
                if let Some(kb) = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|v| v.parse::<u64>().ok())
                {
                    return kb / 1024;
                }
            }
        }
        0
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = pid;
        0
    }
}

pub fn train_started(
    job_id: &str,
    backend: &str,
    mode: &str,
    n_train: usize,
    n_val: usize,
    epochs_planned: u32,
    pid: Option<u32>,
) {
    let now = Instant::now();
    if let Ok(mut map) = jobs().lock() {
        map.insert(
            job_id.to_string(),
            JobTracking {
                started: now,
                last_epoch: now,
                epochs_done: 0,
                pid,
                mem_peak_mb: 0,
            },
        );
    }
    emit_quiet(
        events::TRAIN_START,
        json!({
            "backend": backend,
            "mode": mode,
            "n_train": n_train,
            "n_val": n_val,
            "epochs_planned": epochs_planned,
        }),
    );
}

pub fn train_epoch(job_id: &str, epoch: u32) {
    let Ok(mut map) = jobs().lock() else { return };
    let Some(t) = map.get_mut(job_id) else { return };
    let now = Instant::now();
    let duration_ms = now.duration_since(t.last_epoch).as_millis() as u64;
    t.last_epoch = now;
    t.epochs_done = t.epochs_done.max(epoch);
    if let Some(pid) = t.pid {
        t.mem_peak_mb = t.mem_peak_mb.max(peak_rss_mb(pid));
    }
    let mem_peak_mb = t.mem_peak_mb;
    drop(map);

    emit_quiet(
        events::TRAIN_EPOCH,
        json!({
            "epoch": epoch,
            "duration_ms": duration_ms,
            "mem_peak_mb": mem_peak_mb,
        }),
    );
}

/// Categoría del fallo. Nunca se registra el mensaje: solo la clase.
pub fn classify_error(stderr: &str) -> &'static str {
    let s = stderr.to_lowercase();
    if s.contains("out of memory") || s.contains("outofmemoryerror") {
        "oom"
    } else if s.contains("cuda") || s.contains("nvidia") || s.contains("cudnn") {
        "cuda"
    } else if s.contains("modulenotfounderror") || s.contains("importerror") {
        "missing_dependency"
    } else if s.contains("filenotfounderror") || s.contains("no such file") {
        "missing_file"
    } else if s.contains("permissionerror") || s.contains("permission denied") {
        "permission"
    } else if s.contains("dataset") || s.contains("no labels") || s.contains("empty") {
        "dataset"
    } else if s.contains("keyerror") || s.contains("valueerror") || s.contains("typeerror") {
        "script"
    } else if s.trim().is_empty() {
        "unknown"
    } else {
        "runtime"
    }
}

pub fn train_finished(job_id: &str, ok: bool, error_class: &str) {
    let Ok(mut map) = jobs().lock() else { return };
    let Some(t) = map.remove(job_id) else { return };
    drop(map);

    emit_quiet(
        events::TRAIN_END,
        json!({
            "ok": ok,
            "duration_ms": t.started.elapsed().as_millis() as u64,
            "epochs_done": t.epochs_done,
            "error_class": error_class,
        }),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clasifica_errores_sin_filtrar_el_mensaje() {
        assert_eq!(classify_error("torch.cuda.OutOfMemoryError: ..."), "oom");
        assert_eq!(
            classify_error("ModuleNotFoundError: No module named 'timm'"),
            "missing_dependency"
        );
        assert_eq!(classify_error(""), "unknown");
        assert_eq!(classify_error("Segmentation fault"), "runtime");
    }

    #[test]
    fn nombres_de_modo_cubren_la_taxonomia() {
        use super::super::ExecutionMode::*;
        let all = [Local, DownloadPackage, Cloud, BrowserAutomation];
        let names: Vec<&str> = all.iter().map(mode_name).collect();
        assert_eq!(names, ["local", "package", "remote", "browser"]);
    }
}
