use std::time::{SystemTime, UNIX_EPOCH};

use super::node::P2pState;
use super::ImageLockInfo;

/// TTL de un lock: 30 minutos en milisegundos
const LOCK_TTL_MS: f64 = 30.0 * 60.0 * 1000.0;

/// Intervalo de renovación: 10 minutos en milisegundos
#[allow(dead_code)]
pub const LOCK_RENEW_INTERVAL_MS: u64 = 10 * 60 * 1000;

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}

impl P2pState {
    /// Intenta bloquear una imagen. Retorna true si se obtuvo el lock.
    pub async fn lock_image(&self, project_id: &str, image_id: &str) -> Result<bool, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

        let doc = node.docs.open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let lock_key = format!("images/{}/lock", image_id);
        let blobs: &iroh_blobs::api::Store = &*node.blobs_store;

        // Verificar si ya existe un lock no expirado
        let existing = doc
            .get_exact(session.author_id, lock_key.as_bytes(), false)
            .await
            .map_err(|e| format!("Error leyendo lock: {}", e))?;

        if let Some(entry) = existing {
            let hash = entry.content_hash();
            if let Ok(content) = blobs.blobs().get_bytes(hash).await {
                if let Ok(lock_info) = serde_json::from_slice::<ImageLockInfo>(&content) {
                    if lock_info.expires_at > now_ms() && lock_info.locked_by != session.my_node_id {
                        return Ok(false); // Lock activo de otro peer
                    }
                }
            }
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

        doc.set_bytes(session.author_id, lock_key.into_bytes(), lock_json)
            .await
            .map_err(|e| format!("Error escribiendo lock: {}", e))?;

        Ok(true)
    }

    /// Desbloquea una imagen (solo si somos dueños del lock)
    pub async fn unlock_image(&self, project_id: &str, image_id: &str) -> Result<(), String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

        let doc = node.docs.open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let lock_key = format!("images/{}/lock", image_id);

        // Borrar lock
        doc.del(session.author_id, lock_key.into_bytes())
            .await
            .map_err(|e| format!("Error borrando lock: {}", e))?;

        Ok(())
    }

    /// Lee el estado de lock de una imagen
    pub async fn get_image_lock(&self, project_id: &str, image_id: &str) -> Result<Option<ImageLockInfo>, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

        let doc = node.docs.open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let lock_key = format!("images/{}/lock", image_id);
        let blobs: &iroh_blobs::api::Store = &*node.blobs_store;

        let entry = doc
            .get_exact(session.author_id, lock_key.as_bytes(), false)
            .await
            .map_err(|e| format!("Error leyendo lock: {}", e))?;

        match entry {
            Some(entry) => {
                let hash = entry.content_hash();
                let content = blobs.blobs().get_bytes(hash)
                    .await
                    .map_err(|e| format!("Error leyendo contenido: {}", e))?;
                let lock_info: ImageLockInfo = serde_json::from_slice(&content)
                    .map_err(|e| format!("Error deserializando lock: {}", e))?;

                if lock_info.expires_at > now_ms() {
                    Ok(Some(lock_info))
                } else {
                    Ok(None) // Expirado
                }
            }
            None => Ok(None),
        }
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
        let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

        if !session.role.can_manage() {
            return Err("Solo el host puede asignar lotes".to_string());
        }

        let doc = node.docs.open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let batch_id = uuid::Uuid::new_v4().to_string();
        let assigned_to_name = session.peers.get(assign_to_node_id)
            .map(|p| p.display_name.clone())
            .unwrap_or_else(|| assign_to_node_id.to_string());

        let batch = super::BatchInfo {
            id: batch_id.clone(),
            image_ids,
            assigned_to: assign_to_node_id.to_string(),
            assigned_to_name,
            created_at: now_ms(),
        };

        let batch_json = serde_json::to_vec(&batch)
            .map_err(|e| format!("Error serializando batch: {}", e))?;

        let key = format!("batches/{}", batch_id);
        doc.set_bytes(session.author_id, key.into_bytes(), batch_json)
            .await
            .map_err(|e| format!("Error escribiendo batch: {}", e))?;

        Ok(batch)
    }
}
