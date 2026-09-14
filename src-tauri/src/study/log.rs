//! Escritor del registro del modo estudio (Tarea 2).
//!
//! Un archivo JSON Lines por sesión, solo anexado, con cadena de hash SHA-256.
//! El escritor es un singleton de proceso para que puedan emitir tanto los
//! comandos Tauri como los hilos del backend (entrenamiento, red, inferencia)
//! sin arrastrar un `AppHandle`.
//!
//! ## Formato de línea
//!
//! El de la cadena común: ver [`crate::hashchain`]. Aquí se añade la política de
//! privacidad del modo estudio —ningún campo del payload puede parecer una ruta
//! ni ser texto largo—, que es lo que lo distingue del registro de auditoría
//! (`audit/`), construido sobre la misma cadena con la política contraria.

use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use serde_json::{Map, Value};

use super::events;

/// Longitud máxima admitida para un valor de texto dentro del payload. Ningún
/// campo de la taxonomía es texto libre; el tope es una red de seguridad.
const MAX_STR_LEN: usize = 128;

pub fn app_version() -> String {
    let semver = env!("CARGO_PKG_VERSION");
    let git = env!("ANNOTIX_GIT_HASH");
    if git.is_empty() {
        semver.to_string()
    } else {
        format!("{}+{}", semver, git)
    }
}

// ─── Estado ─────────────────────────────────────────────────────────────────

struct Session {
    session_id: String,
    condition: String,
    app_version: String,
    path: PathBuf,
    file: File,
    seq: u64,
    prev_hash: String,
    t0: Instant,
}

#[derive(Default)]
struct Logger {
    /// Directorio base (`<dir_datos_app>/study_logs`). `None` hasta `init`.
    dir: Option<PathBuf>,
    session: Option<Session>,
}

fn logger() -> &'static Mutex<Logger> {
    static LOGGER: OnceLock<Mutex<Logger>> = OnceLock::new();
    LOGGER.get_or_init(|| Mutex::new(Logger::default()))
}

/// Fija el directorio de registros. Se llama una vez al arrancar la app.
pub fn init(data_dir: &Path) {
    if let Ok(mut g) = logger().lock() {
        g.dir = Some(data_dir.join("study_logs"));
    }
}

/// Directorio donde viven los archivos de sesión.
pub fn logs_dir() -> Option<PathBuf> {
    logger().lock().ok().and_then(|g| g.dir.clone())
}

/// ¿Hay una sesión de estudio abierta?
pub fn is_active() -> bool {
    logger()
        .lock()
        .map(|g| g.session.is_some())
        .unwrap_or(false)
}

/// Datos de la sesión en curso: `(session_id, condition, ruta, seq escrito)`.
pub fn current() -> Option<(String, String, PathBuf, u64)> {
    let g = logger().lock().ok()?;
    let s = g.session.as_ref()?;
    Some((
        s.session_id.clone(),
        s.condition.clone(),
        s.path.clone(),
        s.seq,
    ))
}

// ─── Validación ─────────────────────────────────────────────────────────────

/// `session_id`: alfanumérico y guiones, 3–32 caracteres.
pub fn validate_session_id(id: &str) -> Result<(), String> {
    let n = id.chars().count();
    if !(3..=32).contains(&n) {
        return Err("session_id debe tener entre 3 y 32 caracteres".into());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("session_id solo admite letras, números, guion y guion bajo".into());
    }
    Ok(())
}

/// `condition`: opcional, 0–32 caracteres.
pub fn validate_condition(cond: &str) -> Result<(), String> {
    if cond.chars().count() > 32 {
        return Err("condition admite como máximo 32 caracteres".into());
    }
    Ok(())
}

