use std::collections::HashMap;
use tauri::{Emitter, Manager};

use crate::store::io;
use crate::store::project_file::P2pProjectConfig;
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
        app_handle: &tauri::AppHandle,
        project_id: &str,
        display_name: &str,
        rules: SessionRules,
    ) -> Result<P2pSessionInfo, String> {
        // Verificar que no haya sesión activa para este proyecto
        {
            let sessions = self.sessions.read().await;
            if sessions.contains_key(project_id) {
                return Err("Ya hay una sesión P2P activa para este proyecto".to_string());
            }
        }

        // Leer proyecto
        let project = app_state.read_project_file(project_id)?;
        let images_dir = app_state.project_images_dir(project_id)?;

        // Obtener o crear nodo iroh compartido
        let node = self.get_or_create_node().await?;

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

        // Crear sesión activa (sin campo node)
        let session = ActiveSession {
            session_id: session_id.clone(),
            project_id: project_id.to_string(),
            project_name: project.name.clone(),
            share_code: share_code.clone(),
            role: PeerRole::LeadResearcher,
            rules: rules.clone(),
            my_display_name: display_name.to_string(),
            my_node_id: my_node_id.clone(),
            namespace_id,
            author_id: author,
            peers: HashMap::new(),
            host_secret: Some(host_secret.clone()),
        };

        // Insertar sesión en el HashMap
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(project_id.to_string(), session);
        }

        // Exportar proyecto al doc (incluye meta, clases, imágenes con blobs)
        sync::project_to_doc(self, project_id, &project, &images_dir, app_handle).await?;

        // Escribir host_secret_hash, host_node_id y rules al doc
        sync::write_host_meta(self, project_id, &host_secret_hash, &my_node_id, &rules).await?;

        // Iniciar sync del doc
        let doc = node.docs.open(namespace_id)
            .await
            .map_err(|e| format!("Error reabriendo doc: {}", e))?
            .ok_or("Doc no encontrado")?;

        doc.start_sync(vec![])
            .await
            .map_err(|e| format!("Error iniciando sync: {}", e))?;

        // Iniciar watcher de cambios remotos
        sync::start_doc_watcher(namespace_id, project_id.to_string(), node.docs.clone(), node.blobs_store.clone(), app_handle.clone());

        // Iniciar heartbeat para presencia
        sync::start_heartbeat(
            namespace_id,
            author,
            my_node_id.clone(),
            display_name.to_string(),
            "lead_researcher".to_string(),
            node.docs.clone(),
        );

        let host_key = ticket::encode_host_key(&host_secret, &share_code);

        // Persistir config P2P en project.json para auto-resume
        app_state.with_project_mut(project_id, |pf| {
            pf.p2p = Some(P2pProjectConfig {
                role: "lead_researcher".to_string(),
                host_secret: Some(host_secret.clone()),
                display_name: display_name.to_string(),
                namespace_id: format!("{}", namespace_id),
                rules: serde_json::to_value(&rules).unwrap_or_default(),
            });
        })?;

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
            role: PeerRole::LeadResearcher,
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
        // Detectar si es host key o share code
        let (ticket, host_secret) = if ticket::is_host_key(share_code) {
            let (t, secret) = ticket::decode_host_key(share_code)?;
            (t, Some(secret))
        } else {
            (ticket::decode_share_code(share_code)?, None)
        };

        // Obtener o crear nodo iroh compartido
        let node = self.get_or_create_node().await?;
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

        // Esperar a que se sincronice meta/project (polling con timeout de 30s)
        let blobs_ref: &iroh_blobs::api::Store = &*node.blobs_store;
        let poll_interval = std::time::Duration::from_millis(500);
        let max_wait = std::time::Duration::from_secs(30);
        let started = std::time::Instant::now();
        loop {
            if started.elapsed() >= max_wait {
                return Err("Timeout: no se pudieron sincronizar los metadatos del proyecto. Verifica que el host esté en línea.".to_string());
            }
            match doc.get_one(iroh_docs::store::Query::key_exact(b"meta/project")).await {
                Ok(Some(entry)) => {
                    // Verificar que podemos leer el contenido
                    if blobs_ref.blobs().get_bytes(entry.content_hash()).await.is_ok() {
                        log::info!("meta/project sincronizado en {:?}", started.elapsed());
                        break;
                    }
                }
                _ => {}
            }
            tokio::time::sleep(poll_interval).await;
        }

        // Verificar si es lead researcher (si proporcionó host key)
        let (role, verified_secret) = if let Some(ref secret) = host_secret {
            let is_valid = sync::verify_host_secret(self, secret, &node, namespace_id).await;
            if is_valid {
                (PeerRole::LeadResearcher, Some(secret.clone()))
            } else {
                return Err("Clave de host inválida".to_string());
            }
        } else {
            (PeerRole::Annotator, None)
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

        // Registrar este peer en el doc
        let role_str = role.to_string();
        let peer_info_json = serde_json::json!({
            "display_name": display_name,
            "role": &role_str,
            "joined_at": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as f64,
        });
        let peer_key = format!("meta/peers/{}", my_node_id);
        doc.set_bytes(author, peer_key.into_bytes(), serde_json::to_vec(&peer_info_json).unwrap())
            .await
            .map_err(|e| format!("Error registrando peer: {}", e))?;

        // Iniciar heartbeat para presencia (no depende del project_id)
        sync::start_heartbeat(
            namespace_id,
            author,
            my_node_id.clone(),
            display_name.to_string(),
            role_str.clone(),
            node.docs.clone(),
        );

        // Fase 1: Reconstruir proyecto desde el doc (solo metadata, sin blobs)
        // doc_to_project_metadata toma node, namespace_id, author_id directamente
        // (la sesión aún no está en el HashMap)
        let projects_dir = app_state.projects_dir()?;
        let project = sync::doc_to_project_metadata(&node, namespace_id, author, &projects_dir).await?;

        let project_id = project.id.clone();

        // Iniciar watcher de cambios remotos y emitir peers existentes
        // (DESPUÉS de tener el project_id real para que los eventos se asocien correctamente)
        sync::start_doc_watcher(namespace_id, project_id.clone(), node.docs.clone(), node.blobs_store.clone(), app_handle.clone());
        sync::emit_existing_peers(namespace_id, &node.docs, &node.blobs_store, app_handle, &my_node_id, &project_id).await;
        let project_name = project.name.clone();
        let has_pending_images = project.p2p_download.is_some();
        let project_dir = projects_dir.join(&project_id);

        // Verificar que no haya sesión activa para este proyecto
        {
            let sessions = self.sessions.read().await;
            if sessions.contains_key(&project_id) {
                return Err("Ya hay una sesión P2P activa para este proyecto".to_string());
            }
        }

        // Crear directorio del proyecto
        std::fs::create_dir_all(project_dir.join("thumbnails"))
            .map_err(|e| format!("Error creando directorio: {}", e))?;
        std::fs::create_dir_all(project_dir.join("videos"))
            .map_err(|e| format!("Error creando directorio: {}", e))?;

        // Guardar project.json
        io::write_project(&project_dir, &project)?;

        // Insertar en cache del AppState
        app_state.insert_into_cache(&project_id, project, project_dir);

        // Notificar al frontend que hay un nuevo proyecto
        let _ = app_handle.emit("db:projects-changed", ());

        // Crear sesión activa e insertar en HashMap con el project_id real
        let session = ActiveSession {
            session_id: session_id.clone(),
            project_id: project_id.clone(),
            project_name: project_name.clone(),
            share_code: clean_share_code.clone(),
            role: role.clone(),
            rules: rules.clone(),
            my_display_name: display_name.to_string(),
            my_node_id: my_node_id.clone(),
            namespace_id,
            author_id: author,
            peers: HashMap::new(),
            host_secret: verified_secret,
        };

        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(project_id.clone(), session);
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

        let host_key = if role == PeerRole::LeadResearcher {
            host_secret.as_ref().map(|s| ticket::encode_host_key(s, &clean_share_code))
        } else {
            None
        };

        // Persistir config P2P en project.json para auto-resume (todos los roles)
        let _ = app_state.with_project_mut(&project_id, |pf| {
            pf.p2p = Some(P2pProjectConfig {
                role: role_str.clone(),
                host_secret: host_secret.clone(),
                display_name: display_name.to_string(),
                namespace_id: format!("{}", namespace_id),
                rules: serde_json::to_value(&rules).unwrap_or_default(),
            });
        });

        // Fase 2: Lanzar descarga de blobs en background
        if has_pending_images {
            let app_handle_bg = app_handle.clone();
            let project_id_bg = project_id.clone();
            tokio::spawn(async move {
                let p2p = app_handle_bg.state::<P2pState>();
                let state = app_handle_bg.state::<AppState>();
                if let Err(e) = sync::download_project_images(&p2p, &state, &project_id_bg, &app_handle_bg).await {
                    log::warn!("Error en descarga background P2P: {}", e);
                }
            });
        }

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

    /// Pausa la sesión P2P activa sin borrar datos (permite reanudar después)
    pub async fn pause_session(&self, project_id: &str) -> Result<String, String> {
        let session = {
            let mut sessions = self.sessions.write().await;
            sessions.remove(project_id)
                .ok_or("No hay sesión P2P activa para este proyecto")?
        };

        let session_id = session.session_id.clone();

        // Obtener nodo compartido para operaciones de doc
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;

        // Notificar a los peers que la sesión se cierra
        if let Ok(Some(doc)) = node.docs.open(session.namespace_id).await {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as f64;

            // Marcar este peer como "left"
            let peer_key = format!("meta/peers/{}", session.my_node_id);
            let left_info = serde_json::json!({
                "display_name": session.my_display_name,
                "role": session.role.to_string(),
                "left": true,
                "left_at": now,
            });
            let _ = doc.set_bytes(
                session.author_id,
                peer_key.into_bytes(),
                serde_json::to_vec(&left_info).unwrap(),
            ).await;

            // Si somos host, notificar cierre de sesión
            if session.role.can_manage() {
                let close_info = serde_json::json!({
                    "timestamp": now,
                    "reason": "host_paused",
                });
                let _ = doc.set_bytes(
                    session.author_id,
                    b"meta/session_closed".to_vec(),
                    serde_json::to_vec(&close_info).unwrap(),
                ).await;
            }

            // Breve espera para propagación
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            let _ = doc.leave().await;
            let _ = doc.close().await;
        }

        // Liberar la sesión de memoria
        drop(session);
        drop(node_guard);

        // NO borramos iroh/ del disco
        // NO limpiamos p2p del project.json (necesario para resume)

        // Cerrar nodo si no quedan sesiones
        self.maybe_shutdown_node().await;

        log::info!("Sesión P2P pausada: {} (proyecto: {})", session_id, project_id);
        Ok(project_id.to_string())
    }

    /// Abandona la sesión P2P activa y limpia datos de iroh
    pub async fn leave_session(&self, project_id: &str, app_state: &AppState) -> Result<(), String> {
        let session = {
            let mut sessions = self.sessions.write().await;
            sessions.remove(project_id)
        };

        if let Some(session) = session {
            let session_id = session.session_id.clone();

            // Obtener nodo compartido para operaciones de doc
            let node_guard = self.node.read().await;
            if let Some(ref node) = *node_guard {
                // Notificar a los peers que este peer sale
                if let Ok(Some(doc)) = node.docs.open(session.namespace_id).await {
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as f64;

                    // Marcar este peer como "left"
                    let peer_key = format!("meta/peers/{}", session.my_node_id);
                    let left_info = serde_json::json!({
                        "display_name": session.my_display_name,
                        "role": session.role.to_string(),
                        "left": true,
                        "left_at": now,
                    });
                    let _ = doc.set_bytes(
                        session.author_id,
                        peer_key.into_bytes(),
                        serde_json::to_vec(&left_info).unwrap(),
                    ).await;

                    // Si somos host, notificar cierre de sesión
                    if session.role.can_manage() {
                        let close_info = serde_json::json!({
                            "timestamp": now,
                            "reason": "host_left",
                        });
                        let _ = doc.set_bytes(
                            session.author_id,
                            b"meta/session_closed".to_vec(),
                            serde_json::to_vec(&close_info).unwrap(),
                        ).await;
                    }

                    // Breve espera para propagación
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    let _ = doc.leave().await;
                    let _ = doc.close().await;
                }
            }
            drop(node_guard);

            // Cerrar docs engine y nodo
            drop(session);

            // Limpiar p2p del project.json
            if !project_id.is_empty() {
                let _ = app_state.with_project_mut(project_id, |pf| {
                    pf.p2p = None;
                });
            }

            // Solo borrar iroh/ si no hay otras sesiones activas ni otros proyectos con p2p config
            let has_other_sessions = {
                let sessions = self.sessions.read().await;
                !sessions.is_empty()
            };
            let has_other_p2p = self.other_projects_have_p2p(app_state, project_id);
            let iroh_dir = self.data_dir.join("iroh");
            if iroh_dir.exists() && !has_other_p2p && !has_other_sessions {
                if let Err(e) = std::fs::remove_dir_all(&iroh_dir) {
                    log::warn!("No se pudo limpiar directorio iroh: {}", e);
                } else {
                    log::info!("Datos iroh limpiados: {:?}", iroh_dir);
                }
            } else if has_other_p2p || has_other_sessions {
                log::info!("No se borran datos iroh: hay otros proyectos con sesiones P2P");
            }

            // Cerrar nodo si no quedan sesiones
            self.maybe_shutdown_node().await;

            log::info!("Sesión P2P abandonada: {}", session_id);
        }
        Ok(())
    }

    /// Verifica si hay otros proyectos (distintos de `exclude_id`) con config p2p
    fn other_projects_have_p2p(&self, app_state: &AppState, exclude_id: &str) -> bool {
        let projects_dir = match app_state.projects_dir() {
            Ok(d) => d,
            Err(_) => return false,
        };
        if !projects_dir.exists() {
            return false;
        }
        let entries = match std::fs::read_dir(&projects_dir) {
            Ok(e) => e,
            Err(_) => return false,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() || !path.join("project.json").exists() {
                continue;
            }
            if let Ok(pf) = io::read_project(&path) {
                if pf.id != exclude_id && pf.p2p.is_some() {
                    return true;
                }
            }
        }
        false
    }

    /// Reanuda una sesión P2P persistida (auto-resume al startup, host o collaborator)
    pub async fn resume_session(
        &self,
        app_state: &AppState,
        app_handle: &tauri::AppHandle,
        project_id: &str,
        config: P2pProjectConfig,
    ) -> Result<P2pSessionInfo, String> {
        // Verificar que no haya sesión activa para este proyecto
        {
            let sessions = self.sessions.read().await;
            if sessions.contains_key(project_id) {
                return Err("Ya hay una sesión P2P activa para este proyecto".to_string());
            }
        }

        let project = app_state.read_project_file(project_id)?;
        let is_host = config.role == "host" || config.role == "lead_researcher";
        let role = match config.role.as_str() {
            "host" | "lead_researcher" => PeerRole::LeadResearcher,
            "data_curator" => PeerRole::DataCurator,
            _ => PeerRole::Annotator,
        };

        // Obtener o crear nodo iroh compartido (carga docs persistidos del disco)
        let node = self.get_or_create_node().await?;

        // Parsear namespace_id desde hex
        let ns_id: iroh_docs::NamespaceId = config.namespace_id.parse()
            .map_err(|e| format!("namespace_id inválido: {}", e))?;

        // Re-abrir doc existente (persistido por Docs::persistent)
        let doc = node.docs.open(ns_id)
            .await
            .map_err(|e| format!("Error abriendo doc persistido: {}", e))?
            .ok_or("Doc persistido no encontrado. La sesión anterior puede haber expirado.")?;

        // Crear nuevo autor
        let author = node.docs.author_create()
            .await
            .map_err(|e| format!("Error creando autor: {}", e))?;

        let my_node_id = P2pState::endpoint_id_str(&node.endpoint.id());

        // Iniciar sync (se conectará con cualquier peer online)
        doc.start_sync(vec![])
            .await
            .map_err(|e| format!("Error iniciando sync: {}", e))?;

        // Generar NUEVO ticket con addresses actuales del endpoint
        let new_ticket = doc.share(
            iroh_docs::api::protocol::ShareMode::Write,
            iroh_docs::api::protocol::AddrInfoOptions::RelayAndAddresses,
        )
        .await
        .map_err(|e| format!("Error generando nuevo ticket: {}", e))?;

        let share_code = ticket::encode_share_code(&new_ticket);
        let session_id = uuid::Uuid::new_v4().to_string();

        // host_key solo si somos host y tenemos el secreto
        let host_key = if is_host {
            config.host_secret.as_ref()
                .map(|s| ticket::encode_host_key(s, &share_code))
        } else {
            None
        };

        // Deserializar rules
        let rules: SessionRules = serde_json::from_value(config.rules.clone())
            .unwrap_or_default();

        // Crear sesión activa (sin campo node)
        let session = ActiveSession {
            session_id: session_id.clone(),
            project_id: project_id.to_string(),
            project_name: project.name.clone(),
            share_code: share_code.clone(),
            role: role.clone(),
            rules: rules.clone(),
            my_display_name: config.display_name.clone(),
            my_node_id: my_node_id.clone(),
            namespace_id: ns_id,
            author_id: author,
            peers: HashMap::new(),
            host_secret: config.host_secret.clone(),
        };

        // Insertar sesión en el HashMap
        {
            let mut sessions = self.sessions.write().await;
            sessions.insert(project_id.to_string(), session);
        }

        // Si somos host, re-escribir host meta con el nuevo node_id
        if let Some(ref secret) = config.host_secret {
            if is_host {
                let host_secret_hash = P2pState::hash_secret(secret);
                sync::write_host_meta(self, project_id, &host_secret_hash, &my_node_id, &rules).await?;
            }
        }

        // Registrar este peer en el doc
        let peer_info_json = serde_json::json!({
            "display_name": config.display_name,
            "role": config.role,
            "joined_at": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as f64,
        });
        let peer_key = format!("meta/peers/{}", my_node_id);
        doc.set_bytes(author, peer_key.into_bytes(), serde_json::to_vec(&peer_info_json).unwrap())
            .await
            .map_err(|e| format!("Error registrando peer: {}", e))?;

        // Iniciar watcher de cambios remotos y emitir peers existentes
        sync::start_doc_watcher(ns_id, project_id.to_string(), node.docs.clone(), node.blobs_store.clone(), app_handle.clone());
        sync::emit_existing_peers(ns_id, &node.docs, &node.blobs_store, app_handle, &my_node_id, project_id).await;

        // Iniciar heartbeat para presencia
        sync::start_heartbeat(
            ns_id,
            author,
            my_node_id.clone(),
            config.display_name.clone(),
            config.role.clone(),
            node.docs.clone(),
        );

        let info = P2pSessionInfo {
            session_id,
            project_id: project_id.to_string(),
            project_name: project.name,
            share_code,
            host_key,
            role,
            rules,
            my_node_id,
            my_display_name: config.display_name,
            peers: vec![],
            status: SessionStatus::Connected,
        };

        // Emitir evento al frontend para que restaure la sesión
        let _ = app_handle.emit("p2p:session-restored", &info);

        // Si hay descarga pendiente, reanudarla en background
        let has_pending = project.p2p_download.is_some();
        if has_pending {
            let app_handle_bg = app_handle.clone();
            let project_id_bg = project_id.to_string();
            tokio::spawn(async move {
                let p2p = app_handle_bg.state::<P2pState>();
                let state = app_handle_bg.state::<AppState>();
                if let Err(e) = sync::download_project_images(&p2p, &state, &project_id_bg, &app_handle_bg).await {
                    log::warn!("Error reanudando descarga P2P: {}", e);
                }
            });
        }

        log::info!(
            "Sesión P2P restaurada para proyecto: {} ({}, rol: {})",
            info.project_name,
            project_id,
            config.role
        );

        Ok(info)
    }

    /// Obtiene info de la sesión activa para un proyecto
    pub async fn get_session_info(&self, project_id: &str) -> Option<P2pSessionInfo> {
        let sessions = self.sessions.read().await;
        sessions.get(project_id).map(|s| s.to_info())
    }

    /// Lista los peers conectados leyendo directamente del iroh-doc (fuente de verdad)
    pub async fn list_peers(&self, project_id: &str) -> Result<Vec<super::PeerInfo>, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

        let doc = node.docs.open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let blobs: &iroh_blobs::api::Store = &*node.blobs_store;
        let my_node_id = &session.my_node_id;

        let peer_entries = doc.get_many(iroh_docs::store::Query::key_prefix(b"meta/peers/"))
            .await
            .map_err(|e| format!("Error leyendo peers: {}", e))?;

        use futures_lite::StreamExt;
        tokio::pin!(peer_entries);

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as f64;
        let timeout_ms = 90_000.0;

        let mut peers = Vec::new();
        while let Some(Ok(entry)) = peer_entries.next().await {
            let key = String::from_utf8_lossy(entry.key()).to_string();
            let node_id = match key.strip_prefix("meta/peers/") {
                Some(id) if !id.is_empty() && id != my_node_id => id.to_string(),
                _ => continue,
            };

            let content = match blobs.blobs().get_bytes(entry.content_hash()).await {
                Ok(c) => c,
                Err(_) => continue,
            };
            let info: serde_json::Value = match serde_json::from_slice(&content) {
                Ok(v) => v,
                Err(_) => continue,
            };

            if info.get("left").and_then(|v| v.as_bool()) == Some(true) {
                continue;
            }

            let last_seen = info["last_seen"].as_f64().unwrap_or(0.0);
            let online = (now_ms - last_seen) < timeout_ms;

            peers.push(super::PeerInfo {
                node_id,
                display_name: info["display_name"].as_str().unwrap_or("").to_string(),
                role: serde_json::from_value(info["role"].clone()).unwrap_or(super::PeerRole::Annotator),
                joined_at: info["joined_at"].as_f64().unwrap_or(0.0),
                online,
            });
        }

        Ok(peers)
    }

    /// Actualiza las reglas de la sesión (solo host)
    pub async fn update_rules(&self, project_id: &str, new_rules: SessionRules) -> Result<(), String> {
        // Verificar que somos host
        {
            let sessions = self.sessions.read().await;
            let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;
            if !session.role.can_manage() {
                return Err("Solo el investigador principal puede modificar las reglas".to_string());
            }
        }

        // Escribir reglas al doc
        sync::write_rules(self, project_id, &new_rules).await?;

        // Actualizar local
        {
            let mut sessions = self.sessions.write().await;
            if let Some(session) = sessions.get_mut(project_id) {
                session.rules = new_rules;
            }
        }

        Ok(())
    }

    /// Obtiene las reglas actuales
    pub async fn get_rules(&self, project_id: &str) -> Result<SessionRules, String> {
        let sessions = self.sessions.read().await;
        let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;
        Ok(session.rules.clone())
    }

    /// Actualiza el rol de un peer (solo LeadResearcher puede cambiar roles)
    pub async fn update_peer_role(&self, project_id: &str, node_id: &str, new_role: PeerRole) -> Result<(), String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;

        let sessions = self.sessions.read().await;
        let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

        if !session.role.can_manage() {
            return Err("Solo el investigador principal puede cambiar roles".to_string());
        }

        let doc = node.docs.open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let blobs: &iroh_blobs::api::Store = &*node.blobs_store;

        // Leer peer info existente
        let peer_key = format!("meta/peers/{}", node_id);
        let entry = doc
            .get_one(iroh_docs::store::Query::key_exact(peer_key.as_bytes()))
            .await
            .map_err(|e| format!("Error leyendo peer: {}", e))?
            .ok_or("Peer no encontrado")?;

        let content = blobs.blobs().get_bytes(entry.content_hash())
            .await
            .map_err(|e| format!("Error leyendo blob: {}", e))?;

        let mut peer_info: serde_json::Value = serde_json::from_slice(&content)
            .map_err(|e| format!("Error deserializando peer: {}", e))?;

        // Actualizar rol
        peer_info["role"] = serde_json::Value::String(new_role.to_string());

        doc.set_bytes(
            session.author_id,
            peer_key.into_bytes(),
            serde_json::to_vec(&peer_info).unwrap(),
        )
        .await
        .map_err(|e| format!("Error actualizando rol: {}", e))?;

        Ok(())
    }
}
