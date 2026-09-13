//! Huella de hardware para `session.start` (Tarea 4).
//!
//! Todo se obtiene del sistema local, sin llamadas de red. No se captura nada
//! que identifique la máquina: ni número de serie, ni dirección MAC, ni nombre
//! de equipo, ni nombre de usuario.

use std::process::Command;

use serde_json::{Map, Value};

/// Recorta y limpia un texto del sistema para que pueda viajar en el payload.
fn clean(s: &str) -> String {
    let mut out: String = s
        .trim()
        .chars()
        .map(|c| if c == '/' || c == '\\' { ' ' } else { c })
        .collect();
    if out.chars().count() > 96 {
        out = out.chars().take(96).collect();
    }
    out
}

fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

// ─── CPU ────────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn cpu_model() -> Option<String> {
    let txt = std::fs::read_to_string("/proc/cpuinfo").ok()?;
    txt.lines()
        .find(|l| l.starts_with("model name"))
        .and_then(|l| l.split_once(':'))
        .map(|(_, v)| clean(v))
}

#[cfg(target_os = "macos")]
fn cpu_model() -> Option<String> {
    run("sysctl", &["-n", "machdep.cpu.brand_string"]).map(|s| clean(&s))
}

#[cfg(target_os = "windows")]
fn cpu_model() -> Option<String> {
    std::env::var("PROCESSOR_IDENTIFIER").ok().map(|s| clean(&s))
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn cpu_model() -> Option<String> {
    None
}

// ─── Memoria ────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn mem_total_mb() -> Option<u64> {
    let txt = std::fs::read_to_string("/proc/meminfo").ok()?;
    let line = txt.lines().find(|l| l.starts_with("MemTotal:"))?;
    let kb: u64 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(kb / 1024)
}

#[cfg(target_os = "macos")]
fn mem_total_mb() -> Option<u64> {
    let bytes: u64 = run("sysctl", &["-n", "hw.memsize"])?.parse().ok()?;
    Some(bytes / 1024 / 1024)
}

#[cfg(target_os = "windows")]
fn mem_total_mb() -> Option<u64> {
    let out = run(
        "wmic",
        &["computersystem", "get", "TotalPhysicalMemory", "/value"],
    )?;
    let bytes: u64 = out
        .lines()
        .find_map(|l| l.trim().strip_prefix("TotalPhysicalMemory="))?
        .trim()
        .parse()
        .ok()?;
    Some(bytes / 1024 / 1024)
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn mem_total_mb() -> Option<u64> {
    None
}

// ─── Acelerador gráfico ─────────────────────────────────────────────────────

/// Nombre del acelerador, si el sistema lo expone. Solo el modelo, nunca un
/// identificador de la unidad concreta.
fn gpu_name() -> Option<String> {
    if let Some(out) = run(
        "nvidia-smi",
        &["--query-gpu=name", "--format=csv,noheader"],
    ) {
        if let Some(first) = out.lines().next() {
            return Some(clean(first));
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(out) = run("sh", &["-c", "lspci | grep -i 'vga\\|3d controller'"]) {
            if let Some(first) = out.lines().next() {
                let name = first.split_once(": ").map(|(_, v)| v).unwrap_or(first);
                return Some(clean(name));
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Some(out) = run("system_profiler", &["SPDisplaysDataType"]) {
            if let Some(line) = out.lines().find(|l| l.trim().starts_with("Chipset Model:")) {
                if let Some((_, v)) = line.split_once(':') {
                    return Some(clean(v));
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(out) = run("wmic", &["path", "win32_VideoController", "get", "name"]) {
            if let Some(line) = out.lines().skip(1).find(|l| !l.trim().is_empty()) {
                return Some(clean(line));
            }
        }
    }

    None
}

// ─── Sistema operativo ──────────────────────────────────────────────────────

fn os_name() -> String {
    std::env::consts::OS.to_string()
}

fn os_version() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        if let Ok(txt) = std::fs::read_to_string("/etc/os-release") {
            let get = |key: &str| -> Option<String> {
                txt.lines()
                    .find_map(|l| l.strip_prefix(key))
                    .map(|v| clean(v.trim_matches('"')))
            };
            let name = get("NAME=");
            let ver = get("VERSION_ID=");
            return match (name, ver) {
                (Some(n), Some(v)) => Some(clean(&format!("{} {}", n, v))),
                (Some(n), None) => Some(n),
                _ => run("uname", &["-r"]).map(|s| clean(&s)),
            };
        }
        return run("uname", &["-r"]).map(|s| clean(&s));
    }
    #[cfg(target_os = "macos")]
    {
        return run("sw_vers", &["-productVersion"]).map(|s| clean(&s));
    }
    #[cfg(target_os = "windows")]
    {
        return run("cmd", &["/C", "ver"]).map(|s| clean(&s));
    }
    #[allow(unreachable_code)]
    None
}

// ─── Ensamblado ─────────────────────────────────────────────────────────────

/// Campos de hardware/SO del evento `session.start`.
pub fn fingerprint() -> Map<String, Value> {
    let mut hw = Map::new();
    hw.insert(
        "cpu_model".into(),
        cpu_model().map(Value::from).unwrap_or(Value::Null),
    );
    hw.insert(
        "cores_physical".into(),
        Value::from(num_cpus::get_physical() as u64),
    );
    hw.insert(
        "cores_logical".into(),
        Value::from(num_cpus::get() as u64),
    );
    hw.insert(
        "mem_total_mb".into(),
        mem_total_mb().map(Value::from).unwrap_or(Value::Null),
    );
    let gpu = gpu_name();
    hw.insert("gpu_present".into(), Value::from(gpu.is_some()));
    hw.insert(
        "gpu_name".into(),
        gpu.map(Value::from).unwrap_or(Value::Null),
    );

    let mut root = Map::new();
    root.insert("hardware".into(), Value::Object(hw));
    root.insert("os".into(), Value::from(os_name()));
    root.insert(
        "os_version".into(),
        os_version().map(Value::from).unwrap_or(Value::Null),
    );
    root
}
