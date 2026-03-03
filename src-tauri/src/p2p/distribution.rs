use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::store::state::AppState;

use super::node::P2pState;
use super::{PeerRole, WorkAssignment, WorkDistribution, PeerWorkStats};

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}

impl P2pState {
    /// Distribuye trabajo equitativamente entre todos los peers (solo host).
    /// Videos completos se asignan como unidades indivisibles, imágenes sueltas por separado.
    /// Si ya existe distribución previa, redistribuye solo los items nuevos (no asignados).
    pub async fn distribute_work(
        &self,
        app_state: &AppState,
    ) -> Result<WorkDistribution, String> {
        let session = self.session.read().await;
        let session = session.as_ref().ok_or("No hay sesión P2P activa")?;

        if session.role != PeerRole::Host {
            return Err("Solo el host puede distribuir trabajo".to_string());
        }

        let project_id = &session.project_id;

        // Recoger IDs de videos e imágenes sueltas del proyecto
        let (video_ids, standalone_image_ids) = app_state.with_project(project_id, |pf| {
            let vids: Vec<String> = pf.videos.iter().map(|v| v.id.clone()).collect();
            let imgs: Vec<String> = pf.images.iter()
                .filter(|i| i.video_id.is_none())
                .map(|i| i.id.clone())
                .collect();
            (vids, imgs)
        })?;

        // Recoger peers (incluido el host)
        let mut peer_list: Vec<(String, String)> = vec![
            (session.my_node_id.clone(), session.my_display_name.clone())
        ];
        for p in session.peers.values() {
            if !peer_list.iter().any(|(id, _)| id == &p.node_id) {
                peer_list.push((p.node_id.clone(), p.display_name.clone()));
            }
        }

        if peer_list.is_empty() {
            return Err("No hay peers para distribuir".to_string());
        }

        // Leer distribución existente para detectar items ya asignados
        let existing = self.read_distribution_inner(&session.node, session.namespace_id).await;
        let mut already_assigned_videos: HashSet<String> = HashSet::new();
        let mut already_assigned_images: HashSet<String> = HashSet::new();
        let prev_version = if let Some(ref dist) = existing {
            for a in &dist.assignments {
                for vid in &a.video_ids {
                    already_assigned_videos.insert(vid.clone());
                }
                for iid in &a.image_ids {
                    already_assigned_images.insert(iid.clone());
                }
            }
            dist.version
        } else {
            0
        };

        // Items nuevos (no asignados en distribución previa)
        let new_videos: Vec<String> = video_ids.into_iter()
            .filter(|v| !already_assigned_videos.contains(v))
            .collect();
        let new_images: Vec<String> = standalone_image_ids.into_iter()
            .filter(|i| !already_assigned_images.contains(i))
            .collect();

        // Si no hay distribución previa, crear desde cero
        // Si hay previa, mantener assignments existentes y agregar nuevos items
        let mut assignments: Vec<WorkAssignment> = if existing.is_some() {
            // Preservar assignments existentes, filtrando peers que ya no están
            let active_ids: HashSet<&String> = peer_list.iter().map(|(id, _)| id).collect();
            let prev = existing.as_ref().unwrap();
            let mut kept: Vec<WorkAssignment> = Vec::new();
            let mut orphan_videos: Vec<String> = Vec::new();
            let mut orphan_images: Vec<String> = Vec::new();

            for a in &prev.assignments {
                if active_ids.contains(&a.node_id) {
                    kept.push(a.clone());
                } else {
                    // Peer ya no está: sus items se redistribuyen
                    orphan_videos.extend(a.video_ids.clone());
                    orphan_images.extend(a.image_ids.clone());
                }
            }

            // Asegurar que todos los peers activos tienen assignment
            for (nid, dname) in &peer_list {
                if !kept.iter().any(|a| &a.node_id == nid) {
                    kept.push(WorkAssignment {
                        node_id: nid.clone(),
                        display_name: dname.clone(),
                        video_ids: vec![],
                        image_ids: vec![],
                        updated_at: now_ms(),
                    });
                }
            }

            // Combinar orphans + nuevos
            let all_new_videos: Vec<String> = orphan_videos.into_iter().chain(new_videos).collect();
            let all_new_images: Vec<String> = orphan_images.into_iter().chain(new_images).collect();

            // Round-robin nuevos items
            round_robin_assign(&mut kept, &all_new_videos, &all_new_images);

            kept
        } else {
            // Distribución desde cero
            let mut assignments: Vec<WorkAssignment> = peer_list.iter().map(|(nid, dname)| {
                WorkAssignment {
                    node_id: nid.clone(),
                    display_name: dname.clone(),
                    video_ids: vec![],
                    image_ids: vec![],
                    updated_at: now_ms(),
                }
            }).collect();

            round_robin_assign(&mut assignments, &new_videos, &new_images);
            assignments
        };

        // Actualizar updated_at
        let now = now_ms();
        for a in &mut assignments {
            a.updated_at = now;
        }

        let distribution = WorkDistribution {
            version: prev_version + 1,
            assignments,
            created_by: session.my_node_id.clone(),
            created_at: now,
        };

        // Escribir al iroh-doc
        let doc = session.node.docs.open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let json = serde_json::to_vec(&distribution)
            .map_err(|e| format!("Error serializando distribución: {}", e))?;

        doc.set_bytes(session.author_id, b"work/distribution".to_vec(), json)
            .await
            .map_err(|e| format!("Error escribiendo distribución: {}", e))?;

        log::info!("Trabajo distribuido v{}: {} assignments", distribution.version, distribution.assignments.len());

        Ok(distribution)
    }

