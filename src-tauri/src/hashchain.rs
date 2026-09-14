//! Cadena de hash sobre un archivo JSON Lines, solo-anexado.
//!
//! La usan dos subsistemas con políticas de privacidad **opuestas**: el modo
//! estudio (`study/`), que es anónimo por diseño y rechaza rutas y texto largo, y
//! el registro de auditoría (`audit/`), que necesita exactamente lo contrario —ids
//! en claro y autoría—. Lo único que comparten es la mecánica, y vive aquí para
//! que no haya dos implementaciones de la misma cadena que puedan divergir.
//!
//! ## Formato de línea
//!
//! Cada línea es el objeto del evento serializado en JSON canónico (claves
//! ordenadas alfabéticamente, sin espacios) al que se le añade **al final** el
//! campo `hash`:
//!
//! ```text
//! {"app_version":...,"event":...,"prev_hash":...,"seq":0,"hash":"<sha256>"}
//! ```
//!
//! `hash` = SHA-256 del texto de la línea **sin** el sufijo `,"hash":"…"` y
//! cerrando con `}`. Como es una operación textual, cualquier lenguaje puede
//! reproducirla sin depender de cómo serialice números u objetos.
//!
//! `prev_hash` = SHA-256 de la línea anterior completa (sin el salto de línea).
//! En la primera línea es la cadena vacía.

use serde_json::Value;
use sha2::{Digest, Sha256};

/// Sufijo textual con el que se cierra cada línea.
pub const HASH_KEY: &str = ",\"hash\":\"";

pub fn sha256_hex(data: &str) -> String {
    let mut h = Sha256::new();
    h.update(data.as_bytes());
    hex::encode(h.finalize())
}

/// Serializa en JSON compacto con las claves de cada objeto ordenadas.
pub fn canonical(value: &Value) -> String {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let body: Vec<String> = keys
                .iter()
                .map(|k| {
                    format!(
                        "{}:{}",
                        Value::String((*k).clone()),
                        canonical(map.get(*k).unwrap())
                    )
                })
                .collect();
            format!("{{{}}}", body.join(","))
        }
        Value::Array(items) => {
            let body: Vec<String> = items.iter().map(canonical).collect();
            format!("[{}]", body.join(","))
        }
        other => other.to_string(),
    }
}

/// Construye la línea final a partir del objeto del evento (sin `hash`).
/// Devuelve `(línea, hash del evento)`.
pub fn seal(event_obj: &Value) -> (String, String) {
    let base = canonical(event_obj);
    let digest = sha256_hex(&base);
    let line = format!("{}{}{}\"}}", &base[..base.len() - 1], HASH_KEY, digest);
    (line, digest)
}

/// Separa una línea escrita en `(texto sin hash, hash declarado)`.
pub fn split_line(line: &str) -> Option<(String, String)> {
    let idx = line.rfind(HASH_KEY)?;
    let base = format!("{}}}", &line[..idx]);
    let rest = &line[idx + HASH_KEY.len()..];
    let declared = rest.strip_suffix("\"}")?;
    Some((base, declared.to_string()))
}

/// Dónde retomar la cadena de un archivo ya escrito.
#[derive(Debug, Clone, Default)]
pub struct Continuacion {
    /// `seq` de la última línea entera, si hay alguna.
    pub last_seq: Option<u64>,
    /// Hash de la última línea entera: el `prev_hash` de la siguiente.
    pub prev_hash: String,
    /// Bytes que ocupa el archivo hasta el final de la última línea entera.
    /// Lo que venga después es una cola a medio escribir de un cierre abrupto.
    pub bytes_validos: usize,
    /// Había una cola truncada tras la última línea entera.
    pub cola_truncada: bool,
}

/// Lee un archivo de cadena y dice por dónde continuarla.
///
/// Una cola a medio escribir no invalida lo anterior: la línea incompleta nunca
/// llegó a entrar en la cadena —su hash no lo enlaza nadie—, así que se informa
/// para que quien anexe decida si la descarta.
pub fn continuacion(content: &str) -> Continuacion {
    let mut out = Continuacion::default();
    let mut fin_ultima_entera = 0usize;
    let mut offset = 0usize;

    for linea in content.split_inclusive('\n') {
        let sin_salto = linea.strip_suffix('\n');
        let texto = sin_salto.unwrap_or(linea);
        let completa = sin_salto.is_some() && split_line(texto).is_some();
        if completa {
            out.prev_hash = sha256_hex(texto);
            out.last_seq = serde_json::from_str::<Value>(texto)
                .ok()
                .and_then(|v| v["seq"].as_u64());
            fin_ultima_entera = offset + linea.len();
        }
        offset += linea.len();
    }

    out.bytes_validos = fin_ultima_entera;
    out.cola_truncada = fin_ultima_entera < content.len();
    out
}