/// Red de seguridad: ningún valor del payload puede parecer una ruta ni ser
/// texto largo. Evita que una instrumentación futura filtre contenido.
fn check_payload(value: &Value) -> Result<(), String> {
    match value {
        Value::String(s) => {
            if s.len() > MAX_STR_LEN {
                return Err(format!(
                    "valor de texto de {} caracteres en el payload (máximo {})",
                    s.len(),
                    MAX_STR_LEN
                ));
            }
            if s.contains('/') || s.contains('\\') {
                return Err("el payload no puede contener rutas".into());
            }
            Ok(())
        }
        Value::Array(items) => items.iter().try_for_each(check_payload),
        Value::Object(map) => map.values().try_for_each(check_payload),
        _ => Ok(()),
    }
}

// ─── Cadena ─────────────────────────────────────────────────────────────────

/// Reexportados para quien verifica: la cadena vive en [`crate::hashchain`].
pub use crate::hashchain::{seal, sha256_hex, split_line};

// ─── Sesión ─────────────────────────────────────────────────────────────────

/// Abre una sesión y emite `session.start`. Devuelve la ruta del archivo.
pub fn start_session(
    session_id: &str,
    condition: &str,
    screen_w: u32,
    screen_h: u32,
) -> Result<PathBuf, String> {
    validate_session_id(session_id)?;
    validate_condition(condition)?;

    let started = chrono::Utc::now();
    // ISO 8601 sin caracteres inválidos en nombres de archivo de Windows.
    let stamp = started.format("%Y%m%dT%H%M%SZ").to_string();

    {
        let mut g = logger().lock().map_err(|e| e.to_string())?;
        let dir = g.dir.clone().ok_or("Registro de estudio sin inicializar")?;
        std::fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear study_logs: {}", e))?;

        if g.session.is_some() {
            return Err("Ya hay una sesión de estudio abierta".into());
        }

        let path = dir.join(format!("{}_{}.jsonl", session_id, stamp));
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| format!("No se pudo abrir el registro: {}", e))?;

        g.session = Some(Session {
            session_id: session_id.to_string(),
            condition: condition.to_string(),
            app_version: app_version(),
            path,
            file,
            seq: 0,
            prev_hash: String::new(),
            t0: Instant::now(),
        });
    }

    let mut payload = super::hardware::fingerprint();
    payload.insert("screen_w".into(), Value::from(screen_w));
    payload.insert("screen_h".into(), Value::from(screen_h));
    emit(events::SESSION_START, Value::Object(payload))?;

    let path = current().map(|c| c.2).ok_or("Sesión perdida al iniciar")?;
    Ok(path)
}

/// Emite `session.end` y cierra la sesión. Idempotente.
pub fn end_session(reason: &str) {
    if !is_active() {
        return;
    }
    let _ = emit(events::SESSION_END, serde_json::json!({ "reason": reason }));
    if let Ok(mut g) = logger().lock() {
        if let Some(s) = g.session.as_mut() {
            let _ = s.file.flush();
        }
        g.session = None;
    }
}

/// Cierra los archivos que quedaron sin `session.end` porque el proceso murió.
/// Anexa una última línea con motivo `crash_recovered`, continuando la cadena
/// de hash del archivo. Se llama una vez al arrancar la app.
pub fn close_orphan_sessions() {
    let Some(dir) = logs_dir() else { return };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for path in entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"))
    {
        if let Err(e) = close_orphan_file(&path) {
            log::warn!("study_log: no se pudo cerrar {}: {}", path.display(), e);
        }
    }
}

