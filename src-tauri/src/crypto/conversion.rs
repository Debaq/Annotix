//! Cifrar —o descifrar— un proyecto que ya existe.
//!
//! ## Reanudable por diseño, no por esfuerzo
//!
//! La conversión va archivo por archivo, cada uno con su `.tmp` y su renombrado.
//! Un corte de luz a mitad deja unos archivos cifrados y otros no, **y eso se
//! lee igual de bien**: quien decide si un archivo hay que descifrarlo es su
//! propia marca de cabecera, no una bandera global. Volver a lanzar la
//! conversión termina lo que falte.
//!
//! El `vault.json` se escribe **antes** de tocar el primer archivo. Al revés —
//! cifrar primero y guardar la cabecera al final— un corte de luz dejaría un
//! proyecto cifrado sin la clave envuelta, que es un proyecto perdido.
//!
//! ## Lo que se queda en claro, y por qué
//!
//! `training/`: ahí viven los datasets preparados y los modelos entrenados, y
//! los lee y escribe Python, que no sabe descifrar. Un dataset preparado es una
//! **copia del corpus en claro** al lado del corpus cifrado; quien active el
//! cifrado tiene que saberlo, y por eso se dice en la interfaz y no sólo aquí.

use std::path::{Path, PathBuf};

use super::vault::ClaveProyecto;
use crate::audit::cifrado as audit_cifrado;
use crate::crypto::archivo;

/// Subdirectorios que no se cifran.
const EXCLUIDOS: &[&str] = &["training"];

#[derive(Debug, Clone, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Avance {
    pub hechos: usize,
    pub total: usize,
    /// Archivos que ya estaban como tenían que estar.
    pub saltados: usize,
    /// Archivos que no se pudieron convertir, con su motivo.
    pub fallos: Vec<String>,
}

/// Archivos del proyecto que entran en la conversión.
fn archivos(dir: &Path) -> Vec<PathBuf> {
    let mut salida = Vec::new();
    recorrer(dir, &mut salida);
    salida.sort();
    salida
}

fn recorrer(actual: &Path, salida: &mut Vec<PathBuf>) {
    let Ok(entradas) = std::fs::read_dir(actual) else {
        return;
    };
    for entrada in entradas.flatten() {
        let ruta = entrada.path();
        let nombre = entrada.file_name().to_string_lossy().to_string();
        if ruta.is_dir() {
            if EXCLUIDOS.contains(&nombre.as_str()) {
                continue;
            }
            recorrer(&ruta, salida);
        } else if nombre != super::vault::FILE_NAME
            && !nombre.ends_with(".tmp")
            // El registro tiene su propio formato: se convierte aparte.
            && nombre != crate::audit::log::FILE_NAME
        {
            salida.push(ruta);
        }
    }
}