    /// Ajusta la asignación moviendo items de un peer a otro (solo host).
    pub async fn adjust_assignment(
        &self,
        item_ids: Vec<String>,
        item_type: String,
        target_node_id: String,
    ) -> Result<WorkDistribution, String> {
        let session = self.session.read().await;
        let session = session.as_ref().ok_or("No hay sesión P2P activa")?;

        if session.role != PeerRole::Host {
            return Err("Solo el host puede ajustar asignaciones".to_string());
        }

        let mut dist = self.read_distribution_inner(&session.node, session.namespace_id)
            .await
            .ok_or("No hay distribución activa")?;

        let item_set: HashSet<String> = item_ids.into_iter().collect();

        // Quitar items de sus assignments actuales
        for a in &mut dist.assignments {
            if item_type == "video" {
                a.video_ids.retain(|id| !item_set.contains(id));
            } else {
                a.image_ids.retain(|id| !item_set.contains(id));
            }
        }

        // Agregar items al target
        if let Some(target) = dist.assignments.iter_mut().find(|a| a.node_id == target_node_id) {
            if item_type == "video" {
                target.video_ids.extend(item_set);
            } else {
                target.image_ids.extend(item_set);
            }
            target.updated_at = now_ms();
        } else {
            return Err("Peer destino no encontrado en la distribución".to_string());
        }

        dist.version += 1;
        dist.created_at = now_ms();

        // Escribir al doc
        let doc = session.node.docs.open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let json = serde_json::to_vec(&dist)
            .map_err(|e| format!("Error serializando distribución: {}", e))?;

        doc.set_bytes(session.author_id, b"work/distribution".to_vec(), json)
            .await
            .map_err(|e| format!("Error escribiendo distribución: {}", e))?;

        Ok(dist)
    }

    /// Lee la distribución actual del iroh-doc. Cualquier peer puede llamarla.
    pub async fn read_distribution(&self) -> Result<Option<WorkDistribution>, String> {
        let session = self.session.read().await;
        let session = session.as_ref().ok_or("No hay sesión P2P activa")?;
        Ok(self.read_distribution_inner(&session.node, session.namespace_id).await)
    }

    /// Lee distribución desde el doc (helper interno)
    async fn read_distribution_inner(
        &self,
        node: &std::sync::Arc<super::node::IrohNode>,
        namespace_id: iroh_docs::NamespaceId,
    ) -> Option<WorkDistribution> {
        let doc = node.docs.open(namespace_id).await.ok()??;
        let blobs: &iroh_blobs::api::Store = &*node.blobs_store;

        let entry = doc
            .get_one(iroh_docs::store::Query::key_exact(b"work/distribution"))
            .await
            .ok()??;

        let hash = entry.content_hash();
        let content = blobs.blobs().get_bytes(hash).await.ok()?;
        serde_json::from_slice(&content).ok()
    }

    /// Calcula estadísticas de progreso por peer.
    pub async fn get_work_stats(
        &self,
        app_state: &AppState,
    ) -> Result<Vec<PeerWorkStats>, String> {
        let session = self.session.read().await;
        let session = session.as_ref().ok_or("No hay sesión P2P activa")?;

        let dist = self.read_distribution_inner(&session.node, session.namespace_id)
            .await
            .ok_or("No hay distribución activa")?;

        let project_id = &session.project_id;

        // Construir sets de imágenes/videos completados
        let (annotated_images, completed_videos) = app_state.with_project(project_id, |pf| {
            // Imágenes sueltas con >=1 anotación
            let ann_imgs: HashSet<String> = pf.images.iter()
                .filter(|i| i.video_id.is_none() && !i.annotations.is_empty())
                .map(|i| i.id.clone())
                .collect();

            // Videos donde TODOS sus frames tienen anotaciones
            let comp_vids: HashSet<String> = pf.videos.iter()
                .filter(|v| {
                    let frames: Vec<&_> = pf.images.iter()
                        .filter(|i| i.video_id.as_deref() == Some(&v.id))
                        .collect();
                    !frames.is_empty() && frames.iter().all(|f| !f.annotations.is_empty())
                })
                .map(|v| v.id.clone())
                .collect();

            (ann_imgs, comp_vids)
        })?;

        let stats: Vec<PeerWorkStats> = dist.assignments.iter().map(|a| {
            let videos_assigned = a.video_ids.len();
            let videos_completed = a.video_ids.iter()
                .filter(|vid| completed_videos.contains(*vid))
                .count();
            let images_assigned = a.image_ids.len();
            let images_completed = a.image_ids.iter()
                .filter(|iid| annotated_images.contains(*iid))
                .count();

            let total = videos_assigned + images_assigned;
            let done = videos_completed + images_completed;
            let progress = if total > 0 {
                (done as f64 / total as f64) * 100.0
            } else {
                0.0
            };

            PeerWorkStats {
                node_id: a.node_id.clone(),
                display_name: a.display_name.clone(),
                videos_assigned,
                videos_completed,
                images_assigned,
                images_completed,
                progress_percent: (progress * 10.0).round() / 10.0,
            }
        }).collect();

        Ok(stats)
    }
}

/// Asigna items en round-robin a los assignments existentes.
fn round_robin_assign(
    assignments: &mut [WorkAssignment],
    videos: &[String],
    images: &[String],
) {
    if assignments.is_empty() {
        return;
    }

    let n = assignments.len();

    // Videos primero (unidades indivisibles)
    for (i, vid) in videos.iter().enumerate() {
        assignments[i % n].video_ids.push(vid.clone());
    }

    // Imágenes sueltas después
    for (i, iid) in images.iter().enumerate() {
        assignments[i % n].image_ids.push(iid.clone());
    }
}
