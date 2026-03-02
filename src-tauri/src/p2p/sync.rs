use std::collections::HashMap;
use std::sync::Arc;

use bytes::Bytes;
use tauri::Emitter;
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
    host_secret_hash: &str,
    host_node_id: &str,
    rules: &SessionRules,
) -> Result<(), String> {
    let session = p2p.session.read().await;
    let session = session.as_ref().ok_or("No hay sesión P2P activa")?;

    let doc = session
        .node
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
    rules: &SessionRules,
) -> Result<(), String> {
    let session = p2p.session.read().await;
    let session = session.as_ref().ok_or("No hay sesión P2P activa")?;

    let doc = session
        .node
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
    project: &ProjectFile,
    images_dir: &std::path::Path,
) -> Result<(), String> {
    let session = p2p.session.read().await;
    let session = session.as_ref().ok_or("No hay sesión P2P activa")?;

    let doc = session
        .node
        .docs
        .open(session.namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let author = session.author_id;
    let blobs = &*session.node.blobs_store;

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
        "role": "host",
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

    // images
    for img in &project.images {
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
            let _progress = doc.import_file(
                blobs,
                author,
                blob_key,
                &img_path,
                iroh_blobs::api::blobs::ImportMode::Copy,
            )
            .await
            .map_err(|e| format!("Error importando blob de imagen: {}", e))?;
            log::info!("Imagen {} importada como blob", img.id);
        }
    }

    log::info!("Proyecto exportado al iroh-doc: {} imágenes", project.images.len());
    Ok(())
}

/// Reconstruye un ProjectFile desde un iroh-doc (usado por colaborador al unirse)
pub async fn doc_to_project(
    p2p: &P2pState,
    target_dir: &std::path::Path,
    app_handle: &tauri::AppHandle,
) -> Result<ProjectFile, String> {
    let session = p2p.session.read().await;
    let session = session.as_ref().ok_or("No hay sesión P2P activa")?;

    let doc = session
        .node
        .docs
        .open(session.namespace_id)
        .await
        .map_err(|e| format!("Error abriendo doc: {}", e))?
        .ok_or("Documento no encontrado")?;

    let blobs: &iroh_blobs::api::Store = &*session.node.blobs_store;

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

    // Leer imágenes (meta + annots + blob)
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

            if field == "lock" {
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

    let total_images = img_data.len();
    let mut processed = 0;

    for (img_id, fields) in &img_data {
        if let Some(meta_bytes) = fields.get("meta") {
            let meta: serde_json::Value = serde_json::from_slice(meta_bytes)
                .map_err(|e| format!("Error deserializando img meta: {}", e))?;

            let annots: Vec<AnnotationEntry> = fields
                .get("annots")
                .and_then(|b| serde_json::from_slice(b).ok())
                .unwrap_or_default();

            let file_name = meta["file"].as_str().unwrap_or(&format!("{}.jpg", img_id)).to_string();
            if let Some(blob_data) = fields.get("blob") {
                let dest = images_dir.join(&file_name);
                std::fs::write(&dest, blob_data)
                    .map_err(|e| format!("Error escribiendo imagen: {}", e))?;
            }

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
            });

            processed += 1;
            let _ = app_handle.emit("p2p:sync-progress", serde_json::json!({
                "current": processed,
                "total": total_images,
                "phase": "downloading",
            }));
        }
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64;

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
        p2p: None,
    })
}

/// Sincroniza anotaciones locales al iroh-doc
pub async fn sync_annotations_to_doc(
    p2p: &P2pState,
    image_id: &str,
    annotations: &[AnnotationEntry],
) -> Result<(), String> {
    let session = p2p.session.read().await;
    let session = session.as_ref().ok_or("No hay sesión P2P activa")?;

    let doc = session
        .node
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

/// Inicia el watcher de cambios remotos en el iroh-doc
#[allow(dead_code)]
pub fn start_doc_watcher(
    namespace_id: iroh_docs::NamespaceId,
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

                    if key.starts_with("images/") && key.ends_with("/annots") {
                        let parts: Vec<&str> = key.split('/').collect();
                        if parts.len() == 3 {
                            let image_id = parts[1];
                            if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                                if let Ok(annots) = serde_json::from_slice::<Vec<AnnotationEntry>>(&content) {
                                    let _ = app_handle.emit("p2p:annotations-synced", serde_json::json!({
                                        "imageId": image_id,
                                        "annotations": annots,
                                        "from": from.to_string(),
                                    }));
                                }
                            }
                        }
                    }
                    else if key.starts_with("images/") && key.ends_with("/lock") {
                        let parts: Vec<&str> = key.split('/').collect();
                        if parts.len() == 3 {
                            let image_id = parts[1];
                            if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                                if let Ok(lock_info) = serde_json::from_slice::<ImageLockInfo>(&content) {
                                    let _ = app_handle.emit("p2p:image-locked", &lock_info);
                                } else {
                                    let _ = app_handle.emit("p2p:image-unlocked", serde_json::json!({
                                        "imageId": image_id,
                                    }));
                                }
                            }
                        }
                    }
                    else if key.starts_with("meta/peers/") {
                        if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                            if let Ok(peer_info) = serde_json::from_slice::<serde_json::Value>(&content) {
                                let node_id = key.strip_prefix("meta/peers/").unwrap_or("");
                                let _ = app_handle.emit("p2p:peer-joined", serde_json::json!({
                                    "nodeId": node_id,
                                    "displayName": peer_info["display_name"],
                                    "role": peer_info["role"],
                                }));
                            }
                        }
                    }
                    else if key == "meta/rules" {
                        if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                            if let Ok(rules) = serde_json::from_slice::<SessionRules>(&content) {
                                let _ = app_handle.emit("p2p:rules-updated", &rules);
                            }
                        }
                    }
                    else if key.starts_with("batches/") {
                        if let Ok(content) = read_entry_bytes(&entry, blobs).await {
                            if let Ok(batch) = serde_json::from_slice::<super::BatchInfo>(&content) {
                                let _ = app_handle.emit("p2p:batch-assigned", &batch);
                            }
                        }
                    }
                }
                Ok(iroh_docs::engine::LiveEvent::SyncFinished(sync_event)) => {
                    let _ = app_handle.emit("p2p:session-status", serde_json::json!({
                        "status": "connected",
                        "peer": sync_event.peer.to_string(),
                    }));
                }
                _ => {}
            }
        }
        log::info!("Doc watcher finalizado");
    });
}
