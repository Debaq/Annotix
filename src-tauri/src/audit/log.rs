//! Escritor del registro de auditoría de un proyecto.
//!
//! Un `audit.jsonl` dentro del directorio del proyecto, solo-anexado y encadenado
//! por hash (ver [`crate::hashchain`]). A diferencia del modo estudio, aquí los
//! identificadores van **en claro**: el registro tiene que poder responder qué
//! etiqueta cambió y quién la cambió, y para eso hace falta el id de la imagen,
//! el de la anotación y el nombre de quien anotaba.
//!
//! Es el mismo mecanismo que `study/log.rs` con la política de privacidad
//! contraria. No se mezclan a propósito: uno es anónimo por diseño y el otro no
//! puede serlo.
//!
//! ## Qué garantiza y qué no
//!
//! Garantiza que el archivo no se puede editar por el medio sin que se note: cada
//! línea lleva el hash de la anterior. **No** garantiza que nadie pueda tirar el
//! archivo entero y empezar otro —para eso haría falta un ancla fuera del
//! proyecto—, ni que quien escribe diga la verdad sobre su nombre. Es un registro
//! a prueba de accidentes y de retoques, no a prueba de un adversario con acceso
//! al disco.

use std::collections::HashMap;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use serde_json::{Map, Value};

use super::events;
use crate::hashchain::{continuacion, seal, sha256_hex};

/// Nombre del archivo dentro del directorio del proyecto.
pub const FILE_NAME: &str = "audit.jsonl";

/// Actor cuando nadie declaró uno: la persona que usa la app en esta máquina.
const ACTOR_LOCAL: &str = "local";

struct Abierto {
    file: File,
    seq: u64,
    prev_hash: String,
}

#[derive(Default)]
struct Registro {
    /// Archivos abiertos, por ruta del `audit.jsonl`.
    abiertos: HashMap<PathBuf, Abierto>,
    /// Quién está anotando en cada proyecto: el nombre con el que se unió a la
    /// sesión P2P. Sin sesión, el actor es `local`.
    actores: HashMap<String, String>,
}

fn registro() -> &'static Mutex<Registro> {
    static R: OnceLock<Mutex<Registro>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(Registro::default()))
}

/// Declara con qué nombre se registra lo que se haga en este proyecto.
/// `None` vuelve a `local`. Lo llama el arranque de una sesión P2P.
pub fn set_actor(project_id: &str, nombre: Option<String>) {
    if let Ok(mut r) = registro().lock() {
        match nombre.filter(|n| !n.trim().is_empty()) {
            Some(n) => r.actores.insert(project_id.to_string(), n),
            None => r.actores.remove(project_id),
        };
    }
}

fn actor_de(r: &Registro, project_id: &str) -> String {
    r.actores
        .get(project_id)
        .cloned()
        .unwrap_or_else(|| ACTOR_LOCAL.to_string())
}

/// Marca de tiempo de pared en ISO 8601. No hay reloj monótono de sesión: este
/// registro sobrevive a los reinicios de la app, y un `t_mono_ms` que se reinicia
/// con el proceso no ordenaría nada.
fn t_wall() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

/// Abre el archivo del proyecto y deja la cadena lista para continuar.
///
/// Si el proceso murió a mitad de una escritura, la última línea quedó a medias.
/// Esa línea **no** está en la cadena —nadie enlaza su hash—, así que se descarta
/// truncando el archivo hasta el final de la última línea entera, y se deja
/// constancia de ello en el primer evento. Dejarla estaría peor: el verificador
/// la vería como una cola truncada para siempre, y cualquier línea nueva detrás
/// de ella rompería la cadena de verdad.
fn abrir(path: &Path, project_id: &str, actor: &str) -> Result<Abierto, String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("No se pudo crear el directorio del registro: {}", e))?;
    }

    let content = std::fs::read_to_string(path).unwrap_or_default();
    let cont = continuacion(&content);

    if cont.cola_truncada {
        let entera = OpenOptions::new()
            .write(true)
            .open(path)
            .map_err(|e| format!("No se pudo abrir el registro: {}", e))?;
        entera
            .set_len(cont.bytes_validos as u64)
            .map_err(|e| format!("No se pudo descartar la cola truncada: {}", e))?;
    }

    let file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("No se pudo abrir el registro: {}", e))?;

    let mut abierto = Abierto {
        file,
        seq: cont.last_seq.map(|s| s + 1).unwrap_or(0),
        prev_hash: cont.prev_hash,
    };

    escribir(
        &mut abierto,
        project_id,
        actor,
        events::LOG_OPENED,
        serde_json::json!({
            "app_version": crate::study::log::app_version(),
            "discarded_partial_line": cont.cola_truncada,
        }),
    )?;

    Ok(abierto)
}

