//! El registro de auditoría de un proyecto cifrado.
//!
//! ## Por líneas, no por archivo
//!
//! El registro es solo-anexado y encadenado: cada evento añade una línea y
//! ninguna se reescribe. Cifrar el archivo entero obligaría a leerlo,
//! descifrarlo, añadir y volver a escribirlo en **cada evento** —y a perder la
//! propiedad que lo hace valer como registro: que nadie reescribe lo ya escrito—.
//!
//! Así que se cifra línea a línea. La cadena de hashes sigue calculándose sobre
//! el texto en claro, de modo que el verificador no cambia de criterio: lo que
//! cambia es lo que se ve en el disco.
//!
//! ## Qué se ve igualmente
//!
//! El número de eventos y cuándo se anexó cada uno. El tamaño de una línea da
//! una pista débil del tipo de evento. Esconder eso pediría relleno y escrituras
//! falsas, que es otro problema; se declara en vez de fingir que no está.

use std::path::Path;

use base64::Engine;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use rand::RngCore;

use crate::crypto::archivo::{clave_de_archivo, nonce_con_contador};
use crate::crypto::vault::ClaveProyecto;

/// Primera línea de un registro cifrado: la marca y la sal del archivo.
const MARCA: &str = "#ANXLOG1";
const SAL_LEN: usize = 16;

/// Lo que hay en el registro, ya en claro.
pub struct Lectura {
    /// El contenido tal como lo espera la cadena de hashes.
    pub plano: String,
    /// Hasta qué byte **del disco** llega lo que se pudo leer entero. Truncar
    /// por aquí descarta una línea a medias sin tocar las anteriores.
    pub bytes_validos: usize,
    /// Cuántas líneas de evento hay. Es el contador del nonce de la siguiente.
    pub lineas: u64,
    /// Sal del archivo, cuando está cifrado.
    pub sal: Option<Vec<u8>>,
    /// La lectura se paró en una línea que no se pudo descifrar.
    ///
    /// Puede ser una escritura que el proceso no terminó, o una línea
    /// manipulada: desde fuera son lo mismo, y por eso esto no se traga en
    /// silencio — el verificador lo declara como cola truncada.
    pub cola_ilegible: bool,
}

fn cifrador(clave: &ClaveProyecto, sal: &[u8], nombre: &str) -> Result<XChaCha20Poly1305, String> {
    let k = clave_de_archivo(clave, nombre, sal)?;
    Ok(XChaCha20Poly1305::new(k.as_ref().into()))
}

/// `true` si el archivo está cifrado por Annotix.
pub fn es_cifrado(contenido: &str) -> bool {
    contenido.starts_with(MARCA)
}

/// La primera línea de un registro nuevo, con su sal.
pub fn cabecera_nueva() -> (String, Vec<u8>) {
    let mut sal = [0u8; SAL_LEN];
    rand::thread_rng().fill_bytes(&mut sal);
    (
        format!(
            "{MARCA} {}\n",
            base64::engine::general_purpose::STANDARD.encode(sal)
        ),
        sal.to_vec(),
    )
}

pub fn cifrar_linea(
    clave: &ClaveProyecto,
    sal: &[u8],
    nombre: &str,
    indice: u64,
    linea: &str,
) -> Result<String, String> {
    let c = cifrador(clave, sal, nombre)?;
    let bytes = c
        .encrypt(
            XNonce::from_slice(&nonce_con_contador(indice)),
            Payload {
                msg: linea.as_bytes(),
                aad: MARCA.as_bytes(),
            },
        )
        .map_err(|_| "No se pudo cifrar la línea del registro".to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

fn descifrar_linea(
    clave: &ClaveProyecto,
    sal: &[u8],
    nombre: &str,
    indice: u64,
    texto: &str,
) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(texto.trim_end())
        .map_err(|_| "Línea del registro ilegible".to_string())?;
    let c = cifrador(clave, sal, nombre)?;
    let plano = c
        .decrypt(
            XNonce::from_slice(&nonce_con_contador(indice)),
            Payload {
                msg: &bytes,
                aad: MARCA.as_bytes(),
            },
        )
        .map_err(|_| "Línea del registro manipulada o de otro proyecto".to_string())?;
    String::from_utf8(plano).map_err(|_| "Línea del registro ilegible".to_string())
}

/// Lee el registro, descifrándolo si hace falta.
///
/// Una línea que no se puede descifrar corta la lectura ahí, igual que una línea
/// a medias en el registro en claro: es la cola que dejó un proceso muerto a
/// mitad de escritura, y lo que sigue no existe para la cadena.
pub fn leer(path: &Path) -> Result<Lectura, String> {
    let crudo = std::fs::read_to_string(path).unwrap_or_default();
    if !es_cifrado(&crudo) {
        let lineas = crudo.lines().count() as u64;
        return Ok(Lectura {
            bytes_validos: crudo.len(),
            plano: crudo,
            lineas,
            sal: None,
            cola_ilegible: false,
        });
    }

    let dir = path
        .parent()
        .ok_or("El registro no está dentro de un proyecto")?;
    let clave = crate::crypto::sesion::clave(dir)
        .ok_or_else(|| crate::store::io::ERROR_BLOQUEADO.to_string())?;
    let nombre = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut lineas_disco = crudo.split_inclusive('\n');
    let cabecera = lineas_disco.next().unwrap_or_default();
    let sal = base64::engine::general_purpose::STANDARD
        .decode(cabecera.trim_start_matches(MARCA).trim())
        .map_err(|_| "La cabecera del registro está corrupta".to_string())?;

    let mut plano = String::new();
    let mut bytes_validos = cabecera.len();
    let mut indice = 0u64;
    let mut cola_ilegible = false;
    for linea in lineas_disco {
        // Una línea sin salto es una escritura a medias: no cuenta.
        let Some(texto) = linea.strip_suffix('\n') else {
            cola_ilegible = true;
            break;
        };
        match descifrar_linea(&clave, &sal, &nombre, indice, texto) {
            Ok(claro) => {
                plano.push_str(&claro);
                plano.push('\n');
                bytes_validos += linea.len();
                indice += 1;
            }
            Err(_) => {
                cola_ilegible = true;
                break;
            }
        }
    }

    Ok(Lectura {
        plano,
        bytes_validos,
        lineas: indice,
        sal: Some(sal),
        cola_ilegible,
    })
}
