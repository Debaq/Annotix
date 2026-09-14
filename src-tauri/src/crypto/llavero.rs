//! Recordar la clave de un proyecto en el llavero del sistema.
//!
//! Es **opcional y explícito**: por defecto la frase se pide en cada arranque.
//! Recordarla es más cómodo y protege menos —quien tenga abierta la sesión del
//! usuario entra sin frase—, así que la decisión es del usuario y hay que
//! decirle las dos mitades cuando la toma.
//!
//! Lo que se guarda es la **clave de proyecto**, no la frase. Si se guardara la
//! frase, cambiarla dejaría el recuerdo apuntando a nada; y una frase suele ser
//! la misma en varios sitios, que es exactamente lo que no conviene esparcir.
//!
//! El llavero puede no existir (un Linux sin servicio de secretos, una sesión
//! sin desbloquear). Eso **no es un error del proyecto**: se informa y se sigue
//! pidiendo la frase, que es lo que se hacía antes de que existiera esto.

use super::vault::{ClaveProyecto, CLAVE_LEN};

const SERVICIO: &str = "annotix-proyecto";

fn entrada(project_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICIO, project_id)
        .map_err(|e| format!("El llavero del sistema no está disponible: {e}"))
}

/// `true` si hay llavero utilizable en esta máquina.
pub fn disponible() -> bool {
    entrada("annotix-sonda").is_ok()
}

pub fn recordar(project_id: &str, clave: &ClaveProyecto) -> Result<(), String> {
    entrada(project_id)?
        .set_secret(clave.bytes())
        .map_err(|e| format!("No se pudo guardar en el llavero: {e}"))
}

/// La clave recordada, si la hay. Un llavero que no responde devuelve `None`:
/// lo que toca entonces es pedir la frase, no fallar.
pub fn recordada(project_id: &str) -> Option<ClaveProyecto> {
    let secreto = entrada(project_id).ok()?.get_secret().ok()?;
    if secreto.len() != CLAVE_LEN {
        return None;
    }
    let mut bytes = [0u8; CLAVE_LEN];
    bytes.copy_from_slice(&secreto);
    // Se reconstruye por el camino que ya valida el tamaño y borra la copia.
    use base64::Engine;
    ClaveProyecto::importar_compartida(&format!(
        "annotix-key-v1:{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
    .ok()
}

pub fn olvidar(project_id: &str) {
    if let Ok(e) = entrada(project_id) {
        let _ = e.delete_credential();
    }
}