/// La ruta de un archivo dentro del proyecto, con `/` como separador.
fn relativa(raiz: &Path, ruta: &Path) -> String {
    ruta.strip_prefix(raiz)
        .unwrap_or(ruta)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

fn escribir_atomico(ruta: &Path, datos: &[u8]) -> Result<(), String> {
    let tmp = ruta.with_extension(format!(
        "{}tmp",
        ruta.extension()
            .map(|e| format!("{}.", e.to_string_lossy()))
            .unwrap_or_default()
    ));
    std::fs::write(&tmp, datos).map_err(|e| format!("Error escribiendo {tmp:?}: {e}"))?;
    std::fs::rename(&tmp, ruta).map_err(|e| format!("Error renombrando {tmp:?}: {e}"))
}

/// Cifra todo lo que falte del proyecto. Reanudable: lo ya cifrado se salta.
pub fn cifrar_proyecto(
    dir: &Path,
    clave: &ClaveProyecto,
    mut avisar: impl FnMut(&Avance),
) -> Result<Avance, String> {
    let lista = archivos(dir);
    let mut avance = Avance {
        total: lista.len() + 1, // +1: el registro de auditoría
        ..Default::default()
    };
    for ruta in lista {
        let rel = relativa(dir, &ruta);
        match convertir_uno(&ruta, &rel, clave, true) {
            Ok(true) => avance.hechos += 1,
            Ok(false) => avance.saltados += 1,
            Err(e) => avance.fallos.push(format!("{rel}: {e}")),
        }
        avisar(&avance);
    }
    match cifrar_registro(dir, clave) {
        Ok(true) => avance.hechos += 1,
        Ok(false) => avance.saltados += 1,
        Err(e) => avance
            .fallos
            .push(format!("{}: {e}", crate::audit::log::FILE_NAME)),
    }
    avisar(&avance);
    Ok(avance)
}

/// Deja el proyecto en claro. Al terminar hay que borrar el `vault.json`.
pub fn descifrar_proyecto(
    dir: &Path,
    clave: &ClaveProyecto,
    mut avisar: impl FnMut(&Avance),
) -> Result<Avance, String> {
    let lista = archivos(dir);
    let mut avance = Avance {
        total: lista.len() + 1,
        ..Default::default()
    };
    for ruta in lista {
        let rel = relativa(dir, &ruta);
        match convertir_uno(&ruta, &rel, clave, false) {
            Ok(true) => avance.hechos += 1,
            Ok(false) => avance.saltados += 1,
            Err(e) => avance.fallos.push(format!("{rel}: {e}")),
        }
        avisar(&avance);
    }
    match descifrar_registro(dir) {
        Ok(true) => avance.hechos += 1,
        Ok(false) => avance.saltados += 1,
        Err(e) => avance
            .fallos
            .push(format!("{}: {e}", crate::audit::log::FILE_NAME)),
    }
    avisar(&avance);
    Ok(avance)
}

/// `Ok(true)` si el archivo se convirtió, `Ok(false)` si ya estaba.
fn convertir_uno(
    ruta: &Path,
    rel: &str,
    clave: &ClaveProyecto,
    hacia_cifrado: bool,
) -> Result<bool, String> {
    let bytes = std::fs::read(ruta).map_err(|e| format!("no se pudo leer: {e}"))?;
    let esta_cifrado = archivo::es_cifrado(&bytes);
    if esta_cifrado == hacia_cifrado {
        return Ok(false);
    }
    let nuevos = if hacia_cifrado {
        archivo::cifrar(clave, rel, &bytes)?
    } else {
        archivo::descifrar(clave, rel, &bytes)?
    };
    escribir_atomico(ruta, &nuevos)?;
    Ok(true)
}

/// El registro va aparte: es línea a línea y hay que reescribirlo entero.
///
/// Se reescribe conservando el texto de cada línea, así que la cadena de hashes
/// sigue siendo la misma: convertir un proyecto no invalida su auditoría.
fn cifrar_registro(dir: &Path, clave: &ClaveProyecto) -> Result<bool, String> {
    let ruta = dir.join(crate::audit::log::FILE_NAME);
    if !ruta.exists() {
        return Ok(false);
    }
    crate::audit::log::close(dir);
    let contenido = std::fs::read_to_string(&ruta).map_err(|e| format!("no se pudo leer: {e}"))?;
    if audit_cifrado::es_cifrado(&contenido) {
        return Ok(false);
    }
    let (cabecera, sal) = audit_cifrado::cabecera_nueva();
    let mut salida = cabecera;
    for (i, linea) in contenido.lines().enumerate() {
        let cifrada = audit_cifrado::cifrar_linea(
            clave,
            &sal,
            crate::audit::log::FILE_NAME,
            i as u64,
            linea,
        )?;
        salida.push_str(&cifrada);
        salida.push('\n');
    }
    escribir_atomico(&ruta, salida.as_bytes())?;
    Ok(true)
}

fn descifrar_registro(dir: &Path) -> Result<bool, String> {
    let ruta = dir.join(crate::audit::log::FILE_NAME);
    if !ruta.exists() {
        return Ok(false);
    }
    crate::audit::log::close(dir);
    let lectura = audit_cifrado::leer(&ruta)?;
    if lectura.sal.is_none() {
        return Ok(false);
    }
    escribir_atomico(&ruta, lectura.plano.as_bytes())?;
    Ok(true)
}

#[cfg(test)]
mod tests;
