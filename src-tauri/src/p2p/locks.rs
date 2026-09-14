use std::time::{SystemTime, UNIX_EPOCH};

use super::node::P2pState;
use super::ImageLockInfo;

/// TTL de un lock: 3 minutos en milisegundos (presencia activa)
const LOCK_TTL_MS: f64 = 3.0 * 60.0 * 1000.0;

/// Intervalo de renovación: 1 minuto en milisegundos
#[allow(dead_code)]
pub const LOCK_RENEW_INTERVAL_MS: u64 = 60 * 1000;

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}

/// Clave del lock de una imagen para un evaluador concreto.
///
/// El lock pasó de ser por imagen a ser por **(imagen, evaluador)**. Con lectura
/// múltiple, el lock por imagen excluía justo lo que la sesión quiere permitir:
/// que dos personas lean la misma muestra por separado.
pub fn lock_key(image_id: &str, node_id: &str) -> String {
    format!("images/{}/lock/{}", image_id, node_id)
}

/// Prefijo bajo el que viven todos los locks de una imagen.
pub fn lock_prefix(image_id: &str) -> String {
    format!("images/{}/lock/", image_id)
}

/// ¿Queda sitio para que `yo` tome esta imagen?
///
/// Hay sitio si ya la tengo yo —renovar el propio lock siempre vale— o si los
/// locks vivos de **otras** personas no llegan a las lecturas que la sesión pide.
/// Con replicación 1 esto es el comportamiento de siempre: una imagen, una
/// persona.
///
/// Los locks caducados no cuentan: son de alguien que cerró la app o se quedó sin
/// red, y tratarlos como vivos dejaría la muestra bloqueada para siempre.
pub fn hay_cupo(locks: &[ImageLockInfo], yo: &str, replicacion: usize, ahora: f64) -> bool {
    let vivos_de_otros = locks
        .iter()
        .filter(|l| l.expires_at > ahora && l.locked_by != yo)
        .count();
    let ya_es_mio = locks
        .iter()
        .any(|l| l.expires_at > ahora && l.locked_by == yo);

    ya_es_mio || vivos_de_otros < replicacion.max(1)
}

/// Lee todos los locks de una imagen, de cualquier autor.
///
/// `get_exact` no sirve aquí: sólo devuelve la entrada de **un** autor, y con el
/// lock por evaluador la pregunta es qué escribió cada uno bajo el mismo prefijo.
async fn leer_locks(
    doc: &iroh_docs::api::Doc,
    blobs: &iroh_blobs::api::Store,
    image_id: &str,
) -> Result<Vec<ImageLockInfo>, String> {
    use futures_lite::StreamExt;

    let entries = doc
        .get_many(iroh_docs::store::Query::key_prefix(
            lock_prefix(image_id).as_bytes(),
        ))
        .await
        .map_err(|e| format!("Error leyendo locks: {}", e))?;

    let mut out = Vec::new();
    futures_lite::pin!(entries);
    while let Some(entry) = entries.next().await {
        let entry = entry.map_err(|e| format!("Error en stream de locks: {}", e))?;
        let Ok(content) = blobs.blobs().get_bytes(entry.content_hash()).await else {
            continue;
        };
        if let Ok(lock) = serde_json::from_slice::<ImageLockInfo>(&content) {
            out.push(lock);
        }
    }
    Ok(out)
}

impl P2pState {
    /// Intenta bloquear una imagen. Retorna true si se obtuvo el lock.
    pub async fn lock_image(&self, project_id: &str, image_id: &str) -> Result<bool, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(project_id)
            .ok_or("No hay sesión P2P activa para este proyecto")?;

        let doc = node
            .docs
            .open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let blobs: &iroh_blobs::api::Store = &node.blobs_store;

        // Todos los locks vivos de esta imagen, de quien sea: con lectura múltiple
        // la pregunta ya no es «¿está tomada?» sino «¿queda sitio?».
        let locks = leer_locks(&doc, blobs, image_id).await?;
        let replicacion = session.rules.replicacion_efectiva(session.peers.len() + 1);
        if !hay_cupo(&locks, &session.my_node_id, replicacion, now_ms()) {
            return Ok(false);
        }

        // Crear/renovar lock
        let now = now_ms();
        let lock_info = ImageLockInfo {
            image_id: image_id.to_string(),
            locked_by: session.my_node_id.clone(),
            locked_by_name: session.my_display_name.clone(),
            locked_at: now,
            expires_at: now + LOCK_TTL_MS,
        };

        let lock_json = serde_json::to_vec(&lock_info)
            .map_err(|e| format!("Error serializando lock: {}", e))?;

        doc.set_bytes(
            session.author_id,
            lock_key(image_id, &session.my_node_id).into_bytes(),
            lock_json,
        )
        .await
        .map_err(|e| format!("Error escribiendo lock: {}", e))?;

