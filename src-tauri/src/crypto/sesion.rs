//! Qué proyectos están abiertos ahora mismo, y con qué clave.
//!
//! El registro es global a propósito. `io::read_project` y `io::write_project`
//! reciben sólo el directorio —los llaman sesenta sitios, incluidos hilos de
//! entrenamiento que no ven el estado de la app—, así que la clave tiene que
//! poder encontrarse desde la ruta. La alternativa era pasar la clave por
//! sesenta firmas y por dentro de los hilos, que es más código y más sitios
//! donde olvidarse de cifrar.
//!
//! La clave vive en memoria mientras el proyecto está abierto. Eso no es un
//! descuido: es la única forma de que el canvas pinte una imagen. El cifrado en
//! reposo protege el disco, no la memoria de un proceso en marcha.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use super::vault::{ClaveProyecto, Vault};

fn registro() -> &'static Mutex<HashMap<PathBuf, ClaveProyecto>> {
    static REG: OnceLock<Mutex<HashMap<PathBuf, ClaveProyecto>>> = OnceLock::new();
    REG.get_or_init(|| Mutex::new(HashMap::new()))
}

/// La misma carpeta tiene que dar siempre la misma llave del mapa, venga por
/// ruta absoluta o relativa.
fn normalizar(dir: &Path) -> PathBuf {
    std::fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf())
}

/// `true` si el proyecto declara estar cifrado (existe su `vault.json`).
///
/// Se pregunta al disco y no a una bandera dentro de `project.json` por un
/// motivo simple: si el `project.json` está cifrado, no se puede leer la
/// bandera que diría que hay que descifrarlo.
pub fn hay_vault(dir: &Path) -> bool {
    dir.join(super::vault::FILE_NAME).exists()
}

pub fn desbloquear(dir: &Path, clave: ClaveProyecto) {
    if let Ok(mut reg) = registro().lock() {
        reg.insert(normalizar(dir), clave);
    }
}

/// Abre el proyecto con una frase. Devuelve la clave para que quien llama pueda
/// exportarla si hace falta.
pub fn abrir_con_frase(dir: &Path, frase: &str) -> Result<ClaveProyecto, String> {
    let vault = Vault::leer(dir)?.ok_or("Este proyecto no está cifrado")?;
    let clave = vault.abrir(frase)?;
    desbloquear(dir, clave.clone());
    Ok(clave)
}

pub fn bloquear(dir: &Path) {
    if let Ok(mut reg) = registro().lock() {
        reg.remove(&normalizar(dir));
    }
}

/// Cierra todos los proyectos. Es lo que hay que llamar al bloquear la app.
pub fn bloquear_todo() {
    if let Ok(mut reg) = registro().lock() {
        reg.clear();
    }
}

pub fn clave(dir: &Path) -> Option<ClaveProyecto> {
    registro().lock().ok()?.get(&normalizar(dir)).cloned()
}

pub fn esta_desbloqueado(dir: &Path) -> bool {
    clave(dir).is_some()
}

/// `true` si el proyecto está cifrado y **no** se ha abierto todavía.
pub fn esta_bloqueado(dir: &Path) -> bool {
    hay_vault(dir) && !esta_desbloqueado(dir)
}

#[cfg(test)]
mod tests;
