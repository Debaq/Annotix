//! Activar, abrir y compartir un proyecto cifrado.
//!
//! El punto de no retorno vive aquí: activar el cifrado sin apuntar la frase —o
//! sin guardar la clave compartida— es perder el proyecto. La interfaz lo dice
//! antes de empezar; estos comandos no pueden hacer nada al respecto porque una
//! puerta trasera para recuperar valdría igual para quien copie el disco.

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::crypto::{conversion, llavero, sesion, vault::ClaveProyecto, vault::Vault};
use crate::store::AppState;

/// En qué estado está el cifrado de un proyecto.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EstadoCifrado {
    pub encrypted: bool,
    /// Abierto en esta sesión.
    pub unlocked: bool,
    /// Etiqueta pública, la que se ve en la lista mientras está cerrado.
    pub public_label: Option<String>,
    /// Quién puede abrirlo: una entrada por frase de paso.
    pub slots: Vec<RanuraInfo>,
    /// Si esta máquina tiene llavero donde recordar la clave.
    pub keyring_available: bool,
    /// Si la clave de este proyecto está recordada en el llavero.
    pub remembered: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RanuraInfo {
    pub id: String,
    pub label: String,
    pub created_at: f64,
}

#[tauri::command]
pub fn estado_cifrado(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<EstadoCifrado, String> {
    let dir = state.project_dir(&project_id)?;
    let vault = Vault::leer(&dir)?;
    Ok(EstadoCifrado {
        encrypted: vault.is_some(),
        unlocked: sesion::esta_desbloqueado(&dir),
        public_label: vault.as_ref().and_then(|v| v.public_label.clone()),
        slots: vault
            .as_ref()
            .map(|v| {
                v.slots
                    .iter()
                    .map(|r| RanuraInfo {
                        id: r.id.clone(),
                        label: r.label.clone(),
                        created_at: r.created_at,
                    })
                    .collect()
            })
            .unwrap_or_default(),
        keyring_available: llavero::disponible(),
        remembered: llavero::recordada(&project_id).is_some(),
    })
}

/// Cifra un proyecto que hasta ahora estaba en claro.
///
/// El `vault.json` se escribe **antes** de tocar el primer archivo: al revés, un
/// corte de luz dejaría archivos cifrados sin la clave envuelta, que es un
/// proyecto perdido.
#[tauri::command]
pub fn activar_cifrado(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    passphrase: String,
    label: Option<String>,
    public_label: Option<String>,
) -> Result<conversion::Avance, String> {
    let dir = state.project_dir(&project_id)?;
    if Vault::leer(&dir)?.is_some() {
        return Err("Este proyecto ya está cifrado".into());
    }
    if passphrase.trim().len() < 8 {
        return Err("La frase de paso es demasiado corta".into());
    }

    let (mut vault, clave) = Vault::crear(&passphrase, label.as_deref().unwrap_or("principal"))?;
    vault.public_label = public_label.filter(|s| !s.trim().is_empty());
    vault.escribir(&dir)?;
    sesion::desbloquear(&dir, clave.clone());

    // El cache tiene el proyecto en claro en memoria; al cifrar en disco cambia
    // cómo hay que leerlo, así que se vacía para que la siguiente lectura pase
    // por el camino nuevo.
    state.evict_from_cache(&project_id);

    let avance = conversion::cifrar_proyecto(&dir, &clave, |a| {
        let _ = app.emit("crypto:progress", a);
    })?;
    let _ = app.emit("db:projects-changed", ());
    Ok(avance)
}

/// Deja el proyecto en claro. Pide la frase aunque esté abierto: es una acción
/// que deshace la protección, y hacerla de un clic sería demasiado fácil.
#[tauri::command]
pub fn desactivar_cifrado(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    passphrase: String,
) -> Result<conversion::Avance, String> {
    let dir = state.project_dir(&project_id)?;
    let vault = Vault::leer(&dir)?.ok_or("Este proyecto no está cifrado")?;
    let clave = vault.abrir(&passphrase)?;
    sesion::desbloquear(&dir, clave.clone());

    let avance = conversion::descifrar_proyecto(&dir, &clave, |a| {
        let _ = app.emit("crypto:progress", a);
    })?;
    if avance.fallos.is_empty() {
        std::fs::remove_file(dir.join(crate::crypto::vault::FILE_NAME))
            .map_err(|e| format!("No se pudo retirar la cabecera del cifrado: {e}"))?;
        llavero::olvidar(&project_id);
        sesion::bloquear(&dir);
    }
    state.evict_from_cache(&project_id);
    let _ = app.emit("db:projects-changed", ());
    Ok(avance)
}

/// Abre el proyecto. `remember` guarda la clave en el llavero del sistema.
#[tauri::command]
pub fn abrir_proyecto_cifrado(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
    passphrase: String,
    remember: Option<bool>,
) -> Result<(), String> {
    let dir = state.project_dir(&project_id)?;
    let clave = sesion::abrir_con_frase(&dir, &passphrase)?;
    if remember.unwrap_or(false) {
        // Que el llavero no esté no puede impedir abrir el proyecto: se avisa
        // por el log y se sigue.
        if let Err(e) = llavero::recordar(&project_id, &clave) {
            log::warn!("No se pudo recordar la clave de {project_id}: {e}");
        }
    }
    state.evict_from_cache(&project_id);
    let _ = app.emit("db:projects-changed", ());
    Ok(())
}

/// Intenta abrirlo con lo que haya en el llavero. `false` si no hay nada.
#[tauri::command]
pub fn abrir_proyecto_recordado(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<bool, String> {
    let dir = state.project_dir(&project_id)?;
    let Some(clave) = llavero::recordada(&project_id) else {
        return Ok(false);
    };
    // Se comprueba contra el vault: una clave recordada de un proyecto que
    // cambió de clave no debe quedarse abriendo nada.
    let vault = Vault::leer(&dir)?.ok_or("Este proyecto no está cifrado")?;
    let vale = vault
        .slots
        .iter()
        .any(|_| true)
        && crate::crypto::archivo::cifrar(&clave, "prueba", b"x")
            .and_then(|c| crate::crypto::archivo::descifrar(&clave, "prueba", &c))
            .is_ok();
    if !vale {
        return Ok(false);
    }
    sesion::desbloquear(&dir, clave);
    state.evict_from_cache(&project_id);
    Ok(true)
}

/// Cierra el proyecto: la clave sale de memoria y el disco vuelve a no decir
/// nada.
#[tauri::command]
pub fn cerrar_proyecto_cifrado(
    app: AppHandle,
    state: State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let dir = state.project_dir(&project_id)?;
    crate::audit::log::close(&dir);
    sesion::bloquear(&dir);
    state.evict_from_cache(&project_id);
    let _ = app.emit("db:projects-changed", ());
    Ok(())
}

#[tauri::command]
pub fn cambiar_frase_cifrado(
    state: State<'_, AppState>,
    project_id: String,
    current: String,
    new: String,
) -> Result<(), String> {
    if new.trim().len() < 8 {
        return Err("La frase de paso es demasiado corta".into());
    }
    let dir = state.project_dir(&project_id)?;
    let mut vault = Vault::leer(&dir)?.ok_or("Este proyecto no está cifrado")?;
    vault.cambiar_frase(&current, &new)?;
    vault.escribir(&dir)
}

/// Añade una frase para otra persona que trabaja el mismo dataset.
#[tauri::command]
pub fn anadir_frase_cifrado(
    state: State<'_, AppState>,
    project_id: String,
    current: String,
    new: String,
    label: String,
) -> Result<String, String> {
    if new.trim().len() < 8 {
        return Err("La frase de paso es demasiado corta".into());
    }
    let dir = state.project_dir(&project_id)?;
    let mut vault = Vault::leer(&dir)?.ok_or("Este proyecto no está cifrado")?;
    let clave = vault.abrir(&current)?;
    let id = vault.anadir_ranura(&clave, &new, &label)?;
    vault.escribir(&dir)?;
    Ok(id)
}

#[tauri::command]
pub fn quitar_frase_cifrado(
    state: State<'_, AppState>,
    project_id: String,
    slot_id: String,
) -> Result<(), String> {
    let dir = state.project_dir(&project_id)?;
    let mut vault = Vault::leer(&dir)?.ok_or("Este proyecto no está cifrado")?;
    vault.quitar_ranura(&slot_id)?;
    vault.escribir(&dir)
}

/// La clave del proyecto, para dársela a quien comparte el dataset.
///
/// Quien la tenga puede leer el proyecto entero, así que sale sólo con el
/// proyecto abierto y queda anotado en la auditoría. Es también la única copia
/// de seguridad posible frente a una frase olvidada.
#[tauri::command]
pub fn exportar_clave_proyecto(
    state: State<'_, AppState>,
    project_id: String,
    passphrase: String,
) -> Result<String, String> {
    let dir = state.project_dir(&project_id)?;
    let vault = Vault::leer(&dir)?.ok_or("Este proyecto no está cifrado")?;
    let clave = vault.abrir(&passphrase)?;
    state.audit(
        &project_id,
        crate::audit::events::PROJECT_KEY_EXPORTED,
        serde_json::json!({}),
    );
    Ok(clave.exportar_compartida())
}

/// Monta la propia frase sobre la clave que llegó de otra persona.
///
/// Es el camino del par que recibe un dataset cifrado: los datos siguen cifrados
/// con la misma clave en las dos máquinas, y cada uno entra con su frase.
#[tauri::command]
pub fn importar_clave_proyecto(
    state: State<'_, AppState>,
    project_id: String,
    shared_key: String,
    passphrase: String,
    label: Option<String>,
) -> Result<(), String> {
    if passphrase.trim().len() < 8 {
        return Err("La frase de paso es demasiado corta".into());
    }
    let dir = state.project_dir(&project_id)?;
    let clave = ClaveProyecto::importar_compartida(&shared_key)?;
    let etiqueta = label.unwrap_or_else(|| "compartida".to_string());

    match Vault::leer(&dir)? {
        // Ya cifrado: la clave tiene que ser la suya, o abriría ruido.
        Some(mut vault) => {
            let prueba = crate::store::io::leer_archivo(&dir, "project.json");
            sesion::desbloquear(&dir, clave.clone());
            let ok = crate::store::io::leer_archivo(&dir, "project.json").is_ok();
            if !ok {
                sesion::bloquear(&dir);
                let _ = prueba;
                return Err("Esa clave no es la de este proyecto".into());
            }
            vault.anadir_ranura(&clave, &passphrase, &etiqueta)?;
            vault.escribir(&dir)?;
        }
        None => {
            let vault = Vault::para_clave(&clave, &passphrase, &etiqueta)?;
            vault.escribir(&dir)?;
            sesion::desbloquear(&dir, clave);
        }
    }
    state.evict_from_cache(&project_id);
    Ok(())
}