        Ok(true)
    }

    /// Desbloquea una imagen (solo si somos dueños del lock)
    pub async fn unlock_image(&self, project_id: &str, image_id: &str) -> Result<(), String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(project_id)
            .ok_or("No hay sesión P2P activa para este proyecto")?;

        let doc = node
            .docs
            .open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        // Sólo el propio: soltar el de otro sería quitarle la muestra de las manos.
        doc.del(
            session.author_id,
            lock_key(image_id, &session.my_node_id).into_bytes(),
        )
        .await
        .map_err(|e| format!("Error borrando lock: {}", e))?;

        Ok(())
    }

    /// Lee el estado de lock de una imagen
    pub async fn get_image_lock(
        &self,
        project_id: &str,
        image_id: &str,
    ) -> Result<Option<ImageLockInfo>, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(project_id)
            .ok_or("No hay sesión P2P activa para este proyecto")?;

        let doc = node
            .docs
            .open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let blobs: &iroh_blobs::api::Store = &node.blobs_store;
        let ahora = now_ms();
        // El primero vivo que no sea el propio: es el que la UI enseña como «la
        // está mirando alguien».
        Ok(leer_locks(&doc, blobs, image_id)
            .await?
            .into_iter()
            .find(|l| l.expires_at > ahora && l.locked_by != session.my_node_id))
    }

    /// Todos los locks vivos de una imagen, para saber cuántas lecturas hay en
    /// marcha.
    pub async fn get_image_locks(
        &self,
        project_id: &str,
        image_id: &str,
    ) -> Result<Vec<ImageLockInfo>, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(project_id)
            .ok_or("No hay sesión P2P activa para este proyecto")?;

        let doc = node
            .docs
            .open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let ahora = now_ms();
        Ok(leer_locks(&doc, &node.blobs_store, image_id)
            .await?
            .into_iter()
            .filter(|l| l.expires_at > ahora)
            .collect())
    }

    /// Asigna un batch de imágenes a un colaborador (solo host)
    pub async fn assign_batch(
        &self,
        project_id: &str,
        image_ids: Vec<String>,
        assign_to_node_id: &str,
    ) -> Result<super::BatchInfo, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(project_id)
            .ok_or("No hay sesión P2P activa para este proyecto")?;

        if !session.role.can_manage() {
            return Err("Solo el host puede asignar lotes".to_string());
        }

        let doc = node
            .docs
            .open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let batch_id = uuid::Uuid::new_v4().to_string();
        let assigned_to_name = session
            .peers
            .get(assign_to_node_id)
            .map(|p| p.display_name.clone())
            .unwrap_or_else(|| assign_to_node_id.to_string());

        let batch = super::BatchInfo {
            id: batch_id.clone(),
            image_ids,
            assigned_to: assign_to_node_id.to_string(),
            assigned_to_name,
            created_at: now_ms(),
        };

        let batch_json =
            serde_json::to_vec(&batch).map_err(|e| format!("Error serializando batch: {}", e))?;

        let key = format!("batches/{}", batch_id);
        doc.set_bytes(session.author_id, key.into_bytes(), batch_json)
            .await
            .map_err(|e| format!("Error escribiendo batch: {}", e))?;

        Ok(batch)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lock(quien: &str, expira: f64) -> ImageLockInfo {
        ImageLockInfo {
            image_id: "img-1".into(),
            locked_by: quien.into(),
            locked_by_name: quien.into(),
            locked_at: 0.0,
            expires_at: expira,
        }
    }

    /// Con una sola lectura por muestra, el lock es el de siempre: quien llega
    /// segundo se queda fuera.
    #[test]
    fn con_una_lectura_la_imagen_es_de_uno_solo() {
        let locks = vec![lock("ana", 1_000.0)];
        assert!(!hay_cupo(&locks, "beto", 1, 500.0));
        assert!(hay_cupo(&locks, "ana", 1, 500.0), "no pudo renovar el suyo");
    }

    /// Con dos lecturas, dos personas distintas pueden tener la misma imagen: es
    /// justo lo que el lock por imagen impedía.
    #[test]
    fn con_dos_lecturas_caben_dos_evaluadores() {
        let mut locks = vec![lock("ana", 1_000.0)];
        assert!(hay_cupo(&locks, "beto", 2, 500.0));
        locks.push(lock("beto", 1_000.0));
        assert!(
            !hay_cupo(&locks, "carla", 2, 500.0),
            "entró una tercera lectura"
        );
    }

    /// Un lock caducado es de alguien que cerró la app o se quedó sin red.
    /// Contarlo como vivo dejaría la muestra bloqueada para siempre.
    #[test]
    fn un_lock_caducado_no_ocupa_sitio() {
        let locks = vec![lock("ana", 100.0)];
        assert!(hay_cupo(&locks, "beto", 1, 500.0));
    }

    /// El propio lock se renueva aunque no quede cupo: si no, el evaluador
    /// perdería la muestra que está anotando al renovar.
    #[test]
    fn renovar_el_propio_lock_siempre_vale() {
        let locks = vec![lock("ana", 1_000.0), lock("beto", 1_000.0)];
        assert!(hay_cupo(&locks, "ana", 1, 500.0));
        assert!(!hay_cupo(&locks, "carla", 1, 500.0));
    }

    /// La clave lleva el evaluador: sin eso, dos lecturas de la misma imagen
    /// escribirían sobre la misma entrada y una borraría a la otra.
    #[test]
    fn la_clave_del_lock_distingue_evaluadores() {
        assert_eq!(lock_key("img-1", "ana"), "images/img-1/lock/ana");
        assert_ne!(lock_key("img-1", "ana"), lock_key("img-1", "beto"));
        assert!(lock_key("img-1", "ana").starts_with(&lock_prefix("img-1")));
    }
}
