use std::collections::HashMap;
use tauri::Emitter;

use crate::store::io;
use crate::store::state::AppState;

use super::node::{ActiveSession, P2pState};
use super::sync;
use super::ticket;
use super::{P2pSessionInfo, PeerRole, SessionRules, SessionStatus};

impl P2pState {
    /// Crea una nueva sesión P2P como host
    pub async fn create_session(
        &self,
        app_state: &AppState,
        project_id: &str,
        display_name: &str,
        rules: SessionRules,
    ) -> Result<P2pSessionInfo, String> {
        // Verificar que no haya sesión activa
        {
            let existing = self.session.read().await;
            if existing.is_some() {
                return Err("Ya hay una sesión P2P activa".to_string());
            }
        }

        // Leer proyecto
        let project = app_state.read_project_file(project_id)?;
        let images_dir = app_state.project_images_dir(project_id)?;

        // Iniciar nodo iroh
        let node = self.start_node().await?;

        // Crear autor
        let author = node.docs.author_create()
            .await
            .map_err(|e| format!("Error creando autor: {}", e))?;

        // Crear documento
        let doc = node.docs.create()
            .await
            .map_err(|e| format!("Error creando documento: {}", e))?;

        let namespace_id = doc.id();
        let my_node_id = P2pState::endpoint_id_str(&node.endpoint.id());

        // Generar secreto del host
        let host_secret = P2pState::generate_host_secret();
        let host_secret_hash = P2pState::hash_secret(&host_secret);

        // Generar ticket de compartir
        let ticket = doc.share(
            iroh_docs::api::protocol::ShareMode::Write,
            iroh_docs::api::protocol::AddrInfoOptions::RelayAndAddresses,
        )
        .await
        .map_err(|e| format!("Error generando ticket: {}", e))?;

        let share_code = ticket::encode_share_code(&ticket);
        let session_id = uuid::Uuid::new_v4().to_string();

        // Crear sesión activa
        let session = ActiveSession {
            session_id: session_id.clone(),
            project_id: project_id.to_string(),
            project_name: project.name.clone(),
            share_code: share_code.clone(),
            role: PeerRole::Host,
            rules: rules.clone(),
            my_display_name: display_name.to_string(),
            my_node_id: my_node_id.clone(),
            namespace_id,
            author_id: author,
            peers: HashMap::new(),
            node: node.clone(),
            host_secret: Some(host_secret.clone()),
        };

        // Guardar sesión
        {
            let mut session_guard = self.session.write().await;
            *session_guard = Some(session);
        }

        // Exportar proyecto al doc (incluye meta, clases, imágenes)
        sync::project_to_doc(self, &project, &images_dir).await?;

        // Escribir host_secret_hash, host_node_id y rules al doc
        sync::write_host_meta(self, &host_secret_hash, &my_node_id, &rules).await?;

        // Iniciar sync del doc
        let doc = node.docs.open(namespace_id)
            .await
            .map_err(|e| format!("Error reabriendo doc: {}", e))?
            .ok_or("Doc no encontrado")?;

        doc.start_sync(vec![])
            .await
            .map_err(|e| format!("Error iniciando sync: {}", e))?;

        let host_key = ticket::encode_host_key(&host_secret, &share_code);

        log::info!(
            "Sesión P2P creada: {} (proyecto: {}, código: {})",
            session_id,
            project.name,
            share_code
        );

        Ok(P2pSessionInfo {
            session_id,
            project_id: project_id.to_string(),
            project_name: project.name,
            share_code,
            host_key: Some(host_key),
            role: PeerRole::Host,
            rules,
            my_node_id,
            my_display_name: display_name.to_string(),
            peers: vec![],
            status: SessionStatus::Connected,
        })
    }