fn close_orphan_file(path: &Path) -> Result<(), String> {
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    // Una cola truncada se descarta: solo se continúa desde una línea entera.
    // Se busca desde el final porque la línea que interesa es la última: recorrer
    // el archivo entero para quedarse con ella es trabajo tirado en un registro
    // de miles de eventos.
    let Some(last) = content.lines().rev().find(|l| split_line(l).is_some()) else {
        return Ok(());
    };
    let obj: Value = serde_json::from_str(last).map_err(|e| e.to_string())?;
    if obj["event"].as_str() == Some(events::SESSION_END) {
        return Ok(());
    }

    let mut tail = Map::new();
    tail.insert("session_id".into(), obj["session_id"].clone());
    tail.insert("condition".into(), obj["condition"].clone());
    tail.insert(
        "seq".into(),
        Value::from(obj["seq"].as_u64().unwrap_or(0) + 1),
    );
    tail.insert("t_mono_ms".into(), obj["t_mono_ms"].clone());
    tail.insert(
        "t_wall".into(),
        Value::from(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
    );
    tail.insert("event".into(), Value::from(events::SESSION_END));
    tail.insert("app_version".into(), obj["app_version"].clone());
    tail.insert("prev_hash".into(), Value::from(sha256_hex(last)));
    tail.insert(
        "payload".into(),
        serde_json::json!({ "reason": "crash_recovered" }),
    );

    let (line, _) = seal(&Value::Object(tail));
    let mut file = OpenOptions::new()
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    let prefix = if content.ends_with('\n') { "" } else { "\n" };
    file.write_all(format!("{}{}\n", prefix, line).as_bytes())
        .map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())
}

// ─── Emisión ────────────────────────────────────────────────────────────────

/// Registra un evento. Si el modo estudio está apagado retorna sin efectos.
pub fn emit(event: &str, payload: Value) -> Result<(), String> {
    if !events::is_valid_event(event) {
        return Err(format!("Evento fuera de la taxonomía: {}", event));
    }
    if !payload.is_object() && !payload.is_null() {
        return Err("El payload debe ser un objeto".into());
    }
    check_payload(&payload)?;

    let mut g = logger().lock().map_err(|e| e.to_string())?;
    let Some(s) = g.session.as_mut() else {
        return Ok(());
    };

    let mut obj = Map::new();
    obj.insert("session_id".into(), Value::from(s.session_id.clone()));
    obj.insert("condition".into(), Value::from(s.condition.clone()));
    obj.insert("seq".into(), Value::from(s.seq));
    obj.insert(
        "t_mono_ms".into(),
        Value::from(s.t0.elapsed().as_millis() as u64),
    );
    obj.insert(
        "t_wall".into(),
        Value::from(chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
    );
    obj.insert("event".into(), Value::from(event));
    obj.insert("app_version".into(), Value::from(s.app_version.clone()));
    obj.insert("prev_hash".into(), Value::from(s.prev_hash.clone()));
    obj.insert(
        "payload".into(),
        match payload {
            Value::Null => Value::Object(Map::new()),
            other => other,
        },
    );

    let (line, _) = seal(&Value::Object(obj));

    // Una sola escritura por evento: si el proceso muere, la última línea o
    // está entera o no está.
    let mut buf = line.clone().into_bytes();
    buf.push(b'\n');
    s.file
        .write_all(&buf)
        .map_err(|e| format!("Error escribiendo el registro: {}", e))?;
    s.file
        .flush()
        .map_err(|e| format!("Error vaciando el registro: {}", e))?;

    s.prev_hash = sha256_hex(&line);
    s.seq += 1;
    Ok(())
}

/// Variante silenciosa para los puntos de instrumentación: el registro nunca
/// puede tumbar una operación de la app.
pub fn emit_quiet(event: &str, payload: Value) {
    if let Err(e) = emit(event, payload) {
        log::warn!("study_log: {}", e);
    }
}

// ─── Solo para pruebas ──────────────────────────────────────────────────────

#[cfg(test)]
pub(crate) fn reset_for_test(dir: &Path) {
    let mut g = logger().lock().unwrap();
    g.dir = Some(dir.to_path_buf());
    g.session = None;
}

/// Cierra el archivo sin emitir `session.end`: simula una muerte del proceso.
#[cfg(test)]
pub(crate) fn abort_session_for_test() {
    let mut g = logger().lock().unwrap();
    g.session = None;
}