fn escribir(
    abierto: &mut Abierto,
    project_id: &str,
    actor: &str,
    event: &str,
    payload: Value,
) -> Result<(), String> {
    let mut obj = Map::new();
    obj.insert("project_id".into(), Value::from(project_id));
    obj.insert("seq".into(), Value::from(abierto.seq));
    obj.insert("t_wall".into(), Value::from(t_wall()));
    obj.insert("event".into(), Value::from(event));
    obj.insert("actor".into(), Value::from(actor));
    obj.insert("prev_hash".into(), Value::from(abierto.prev_hash.clone()));
    obj.insert(
        "payload".into(),
        match payload {
            Value::Null => Value::Object(Map::new()),
            otro => otro,
        },
    );

    let (line, _) = seal(&Value::Object(obj));

    // Una sola escritura por evento: si el proceso muere, la última línea o está
    // entera o no está.
    let mut buf = line.clone().into_bytes();
    buf.push(b'\n');
    abierto
        .file
        .write_all(&buf)
        .map_err(|e| format!("Error escribiendo el registro: {}", e))?;
    abierto
        .file
        .flush()
        .map_err(|e| format!("Error vaciando el registro: {}", e))?;

    abierto.prev_hash = sha256_hex(&line);
    abierto.seq += 1;
    Ok(())
}

/// Registra un cambio con efecto sobre el ground truth.
///
/// `project_dir` es el directorio del proyecto; el archivo es `audit.jsonl`
/// dentro de él. Devuelve error sólo por problemas del propio registro: quien
/// llama decide si le importan (ver [`record_quiet`]).
pub fn record(
    project_dir: &Path,
    project_id: &str,
    event: &str,
    payload: Value,
) -> Result<(), String> {
    if !events::is_valid_event(event) {
        return Err(format!("Evento fuera de la taxonomía: {}", event));
    }
    if !payload.is_object() && !payload.is_null() {
        return Err("El payload debe ser un objeto".into());
    }

    let path = project_dir.join(FILE_NAME);
    let mut r = registro().lock().map_err(|e| e.to_string())?;
    let actor = actor_de(&r, project_id);

    if !r.abiertos.contains_key(&path) {
        let abierto = abrir(&path, project_id, &actor)?;
        r.abiertos.insert(path.clone(), abierto);
    }

    let abierto = r
        .abiertos
        .get_mut(&path)
        .ok_or("El registro se cerró mientras se escribía")?;
    escribir(abierto, project_id, &actor, event, payload)
}

/// Variante silenciosa para los puntos de instrumentación.
///
/// El registro no puede tumbar una operación de la app: si el disco falla, lo que
/// se pierde es la constancia del cambio, no el cambio. Queda en el log del
/// proceso y el verificador lo delata después —un `seq` que salta—.
pub fn record_quiet(project_dir: &Path, project_id: &str, event: &str, payload: Value) {
    if let Err(e) = record(project_dir, project_id, event, payload) {
        log::warn!("audit: {}", e);
    }
}

/// Suelta el archivo de un proyecto: al borrarlo o al cerrarlo.
pub fn close(project_dir: &Path) {
    if let Ok(mut r) = registro().lock() {
        r.abiertos.remove(&project_dir.join(FILE_NAME));
    }
}