    /// Se une a una sesión P2P existente como colaborador
    pub async fn join_session(
        &self,
        app_state: &AppState,
        app_handle: &tauri::AppHandle,
        share_code: &str,
        display_name: &str,
    ) -> Result<P2pSessionInfo, String> {
        // Verificar que no haya sesión activa
        {
            let existing = self.session.read().await;
            if existing.is_some() {
                return Err("Ya hay una sesión P2P activa".to_string());
            }
        }

        // Detectar si es host key o share code
        let (ticket, host_secret) = if ticket::is_host_key(share_code) {
            let (t, secret) = ticket::decode_host_key(share_code)?;
            (t, Some(secret))
        } else {
            (ticket::decode_share_code(share_code)?, None)
        };

        // Iniciar nodo iroh
        let node = self.start_node().await?;
        let my_node_id = P2pState::endpoint_id_str(&node.endpoint.id());

        // Crear autor local
        let author = node.docs.author_create()
            .await
            .map_err(|e| format!("Error creando autor: {}", e))?;

        let _ = app_handle.emit("p2p:session-status", serde_json::json!({
            "status": "connecting",
        }));

        // Importar doc desde ticket (subscribe + sync)
        let (doc, _events) = node.docs.import_and_subscribe(ticket)
            .await
            .map_err(|e| format!("Error importando documento: {}", e))?;

        let namespace_id = doc.id();

        let _ = app_handle.emit("p2p:session-status", serde_json::json!({
            "status": "syncing",
        }));

        // Esperar para que se sincronicen las entradas iniciales
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;

        // Verificar si es host (si proporcionó host key)
        let (role, verified_secret) = if let Some(ref secret) = host_secret {
            let is_valid = sync::verify_host_secret(self, secret, &node, namespace_id).await;
            if is_valid {
                (PeerRole::Host, Some(secret.clone()))
            } else {
                return Err("Clave de host inválida".to_string());
            }
        } else {
            (PeerRole::Collaborator, None)
        };

        // Leer reglas del doc
        let rules = sync::read_rules_from_doc(&node, namespace_id).await
            .unwrap_or_default();

        let session_id = uuid::Uuid::new_v4().to_string();

        // Generar share_code limpio (sin host secret)
        let clean_share_code = if ticket::is_host_key(share_code) {
            // Re-codificar solo el ticket
            let (t, _) = ticket::decode_host_key(share_code)?;
            ticket::encode_share_code(&t)
        } else {
            share_code.to_string()
        };

        // Crear sesión
        let session = ActiveSession {
            session_id: session_id.clone(),
            project_id: String::new(),
            project_name: String::new(),
            share_code: clean_share_code.clone(),
            role: role.clone(),
            rules: rules.clone(),
            my_display_name: display_name.to_string(),
            my_node_id: my_node_id.clone(),
            namespace_id,
            author_id: author,
            peers: HashMap::new(),
            node: node.clone(),
            host_secret: verified_secret,
        };

        {
            let mut session_guard = self.session.write().await;
            *session_guard = Some(session);
        }

        // Registrar este peer en el doc
        let role_str = match role {
            PeerRole::Host => "host",
            PeerRole::Collaborator => "collaborator",
        };
        let peer_info_json = serde_json::json!({
            "display_name": display_name,
            "role": role_str,
            "joined_at": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as f64,
        });
        let peer_key = format!("meta/peers/{}", my_node_id);
        doc.set_bytes(author, peer_key.into_bytes(), serde_json::to_vec(&peer_info_json).unwrap())
            .await
            .map_err(|e| format!("Error registrando peer: {}", e))?;

        // Reconstruir proyecto desde el doc
        let projects_dir = app_state.projects_dir()?;
        let project = sync::doc_to_project(self, &projects_dir, app_handle).await?;

        let project_id = project.id.clone();
        let project_name = project.name.clone();
        let project_dir = projects_dir.join(&project_id);

        // Crear directorio del proyecto
        std::fs::create_dir_all(project_dir.join("thumbnails"))
            .map_err(|e| format!("Error creando directorio: {}", e))?;
        std::fs::create_dir_all(project_dir.join("videos"))
            .map_err(|e| format!("Error creando directorio: {}", e))?;

        // Guardar project.json
        io::write_project(&project_dir, &project)?;

        // Insertar en cache del AppState
        app_state.insert_into_cache(&project_id, project, project_dir);

        // Actualizar sesión con project_id
        {
            let mut session_guard = self.session.write().await;
            if let Some(ref mut session) = *session_guard {
                session.project_id = project_id.clone();
                session.project_name = project_name.clone();
            }
        }

        let _ = app_handle.emit("p2p:session-status", serde_json::json!({
            "status": "connected",
        }));

        log::info!(
            "Unido a sesión P2P: {} (proyecto: {}, rol: {})",
            session_id,
            project_name,
            role_str
        );

        let host_key = if role == PeerRole::Host {
            host_secret.map(|s| ticket::encode_host_key(&s, &clean_share_code))
        } else {
            None
        };

        Ok(P2pSessionInfo {
            session_id,
            project_id,
            project_name,
            share_code: clean_share_code,
            host_key,
            role,
            rules,
            my_node_id,
            my_display_name: display_name.to_string(),
            peers: vec![],
            status: SessionStatus::Connected,
        })
    }

    /// Abandona la sesión P2P activa
    pub async fn leave_session(&self) -> Result<(), String> {
        let mut session_guard = self.session.write().await;
        if let Some(session) = session_guard.take() {
            let session_id = session.session_id.clone();

            // Dejar de sincronizar el doc
            if let Ok(Some(doc)) = session.node.docs.open(session.namespace_id).await {
                let _ = doc.leave().await;
                let _ = doc.close().await;
            }

            // Cerrar docs engine
            drop(session);

            log::info!("Sesión P2P abandonada: {}", session_id);
        }
        Ok(())
    }

    /// Obtiene info de la sesión activa
    pub async fn get_session_info(&self) -> Option<P2pSessionInfo> {
        let session = self.session.read().await;
        session.as_ref().map(|s| s.to_info())
    }

    /// Lista los peers conectados
    pub async fn list_peers(&self) -> Result<Vec<super::PeerInfo>, String> {
        let session = self.session.read().await;
        let session = session.as_ref().ok_or("No hay sesión P2P activa")?;
        Ok(session.peers.values().cloned().collect())
    }

    /// Actualiza las reglas de la sesión (solo host)
    pub async fn update_rules(&self, new_rules: SessionRules) -> Result<(), String> {
        // Verificar que somos host
        {
            let session = self.session.read().await;
            let session = session.as_ref().ok_or("No hay sesión P2P activa")?;
            if session.role != PeerRole::Host {
                return Err("Solo el host puede modificar las reglas".to_string());
            }
        }

        // Escribir reglas al doc
        sync::write_rules(self, &new_rules).await?;

        // Actualizar local
        {
            let mut session_guard = self.session.write().await;
            if let Some(ref mut session) = *session_guard {
                session.rules = new_rules;
            }
        }

        Ok(())
    }

    /// Obtiene las reglas actuales
    pub async fn get_rules(&self) -> Result<SessionRules, String> {
        let session = self.session.read().await;
        let session = session.as_ref().ok_or("No hay sesión P2P activa")?;
        Ok(session.rules.clone())
    }
}
