use std::collections::HashMap;
use std::sync::Arc;

use bytes::Bytes;
use tauri::{Emitter, Manager};
use tokio::pin;

use crate::store::project_file::{AnnotationEntry, ClassDef, ImageEntry, ProjectFile};

use super::node::{IrohNode, P2pState};
use super::{ImageLockInfo, SessionRules};

/// Lee el contenido de un entry del doc via el blob store
async fn read_entry_bytes(
    entry: &iroh_docs::Entry,
    blobs: &iroh_blobs::api::Store,
) -> Result<Bytes, String> {
    let hash = entry.content_hash();
    blobs.blobs().get_bytes(hash)
        .await
        .map_err(|e| format!("Error leyendo blob: {}", e))
}

/// Escribe metadatos del host al iroh-doc: hash del secreto, node_id del host, y reglas
pub async fn write_host_meta(
    p2p: &P2pState,
    project_id: &str,
    host_secret_hash: &str,
    host_node_id: &str,
    rules: &SessionRules,
) -> Result<(), String> {
    let node_guard = p2p.node.read().await;
    let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
    let sessions = p2p.sessions.read().await;
    let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

    let doc = node
        .docs
        .open(session.namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let author = session.author_id;

    // meta/host_secret_hash
    doc.set_bytes(author, b"meta/host_secret_hash".to_vec(), host_secret_hash.as_bytes().to_vec())
        .await
        .map_err(|e| format!("Error escribiendo host_secret_hash: {}", e))?;

    // meta/host_node_id
    doc.set_bytes(author, b"meta/host_node_id".to_vec(), host_node_id.as_bytes().to_vec())
        .await
        .map_err(|e| format!("Error escribiendo host_node_id: {}", e))?;

    // meta/rules
    let rules_json = serde_json::to_vec(rules)
        .map_err(|e| format!("Error serializando rules: {}", e))?;
    doc.set_bytes(author, b"meta/rules".to_vec(), rules_json)
        .await
        .map_err(|e| format!("Error escribiendo rules: {}", e))?;

    Ok(())
}

/// Verifica si un secreto de host coincide con el hash almacenado en el doc
pub async fn verify_host_secret(
    _p2p: &P2pState,
    secret: &str,
    node: &Arc<IrohNode>,
    namespace_id: iroh_docs::NamespaceId,
) -> bool {
    let doc = match node.docs.open(namespace_id).await {
        Ok(Some(doc)) => doc,
        _ => return false,
    };

    let blobs: &iroh_blobs::api::Store = &*node.blobs_store;

    let entry = match doc
        .get_one(iroh_docs::store::Query::key_exact(b"meta/host_secret_hash"))
        .await
    {
        Ok(Some(entry)) => entry,
        _ => return false,
    };

    let stored_hash = match read_entry_bytes(&entry, blobs).await {
        Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
        Err(_) => return false,
    };

    let provided_hash = P2pState::hash_secret(secret);
    stored_hash == provided_hash
}

/// Lee las reglas de sesión desde el iroh-doc
pub async fn read_rules_from_doc(
    node: &Arc<IrohNode>,
    namespace_id: iroh_docs::NamespaceId,
) -> Result<SessionRules, String> {
    let doc = node
        .docs
        .open(namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let blobs: &iroh_blobs::api::Store = &*node.blobs_store;

    let entry = doc
        .get_one(iroh_docs::store::Query::key_exact(b"meta/rules"))
        .await
        .map_err(|e| format!("Error leyendo rules: {}", e))?
        .ok_or("meta/rules no encontrado")?;

    let content = read_entry_bytes(&entry, blobs).await?;
    serde_json::from_slice(&content)
        .map_err(|e| format!("Error deserializando rules: {}", e))
}

/// Escribe reglas actualizadas al doc (solo host)
pub async fn write_rules(
    p2p: &P2pState,
    project_id: &str,
    rules: &SessionRules,
) -> Result<(), String> {
    let node_guard = p2p.node.read().await;
    let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
    let sessions = p2p.sessions.read().await;
    let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

    let doc = node
        .docs
        .open(session.namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let rules_json = serde_json::to_vec(rules)
        .map_err(|e| format!("Error serializando rules: {}", e))?;

    doc.set_bytes(session.author_id, b"meta/rules".to_vec(), rules_json)
        .await
        .map_err(|e| format!("Error escribiendo rules: {}", e))?;

    Ok(())
}

/// Escribe el proyecto completo al iroh-doc (usado por el host al crear sesión)
pub async fn project_to_doc(
    p2p: &P2pState,
    project_id: &str,
    project: &ProjectFile,
    images_dir: &std::path::Path,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let node_guard = p2p.node.read().await;
    let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
    let sessions = p2p.sessions.read().await;
    let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

    let doc = node
        .docs
        .open(session.namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let author = session.author_id;
    let blobs = &*node.blobs_store;

    // meta/project
    let meta = serde_json::json!({
        "name": project.name,
        "type": project.project_type,
        "version": project.version,
    });
    doc.set_bytes(author, b"meta/project".to_vec(), serde_json::to_vec(&meta).unwrap())
        .await
        .map_err(|e| format!("Error escribiendo meta: {}", e))?;

    // meta/peers/{node_id}
    let peer_info = serde_json::json!({
        "display_name": session.my_display_name,
        "role": "lead_researcher",
        "joined_at": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as f64,
    });
    let peer_key = format!("meta/peers/{}", session.my_node_id);
    doc.set_bytes(author, peer_key.into_bytes(), serde_json::to_vec(&peer_info).unwrap())
        .await
        .map_err(|e| format!("Error escribiendo peer info: {}", e))?;

    // classes
    for class in &project.classes {
        let key = format!("classes/{}", class.id);
        let val = serde_json::to_vec(class).unwrap();
        doc.set_bytes(author, key.into_bytes(), val)
            .await
            .map_err(|e| format!("Error escribiendo clase: {}", e))?;
    }

    // images (skip video frames — only sync standalone images)
    let standalone_images: Vec<_> = project.images.iter().filter(|i| i.video_id.is_none()).collect();
    let total_images = standalone_images.len();

    for (idx, img) in standalone_images.iter().enumerate() {
        let img_meta = serde_json::json!({
            "id": img.id,
            "name": img.name,
            "file": img.file,
            "width": img.width,
            "height": img.height,
            "status": img.status,
        });
        let meta_key = format!("images/{}/meta", img.id);
        doc.set_bytes(author, meta_key.into_bytes(), serde_json::to_vec(&img_meta).unwrap())
            .await
            .map_err(|e| format!("Error escribiendo img meta: {}", e))?;

        let annots_key = format!("images/{}/annots", img.id);
        let annots_json = serde_json::to_vec(&img.annotations).unwrap();
        doc.set_bytes(author, annots_key.into_bytes(), annots_json)
            .await
            .map_err(|e| format!("Error escribiendo anotaciones: {}", e))?;

        let img_path = images_dir.join(&img.file);
        if img_path.exists() {
            let blob_key: Bytes = format!("images/{}/blob", img.id).into_bytes().into();
            // CRITICAL: import_file returns ImportFileProgress which is a Stream+Future.
            // The first .await resolves Result<ImportFileProgress>.
            // The second .await drives the stream to completion, which:
            //   1. Imports the file into the blob store
            //   2. Writes the hash entry into the doc
            // Without the second .await, the doc entry is NEVER created.
            let outcome = doc.import_file(
                blobs,
                author,
                blob_key,
                &img_path,
                iroh_blobs::api::blobs::ImportMode::Copy,
            )
            .await
            .map_err(|e| format!("Error iniciando import de blob {}: {}", img.id, e))?
            .await
            .map_err(|e| format!("Error completando import de blob {}: {}", img.id, e))?;
            log::info!("Blob importado: {} ({} bytes, hash: {})", img.id, outcome.size, outcome.hash);
        }

        // Emitir progreso de export al frontend
        let _ = app_handle.emit("p2p:export-progress", serde_json::json!({
            "current": idx + 1,
            "total": total_images,
            "imageName": img.name,
        }));
    }

    log::info!("Proyecto exportado al iroh-doc: {} imágenes con blobs", total_images);
    Ok(())
}

/// Fase 1: Reconstruye un ProjectFile desde un iroh-doc, solo metadata (sin descargar blobs de imágenes).
/// Las imágenes se crean con download_status = Some("pending").
/// Toma node, namespace_id, author_id directamente (no necesita sesión en el HashMap).
pub async fn doc_to_project_metadata(
    node: &Arc<IrohNode>,
    namespace_id: iroh_docs::NamespaceId,
    _author_id: iroh_docs::AuthorId,
    target_dir: &std::path::Path,
) -> Result<ProjectFile, String> {
    let doc = node
        .docs
        .open(namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let blobs: &iroh_blobs::api::Store = &*node.blobs_store;

    // Leer meta/project
    let meta_entry = doc
        .get_one(iroh_docs::store::Query::key_exact(b"meta/project"))
        .await
        .map_err(|e| format!("Error leyendo meta: {}", e))?
        .ok_or("meta/project no encontrado en doc")?;

    let meta_bytes = read_entry_bytes(&meta_entry, blobs).await?;

    let meta: serde_json::Value = serde_json::from_slice(&meta_bytes)
        .map_err(|e| format!("Error deserializando meta: {}", e))?;

    let project_name = meta["name"].as_str().unwrap_or("P2P Project").to_string();
    let project_type = meta["type"].as_str().unwrap_or("object_detection").to_string();
    let version = meta["version"].as_u64().unwrap_or(1) as u32;

    // Leer clases
    let mut classes: Vec<ClassDef> = Vec::new();
    let class_entries = doc
        .get_many(iroh_docs::store::Query::key_prefix(b"classes/"))
        .await
        .map_err(|e| format!("Error leyendo clases: {}", e))?;

    use futures_lite::StreamExt;
    pin!(class_entries);
    while let Some(entry) = class_entries.next().await {
        let entry = entry.map_err(|e| format!("Error en stream de clases: {}", e))?;
        let content = read_entry_bytes(&entry, blobs).await?;
        if let Ok(class) = serde_json::from_slice::<ClassDef>(&content) {
            classes.push(class);
        }
    }

    // Leer imágenes (solo meta + annots, sin blobs)
    let mut images: Vec<ImageEntry> = Vec::new();
    let img_entries = doc
        .get_many(iroh_docs::store::Query::key_prefix(b"images/"))
        .await
        .map_err(|e| format!("Error leyendo imágenes: {}", e))?;

    let mut img_data: HashMap<String, HashMap<String, Vec<u8>>> = HashMap::new();
    pin!(img_entries);
    while let Some(entry) = img_entries.next().await {
        let entry = entry.map_err(|e| format!("Error en stream: {}", e))?;
        let key = String::from_utf8_lossy(entry.key()).to_string();

        let parts: Vec<&str> = key.split('/').collect();
        if parts.len() >= 3 && parts[0] == "images" {
            let img_id = parts[1].to_string();
            let field = parts[2].to_string();

            // Skip blobs y locks — solo metadata y anotaciones
            if field == "blob" || field == "lock" {
                continue;
            }

            let content = read_entry_bytes(&entry, blobs).await?;

            img_data
                .entry(img_id)
                .or_default()
                .insert(field, content.to_vec());
        }
    }

    // Crear directorio de imágenes
    let project_id = uuid::Uuid::new_v4().to_string();
    let project_dir = target_dir.join(&project_id);
    let images_dir = project_dir.join("images");
    let _ = std::fs::create_dir_all(&images_dir);

    for (img_id, fields) in &img_data {
        if let Some(meta_bytes) = fields.get("meta") {
            let meta: serde_json::Value = serde_json::from_slice(meta_bytes)
                .map_err(|e| format!("Error deserializando img meta: {}", e))?;

            let annots: Vec<AnnotationEntry> = fields
                .get("annots")
                .and_then(|b| serde_json::from_slice(b).ok())
                .unwrap_or_default();

            let file_name = meta["file"].as_str().unwrap_or(&format!("{}.jpg", img_id)).to_string();

            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as f64;

            images.push(ImageEntry {
                id: img_id.clone(),
                name: meta["name"].as_str().unwrap_or("").to_string(),
                file: file_name,
                width: meta["width"].as_u64().unwrap_or(0) as u32,
                height: meta["height"].as_u64().unwrap_or(0) as u32,
                uploaded: now,
                annotated: if annots.is_empty() { None } else { Some(now) },
                status: meta["status"].as_str().unwrap_or("pending").to_string(),
                annotations: annots,
                video_id: None,
                frame_index: None,
                locked_by: None,
                lock_expires: None,
                download_status: Some("pending".to_string()),
                predictions: vec![],
            });
        }
    }

    let total_images = images.len();

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64;

    let p2p_download = if total_images > 0 {
        Some(crate::store::project_file::P2pDownloadStatus {
            total_images,
            downloaded_images: 0,
        })
    } else {
        None
    };

    Ok(ProjectFile {
        version,
        id: project_id,
        name: project_name,
        project_type,
        classes,
        created: now,
        updated: now,
        images,
        timeseries: vec![],
        videos: vec![],
        training_jobs: vec![],
        tabular_data: vec![],
        audio: vec![],
        p2p: None,
        p2p_download,
        inference_models: vec![],
        folder: None,
    })
}

/// Fase 2: Descarga blobs de imágenes pendientes uno a uno en background.
/// Emite eventos de progreso y actualiza cada ImageEntry al completar.
/// Incluye espera inicial para que iroh sincronice los blobs y retries por imagen.
pub async fn download_project_images(
    p2p: &P2pState,
    app_state: &crate::store::state::AppState,
    project_id: &str,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    // Leer las imágenes pendientes
    let pending_images: Vec<(String, String)> = app_state.with_project(project_id, |pf| {
        pf.images.iter()
            .filter(|i| i.download_status.as_deref() == Some("pending"))
            .map(|i| (i.id.clone(), i.file.clone()))
            .collect()
    })?;

    if pending_images.is_empty() {
        return Ok(());
    }

    let total = pending_images.len();
    let images_dir = app_state.project_images_dir(project_id)?;
    let _ = std::fs::create_dir_all(&images_dir);

    // Obtener doc y blobs del p2p state
    let (namespace_id, node) = {
        let node_guard = p2p.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?.clone();
        let sessions = p2p.sessions.read().await;
        let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;
        (session.namespace_id, node)
    };

    let doc = node
        .docs
        .open(namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let blobs: &iroh_blobs::api::Store = &*node.blobs_store;

    // Recopilar endpoints de todos los peers conocidos para descarga
    let mut peer_endpoints: Vec<iroh::EndpointId> = Vec::new();
    // Host primero (prioridad)
    if let Ok(Some(entry)) = doc.get_one(iroh_docs::store::Query::key_exact(b"meta/host_node_id")).await {
        if let Ok(bytes) = read_entry_bytes(&entry, blobs).await {
            if let Ok(id) = String::from_utf8_lossy(&bytes).parse::<iroh::EndpointId>() {
                peer_endpoints.push(id);
            }
        }
    }
    // También incluir otros peers del doc
    if let Ok(peer_entries) = doc.get_many(iroh_docs::store::Query::key_prefix(b"meta/peers/")).await {
        use futures_lite::StreamExt;
        tokio::pin!(peer_entries);
        while let Some(Ok(entry)) = peer_entries.next().await {
            let key_str = String::from_utf8_lossy(entry.key()).to_string();
            if let Some(node_id_str) = key_str.strip_prefix("meta/peers/") {
                if let Ok(id) = node_id_str.parse::<iroh::EndpointId>() {
                    if !peer_endpoints.contains(&id) {
                        peer_endpoints.push(id);
                    }
                }
            }
        }
    }

    if peer_endpoints.is_empty() {
        return Err("No se encontraron peers para descargar blobs".to_string());
    }

    // Crear downloader para descarga explícita de blobs
    let downloader = blobs.downloader(&node.endpoint);
    log::info!("Downloader creado para {} imágenes desde {} peers", total, peer_endpoints.len());

    let mut downloaded = 0;
    let max_retries: u32 = 8;
    let retry_delay = std::time::Duration::from_secs(3);

    for (img_id, file_name) in &pending_images {
        let blob_key = format!("images/{}/blob", img_id);

        let mut success = false;
        for attempt in 0..max_retries {
            if attempt > 0 {
                log::info!("Reintento {}/{} para imagen {}", attempt + 1, max_retries, img_id);
                tokio::time::sleep(retry_delay).await;
            }

            let entry = match doc
                .get_one(iroh_docs::store::Query::key_exact(blob_key.as_bytes()))
                .await
            {
                Ok(Some(entry)) => entry,
                Ok(None) => {
                    log::warn!("Blob entry no encontrado para imagen {} (intento {})", img_id, attempt + 1);
                    continue;
                }
                Err(e) => {
                    log::warn!("Error buscando blob {} (intento {}): {}", img_id, attempt + 1, e);
                    continue;
                }
            };

            let hash = entry.content_hash();

            // Descargar el blob desde cualquier peer disponible
            if let Err(e) = downloader.download(hash, peer_endpoints.clone()).await {
                log::warn!("Error descargando blob {} (intento {}): {}", img_id, attempt + 1, e);
                continue;
            }

            // Leer el blob ya disponible localmente
            match blobs.blobs().get_bytes(hash).await {
                Ok(blob_data) => {
                    let dest = images_dir.join(file_name);
                    let tmp_dest = images_dir.join(format!("{}.tmp", file_name));
                    if let Err(e) = std::fs::write(&tmp_dest, &blob_data) {
                        log::warn!("Error escribiendo imagen tmp {}: {}", img_id, e);
                        continue;
                    }
                    if let Err(e) = std::fs::rename(&tmp_dest, &dest) {
                        log::warn!("Error renombrando imagen {}: {}", img_id, e);
                        continue;
                    }
                    success = true;
                    break;
                }
                Err(e) => {
                    log::warn!("Error leyendo blob local {} (intento {}): {}", img_id, attempt + 1, e);
                    continue;
                }
            }
        }

        if !success {
            log::warn!("No se pudo descargar imagen {} después de {} intentos", img_id, max_retries);
            let _ = app_handle.emit("p2p:download-error", serde_json::json!({
                "projectId": project_id,
                "imageId": img_id,
                "error": format!("Falló después de {} intentos", max_retries),
            }));
            continue;
        }

        // Actualizar ImageEntry: download_status = None
        let img_id_clone = img_id.clone();
        let _ = app_state.with_project_mut(project_id, |pf| {
            if let Some(img) = pf.images.iter_mut().find(|i| i.id == img_id_clone) {
                img.download_status = None;
            }
            if let Some(ref mut dl) = pf.p2p_download {
                dl.downloaded_images += 1;
            }
        });

        downloaded += 1;
        let _ = app_handle.emit("p2p:download-progress", serde_json::json!({
            "projectId": project_id,
            "current": downloaded,
            "total": total,
        }));
    }

    // Solo limpiar p2p_download si se descargaron TODAS las imágenes
    if downloaded == total {
        let _ = app_state.with_project_mut(project_id, |pf| {
            pf.p2p_download = None;
        });

        let _ = app_handle.emit("p2p:download-complete", serde_json::json!({
            "projectId": project_id,
        }));

        log::info!("Descarga P2P completada: {}/{} imágenes para proyecto {}", downloaded, total, project_id);
    } else {
        log::warn!(
            "Descarga P2P parcial: {}/{} imágenes para proyecto {}. Las pendientes se reintentarán al reiniciar.",
            downloaded, total, project_id
        );
        // Emitir progreso final para que el frontend actualice el banner
        let _ = app_handle.emit("p2p:download-progress", serde_json::json!({
            "projectId": project_id,
            "current": downloaded,
            "total": total,
        }));
    }

    Ok(())
}

/// Envía un dato para aprobación
pub async fn submit_data_for_approval(
    p2p: &P2pState,
    project_id: &str,
    item_id: &str,
    item_type: &str,
) -> Result<(), String> {
    let node_guard = p2p.node.read().await;
    let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
    let sessions = p2p.sessions.read().await;
    let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

    let doc = node
        .docs
        .open(session.namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64;

    let approval = super::PendingApproval {
        item_id: item_id.to_string(),
        item_type: item_type.to_string(),
        submitted_by: session.my_node_id.clone(),
        submitted_by_name: session.my_display_name.clone(),
        submitted_at: now,
        status: super::ApprovalStatus::Pending,
    };

    let key = format!("approval/{}", item_id);
    let json = serde_json::to_vec(&approval)
        .map_err(|e| format!("Error serializando aprobación: {}", e))?;

    doc.set_bytes(session.author_id, key.into_bytes(), json)
        .await
        .map_err(|e| format!("Error escribiendo aprobación: {}", e))?;

    Ok(())
}

/// Aprueba un dato pendiente
pub async fn approve_data(
    p2p: &P2pState,
    project_id: &str,
    item_id: &str,
) -> Result<(), String> {
    update_approval_status(p2p, project_id, item_id, super::ApprovalStatus::Approved).await
}

/// Rechaza un dato pendiente
pub async fn reject_data(
    p2p: &P2pState,
    project_id: &str,
    item_id: &str,
) -> Result<(), String> {
    update_approval_status(p2p, project_id, item_id, super::ApprovalStatus::Rejected).await
}

/// Helper interno para cambiar el estado de aprobación
async fn update_approval_status(
    p2p: &P2pState,
    project_id: &str,
    item_id: &str,
    new_status: super::ApprovalStatus,
) -> Result<(), String> {
    let node_guard = p2p.node.read().await;
    let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
    let sessions = p2p.sessions.read().await;
    let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

    if !session.role.can_manage() {
        return Err("Solo el investigador principal puede aprobar/rechazar datos".to_string());
    }

    let doc = node
        .docs
        .open(session.namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let blobs: &iroh_blobs::api::Store = &*node.blobs_store;
    let key = format!("approval/{}", item_id);

    let entry = doc
        .get_one(iroh_docs::store::Query::key_exact(key.as_bytes()))
        .await
        .map_err(|e| format!("Error leyendo aprobación: {}", e))?
        .ok_or("Aprobación no encontrada")?;

    let content = read_entry_bytes(&entry, blobs).await?;
    let mut approval: super::PendingApproval = serde_json::from_slice(&content)
        .map_err(|e| format!("Error deserializando aprobación: {}", e))?;

    approval.status = new_status;

    let json = serde_json::to_vec(&approval)
        .map_err(|e| format!("Error serializando aprobación: {}", e))?;

    doc.set_bytes(session.author_id, key.into_bytes(), json)
        .await
        .map_err(|e| format!("Error actualizando aprobación: {}", e))?;

    Ok(())
}

/// Lista todas las aprobaciones pendientes
pub async fn list_pending_approvals(
    p2p: &P2pState,
    project_id: &str,
) -> Result<Vec<super::PendingApproval>, String> {
    let node_guard = p2p.node.read().await;
    let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
    let sessions = p2p.sessions.read().await;
    let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

    let doc = node
        .docs
        .open(session.namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let blobs: &iroh_blobs::api::Store = &*node.blobs_store;

    let entries = doc
        .get_many(iroh_docs::store::Query::key_prefix(b"approval/"))
        .await
        .map_err(|e| format!("Error leyendo aprobaciones: {}", e))?;

    use futures_lite::StreamExt;
    pin!(entries);

    let mut approvals = Vec::new();
    while let Some(entry) = entries.next().await {
        let entry = entry.map_err(|e| format!("Error en stream: {}", e))?;
        let content = read_entry_bytes(&entry, blobs).await?;
        if let Ok(approval) = serde_json::from_slice::<super::PendingApproval>(&content) {
            approvals.push(approval);
        }
    }

    Ok(approvals)
}

/// Sincroniza una imagen nueva al iroh-doc (meta + annots + blob)
/// Usado cuando un colaborador sube una imagen y necesita propagarla a otros peers.
pub async fn sync_new_image_to_doc(
    p2p: &P2pState,
    project_id: &str,
    image_id: &str,
    image_name: &str,
    image_file: &str,
    width: u32,
    height: u32,
    status: &str,
    annotations: &[AnnotationEntry],
    image_path: &std::path::Path,
) -> Result<(), String> {
    let node_guard = p2p.node.read().await;
    let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
    let sessions = p2p.sessions.read().await;
    let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

    let doc = node
        .docs
        .open(session.namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let author = session.author_id;
    let blobs = &*node.blobs_store;

    // Escribir metadata de la imagen
    let img_meta = serde_json::json!({
        "id": image_id,
        "name": image_name,
        "file": image_file,
        "width": width,
        "height": height,
        "status": status,
    });
    let meta_key = format!("images/{}/meta", image_id);
    doc.set_bytes(author, meta_key.into_bytes(), serde_json::to_vec(&img_meta).unwrap())
        .await
        .map_err(|e| format!("Error escribiendo img meta: {}", e))?;

    // Escribir anotaciones
    let annots_key = format!("images/{}/annots", image_id);
    let annots_json = serde_json::to_vec(annotations).unwrap();
    doc.set_bytes(author, annots_key.into_bytes(), annots_json)
        .await
        .map_err(|e| format!("Error escribiendo anotaciones: {}", e))?;

    // Importar blob (archivo de imagen)
    if image_path.exists() {
        let blob_key: Bytes = format!("images/{}/blob", image_id).into_bytes().into();
        let outcome = doc.import_file(
            blobs,
            author,
            blob_key,
            image_path,
            iroh_blobs::api::blobs::ImportMode::Copy,
        )
        .await
        .map_err(|e| format!("Error iniciando import de blob {}: {}", image_id, e))?
        .await
        .map_err(|e| format!("Error completando import de blob {}: {}", image_id, e))?;
        log::info!("Imagen sincronizada al doc P2P: {} ({} bytes, hash: {})", image_id, outcome.size, outcome.hash);
    }

    Ok(())
}

/// Descarga el blob de una sola imagen desde peers remotos
async fn download_single_image(
    project_id: String,
    image_id: String,
    file_name: String,
    app_handle: tauri::AppHandle,
) {
    let p2p = app_handle.state::<P2pState>();
    let app_state = app_handle.state::<crate::store::state::AppState>();

    let images_dir = match app_state.project_images_dir(&project_id) {
        Ok(d) => d,
        Err(e) => {
            log::warn!("Error obteniendo directorio de imágenes: {}", e);
            return;
        }
    };
    let _ = std::fs::create_dir_all(&images_dir);

    let (namespace_id, node) = {
        let node_guard = p2p.node.read().await;
        let node = match node_guard.as_ref() {
            Some(n) => n.clone(),
            None => return,
        };
        let sessions = p2p.sessions.read().await;
        let session = match sessions.get(&*project_id) {
            Some(s) => (s.namespace_id, node.clone()),
            None => return,
        };
        session
    };

    let doc = match node.docs.open(namespace_id).await {
        Ok(Some(doc)) => doc,
        _ => return,
    };

    let blobs: &iroh_blobs::api::Store = &*node.blobs_store;
    let blob_key = format!("images/{}/blob", image_id);

    // Recopilar endpoints de todos los peers conocidos para descarga
    let mut peer_endpoints: Vec<iroh::EndpointId> = Vec::new();
    // Intentar host primero
    if let Ok(Some(entry)) = doc.get_one(iroh_docs::store::Query::key_exact(b"meta/host_node_id")).await {
        if let Ok(bytes) = read_entry_bytes(&entry, blobs).await {
            if let Ok(id) = String::from_utf8_lossy(&bytes).parse::<iroh::EndpointId>() {
                peer_endpoints.push(id);
            }
        }
    }
    // También incluir otros peers del doc
    if let Ok(peer_entries) = doc.get_many(iroh_docs::store::Query::key_prefix(b"meta/peers/")).await {
        use futures_lite::StreamExt;
        tokio::pin!(peer_entries);
        while let Some(Ok(entry)) = peer_entries.next().await {
            let key = String::from_utf8_lossy(entry.key()).to_string();
            if let Some(node_id_str) = key.strip_prefix("meta/peers/") {
                if let Ok(id) = node_id_str.parse::<iroh::EndpointId>() {
                    if !peer_endpoints.contains(&id) {
                        peer_endpoints.push(id);
                    }
                }
            }
        }
    }

    let downloader = blobs.downloader(&node.endpoint);
    let max_retries: u32 = 8;
    let retry_delay = std::time::Duration::from_secs(3);

    for attempt in 0..max_retries {
        if attempt > 0 {
            tokio::time::sleep(retry_delay).await;
        }

        let entry = match doc.get_one(iroh_docs::store::Query::key_exact(blob_key.as_bytes())).await {
            Ok(Some(entry)) => entry,
            _ => {
                log::warn!("Blob entry no encontrado para imagen {} (intento {})", image_id, attempt + 1);
                continue;
            }
        };

        let hash = entry.content_hash();

        if let Err(e) = downloader.download(hash, peer_endpoints.clone()).await {
            log::warn!("Error descargando blob {} (intento {}): {}", image_id, attempt + 1, e);
            continue;
        }

        match blobs.blobs().get_bytes(hash).await {
            Ok(blob_data) => {
                let dest = images_dir.join(&file_name);
                let tmp_dest = images_dir.join(format!("{}.tmp", file_name));
                if std::fs::write(&tmp_dest, &blob_data).is_err() {
                    continue;
                }
                if std::fs::rename(&tmp_dest, &dest).is_err() {
                    continue;
                }

                // Actualizar download_status
                let img_id = image_id.clone();
                let _ = app_state.with_project_mut(&project_id, |pf| {
                    if let Some(img) = pf.images.iter_mut().find(|i| i.id == img_id) {
                        img.download_status = None;
                    }
                });
                let _ = app_handle.emit("db:images-changed", &*project_id);
                log::info!("Imagen P2P descargada: {} ({} bytes)", image_id, blob_data.len());
                return;
            }
            Err(e) => {
                log::warn!("Error leyendo blob local {} (intento {}): {}", image_id, attempt + 1, e);
                continue;
            }
        }
    }

    log::warn!("No se pudo descargar imagen {} después de {} intentos", image_id, max_retries);
}

/// Sincroniza anotaciones locales al iroh-doc
pub async fn sync_annotations_to_doc(
    p2p: &P2pState,
    project_id: &str,
    image_id: &str,
    annotations: &[AnnotationEntry],
) -> Result<(), String> {
    let node_guard = p2p.node.read().await;
    let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
    let sessions = p2p.sessions.read().await;
    let session = sessions.get(project_id).ok_or("No hay sesión P2P activa para este proyecto")?;

    let doc = node
        .docs
        .open(session.namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let key = format!("images/{}/annots", image_id);
    let annots_json = serde_json::to_vec(annotations)
        .map_err(|e| format!("Error serializando anotaciones: {}", e))?;

    doc.set_bytes(session.author_id, key.into_bytes(), annots_json)
        .await
        .map_err(|e| format!("Error escribiendo anotaciones: {}", e))?;

    Ok(())
}

/// Lee peers existentes del doc y emite eventos p2p:peer-joined para cada uno (excepto self)
pub async fn emit_existing_peers(
    namespace_id: iroh_docs::NamespaceId,
    docs: &iroh_docs::protocol::Docs,
    blobs_store: &iroh_blobs::store::fs::FsStore,
    app_handle: &tauri::AppHandle,
    my_node_id: &str,
    project_id: &str,
) {
    let doc = match docs.open(namespace_id).await {
        Ok(Some(doc)) => doc,
        _ => return,
    };

    let blobs: &iroh_blobs::api::Store = &*blobs_store;
    let peer_entries = match doc.get_many(iroh_docs::store::Query::key_prefix(b"meta/peers/")).await {
        Ok(entries) => entries,
        Err(_) => return,
    };

    use futures_lite::StreamExt;
    pin!(peer_entries);
    while let Some(Ok(entry)) = peer_entries.next().await {
        let key = String::from_utf8_lossy(entry.key()).to_string();
        let node_id = match key.strip_prefix("meta/peers/") {
            Some(id) if !id.is_empty() && id != my_node_id => id,
            _ => continue,
        };
        if let Ok(content) = read_entry_bytes(&entry, blobs).await {
            if let Ok(peer_info) = serde_json::from_slice::<serde_json::Value>(&content) {
                // Ignorar peers que ya salieron
                if peer_info.get("left").and_then(|v| v.as_bool()) == Some(true) {
                    continue;
                }
                let _ = app_handle.emit("p2p:peer-joined", serde_json::json!({
                    "projectId": project_id,
                    "nodeId": node_id,
                    "displayName": peer_info["display_name"],
                    "role": peer_info["role"],
                    "lastSeen": peer_info["last_seen"],
                }));
            }
        }
    }
}

/// Inicia el watcher de cambios remotos en el iroh-doc
pub fn start_doc_watcher(
    namespace_id: iroh_docs::NamespaceId,
    project_id: String,
    docs: iroh_docs::protocol::Docs,
    blobs_store: iroh_blobs::store::fs::FsStore,
    app_handle: tauri::AppHandle,
) {
    tokio::spawn(async move {
        let doc = match docs.open(namespace_id).await {
            Ok(Some(doc)) => doc,
            _ => {
                log::warn!("No se pudo abrir doc para watcher");
                return;
            }
        };

        let events = match doc.subscribe().await {
            Ok(events) => events,
            Err(e) => {
                log::warn!("Error suscribiéndose a cambios: {}", e);
                return;
            }
        };

        use futures_lite::StreamExt;
        let blobs: &iroh_blobs::api::Store = &*blobs_store;

        tokio::pin!(events);
        while let Some(event) = events.next().await {
            match event {
                Ok(iroh_docs::engine::LiveEvent::InsertRemote { entry, from, .. }) => {
                    let key = String::from_utf8_lossy(entry.key()).to_string();
                    log::info!("Cambio remoto recibido: key={}", key);

                    if key.starts_with("images/") && key.ends_with("/meta") {
                        // Nueva imagen subida por un peer remoto
                        let parts: Vec<&str> = key.split('/').collect();
                        if parts.len() == 3 && !project_id.is_empty() {
                            let image_id = parts[1].to_string();
                            if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                                if let Ok(img_meta) = serde_json::from_slice::<serde_json::Value>(&content) {
                                    let app_state = app_handle.state::<crate::store::state::AppState>();

                                    // Verificar si la imagen ya existe localmente
                                    let pid = project_id.clone();
                                    let iid = image_id.clone();
                                    let exists = app_state.with_project(&pid, |pf| {
                                        pf.images.iter().any(|i| i.id == iid)
                                    }).unwrap_or(true);

                                    if !exists {
                                        let file_name = img_meta["file"].as_str().unwrap_or("").to_string();
                                        let img_name = img_meta["name"].as_str().unwrap_or("").to_string();
                                        let width = img_meta["width"].as_u64().unwrap_or(0) as u32;
                                        let height = img_meta["height"].as_u64().unwrap_or(0) as u32;

                                        let now = std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap()
                                            .as_millis() as f64;

                                        let new_entry = ImageEntry {
                                            id: image_id.clone(),
                                            name: img_name,
                                            file: file_name.clone(),
                                            width,
                                            height,
                                            uploaded: now,
                                            annotated: None,
                                            status: img_meta["status"].as_str().unwrap_or("pending").to_string(),
                                            annotations: vec![],
                                            video_id: None,
                                            frame_index: None,
                                            locked_by: None,
                                            lock_expires: None,
                                            download_status: Some("pending".to_string()),
                                            predictions: vec![],
                                        };

                                        let pid2 = project_id.clone();
                                        let _ = app_state.with_project_mut(&pid2, |pf| {
                                            pf.images.push(new_entry);
                                            pf.updated = now;
                                        });

                                        let _ = app_handle.emit("db:images-changed", &*project_id);
                                        log::info!("Nueva imagen remota agregada: {} en proyecto {}", image_id, project_id);

                                        // Descargar blob en background
                                        let pid3 = project_id.clone();
                                        let iid2 = image_id.clone();
                                        let ah = app_handle.clone();
                                        tokio::spawn(async move {
                                            download_single_image(pid3, iid2, file_name, ah).await;
                                        });
                                    }
                                }
                            }
                        }
                    }
                    else if key.starts_with("images/") && key.ends_with("/annots") {
                        let parts: Vec<&str> = key.split('/').collect();
                        if parts.len() == 3 {
                            let image_id = parts[1].to_string();
                            let content_hash = entry.content_hash();
                            let from_str = from.to_string();
                            let pid = project_id.clone();
                            let ah = app_handle.clone();
                            let bs = blobs_store.clone();
                            tokio::spawn(async move {
                                let blobs: &iroh_blobs::api::Store = &*bs;
                                let mut content_opt = None;
                                for attempt in 0..5u32 {
                                    if attempt > 0 {
                                        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                                    }
                                    match blobs.blobs().get_bytes(content_hash).await {
                                        Ok(c) => { content_opt = Some(c); break; }
                                        Err(e) if attempt == 4 => {
                                            log::warn!("Error leyendo blob de anotaciones para imagen {} después de 5 intentos: {}", image_id, e);
                                            return;
                                        }
                                        Err(_) => continue,
                                    }
                                }
                                let content = match content_opt {
                                    Some(c) => c,
                                    None => return,
                                };
                                if let Ok(annots) = serde_json::from_slice::<Vec<AnnotationEntry>>(&content) {
                                    let app_state = ah.state::<crate::store::state::AppState>();
                                    let iid = image_id.clone();
                                    let annots_clone = annots.clone();
                                    let _ = app_state.with_project_mut(&pid, |pf| {
                                        if let Some(img) = pf.images.iter_mut().find(|i| i.id == iid) {
                                            img.annotations = annots_clone;
                                        }
                                    });
                                    let _ = ah.emit("p2p:annotations-synced", serde_json::json!({
                                        "projectId": pid,
                                        "imageId": image_id,
                                        "annotations": annots,
                                        "from": from_str,
                                    }));
                                }
                            });
                        }
                    }
                    else if key.starts_with("images/") && key.ends_with("/lock") {
                        let parts: Vec<&str> = key.split('/').collect();
                        if parts.len() == 3 {
                            let _image_id = parts[1];
                            if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                                if let Ok(lock_info) = serde_json::from_slice::<ImageLockInfo>(&content) {
                                    let _ = app_handle.emit("p2p:image-locked", serde_json::json!({
                                        "projectId": project_id,
                                        "imageId": lock_info.image_id,
                                        "lockedBy": lock_info.locked_by,
                                        "lockedByName": lock_info.locked_by_name,
                                        "lockedAt": lock_info.locked_at,
                                        "expiresAt": lock_info.expires_at,
                                    }));
                                } else {
                                    let _ = app_handle.emit("p2p:image-unlocked", serde_json::json!({
                                        "projectId": project_id,
                                        "imageId": _image_id,
                                    }));
                                }
                            }
                        }
                    }
                    else if key.starts_with("meta/peers/") {
                        if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                            if let Ok(peer_info) = serde_json::from_slice::<serde_json::Value>(&content) {
                                let node_id = key.strip_prefix("meta/peers/").unwrap_or("");
                                // Detectar si el peer salió
                                if peer_info.get("left").and_then(|v| v.as_bool()) == Some(true) {
                                    let _ = app_handle.emit("p2p:peer-left", serde_json::json!({
                                        "projectId": project_id,
                                        "nodeId": node_id,
                                    }));
                                } else {
                                    let _ = app_handle.emit("p2p:peer-joined", serde_json::json!({
                                        "projectId": project_id,
                                        "nodeId": node_id,
                                        "displayName": peer_info["display_name"],
                                        "role": peer_info["role"],
                                        "lastSeen": peer_info["last_seen"],
                                    }));
                                }
                            }
                        }
                    }
                    else if key == "meta/session_closed" {
                        log::info!("Sesión cerrada por el host");
                        let _ = app_handle.emit("p2p:host-stopped", serde_json::json!({
                            "projectId": project_id,
                            "reason": "host_stopped",
                        }));
                    }
                    else if key == "meta/rules" {
                        if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                            if let Ok(rules) = serde_json::from_slice::<SessionRules>(&content) {
                                let _ = app_handle.emit("p2p:rules-updated", serde_json::json!({
                                    "projectId": project_id,
                                    "rules": rules,
                                }));
                            }
                        }
                    }
                    else if key.starts_with("batches/") {
                        if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                            if let Ok(batch) = serde_json::from_slice::<super::BatchInfo>(&content) {
                                let _ = app_handle.emit("p2p:batch-assigned", serde_json::json!({
                                    "projectId": project_id,
                                    "batch": batch,
                                }));
                            }
                        }
                    }
                    else if key == "work/distribution" {
                        if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                            if let Ok(dist) = serde_json::from_slice::<super::WorkDistribution>(&content) {
                                let _ = app_handle.emit("p2p:distribution-updated", serde_json::json!({
                                    "projectId": project_id,
                                    "distribution": dist,
                                }));
                            }
                        }
                    }
                    else if key.starts_with("approval/") {
                        if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                            if let Ok(approval) = serde_json::from_slice::<super::PendingApproval>(&content) {
                                match approval.status {
                                    super::ApprovalStatus::Pending => {
                                        let _ = app_handle.emit("p2p:data-submitted", serde_json::json!({
                                            "projectId": project_id,
                                            "approval": approval,
                                        }));
                                    }
                                    super::ApprovalStatus::Approved => {
                                        let _ = app_handle.emit("p2p:data-approved", serde_json::json!({
                                            "projectId": project_id,
                                            "itemId": approval.item_id,
                                        }));
                                    }
                                    super::ApprovalStatus::Rejected => {
                                        let _ = app_handle.emit("p2p:data-rejected", serde_json::json!({
                                            "projectId": project_id,
                                            "itemId": approval.item_id,
                                        }));
                                    }
                                }
                            }
                        }
                    }
                }
                Ok(iroh_docs::engine::LiveEvent::SyncFinished(sync_event)) => {
                    let _ = app_handle.emit("p2p:session-status", serde_json::json!({
                        "projectId": project_id,
                        "status": "connected",
                        "peer": sync_event.peer.to_string(),
                    }));
                }
                _ => {}
            }
        }
        // Stream cerrado: el doc fue cerrado o la conexión se perdió
        log::info!("Doc watcher finalizado — emitiendo desconexión");
        let _ = app_handle.emit("p2p:session-status", serde_json::json!({
            "projectId": project_id,
            "status": "disconnected",
        }));
    });
}

/// Inicia un heartbeat periódico que escribe `last_seen` en el doc para indicar presencia
pub fn start_heartbeat(
    namespace_id: iroh_docs::NamespaceId,
    author_id: iroh_docs::AuthorId,
    my_node_id: String,
    display_name: String,
    role: String,
    docs: iroh_docs::protocol::Docs,
) {
    tokio::spawn(async move {
        let joined_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as f64;

        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;

            let doc = match docs.open(namespace_id).await {
                Ok(Some(doc)) => doc,
                _ => {
                    log::info!("Heartbeat: doc cerrado, finalizando");
                    break;
                }
            };

            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as f64;

            let peer_info = serde_json::json!({
                "display_name": display_name,
                "role": role,
                "joined_at": joined_at,
                "last_seen": now,
            });

            let peer_key = format!("meta/peers/{}", my_node_id);
            if doc.set_bytes(
                author_id,
                peer_key.into_bytes(),
                serde_json::to_vec(&peer_info).unwrap(),
            ).await.is_err() {
                log::info!("Heartbeat: error escribiendo, finalizando");
                break;
            }
        }
        log::info!("Heartbeat finalizado para {}", my_node_id);
    });
}
