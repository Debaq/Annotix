use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::store::state::AppState;

use super::node::P2pState;
use super::{PeerWorkStats, WorkAssignment, WorkDistribution};

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
        project_id: &str,
        app_state: &AppState,
    ) -> Result<WorkDistribution, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(project_id)
            .ok_or("No hay sesión P2P activa para este proyecto")?;

        if !session.role.can_manage() {
            return Err("Solo el host puede distribuir trabajo".to_string());
        }

        let sess_project_id = &session.project_id;

        // Recoger IDs de videos e imágenes sueltas del proyecto
        let (video_ids, standalone_image_ids) = app_state.with_project(sess_project_id, |pf| {
            let vids: Vec<String> = pf.videos.iter().map(|v| v.id.clone()).collect();
            let imgs: Vec<String> = pf
                .images
                .iter()
                .filter(|i| i.video_id.is_none())
                .map(|i| i.id.clone())
                .collect();
            (vids, imgs)
        })?;

        // Recoger peers (incluido el host)
        let mut peer_list: Vec<(String, String)> =
            vec![(session.my_node_id.clone(), session.my_display_name.clone())];
        for p in session.peers.values() {
            if !peer_list.iter().any(|(id, _)| id == &p.node_id) {
                peer_list.push((p.node_id.clone(), p.display_name.clone()));
            }
        }

        if peer_list.is_empty() {
            return Err("No hay peers para distribuir".to_string());
        }

        // Cuántas lecturas independientes pide la sesión, acotadas a la gente que
        // hay: pedir tres con dos evaluadores dejaría ítems eternamente a medias.
        let replicacion = session.rules.replicacion_efectiva(peer_list.len());

        // Leer distribución existente para detectar items ya asignados
        let existing = self
            .read_distribution_inner(node, session.namespace_id)
            .await;
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
        let new_videos: Vec<String> = video_ids
            .into_iter()
            .filter(|v| !already_assigned_videos.contains(v))
            .collect();
        let new_images: Vec<String> = standalone_image_ids
            .into_iter()
            .filter(|i| !already_assigned_images.contains(i))
            .collect();

        // Si no hay distribución previa, crear desde cero
        // Si hay previa, mantener assignments existentes y agregar nuevos items
        let mut assignments: Vec<WorkAssignment> = if let Some(prev) = &existing {
            // Preservar assignments existentes, filtrando peers que ya no están
            let active_ids: HashSet<&String> = peer_list.iter().map(|(id, _)| id).collect();
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
            round_robin_replicado(&mut kept, &all_new_videos, &all_new_images, replicacion);

            kept
        } else {
            // Distribución desde cero
            let mut assignments: Vec<WorkAssignment> = peer_list
                .iter()
                .map(|(nid, dname)| WorkAssignment {
                    node_id: nid.clone(),
                    display_name: dname.clone(),
                    video_ids: vec![],
                    image_ids: vec![],
                    updated_at: now_ms(),
                })
                .collect();

            round_robin_replicado(&mut assignments, &new_videos, &new_images, replicacion);
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
        let doc = node
            .docs
            .open(session.namespace_id)
            .await
            .map_err(|e| format!("Error abriendo doc: {}", e))?
            .ok_or("Documento no encontrado")?;

        let json = serde_json::to_vec(&distribution)
            .map_err(|e| format!("Error serializando distribución: {}", e))?;

        doc.set_bytes(session.author_id, b"work/distribution".to_vec(), json)
            .await
            .map_err(|e| format!("Error escribiendo distribución: {}", e))?;

        log::info!(
            "Trabajo distribuido v{}: {} assignments",
            distribution.version,
            distribution.assignments.len()
        );

        Ok(distribution)
    }

    /// Ajusta la asignación moviendo items de un peer a otro (solo host).
    pub async fn adjust_assignment(
        &self,
        project_id: &str,
        item_ids: Vec<String>,
        item_type: String,
        target_node_id: String,
    ) -> Result<WorkDistribution, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(project_id)
            .ok_or("No hay sesión P2P activa para este proyecto")?;

        if !session.role.can_manage() {
            return Err("Solo el host puede ajustar asignaciones".to_string());
        }

        let mut dist = self
            .read_distribution_inner(node, session.namespace_id)
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
        if let Some(target) = dist
            .assignments
            .iter_mut()
            .find(|a| a.node_id == target_node_id)
        {
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
        let doc = node
            .docs
            .open(session.namespace_id)
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
    pub async fn read_distribution(
        &self,
        project_id: &str,
    ) -> Result<Option<WorkDistribution>, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(project_id)
            .ok_or("No hay sesión P2P activa para este proyecto")?;
        Ok(self
            .read_distribution_inner(node, session.namespace_id)
            .await)
    }

    /// Lee distribución desde el doc (helper interno)
    async fn read_distribution_inner(
        &self,
        node: &std::sync::Arc<super::node::IrohNode>,
        namespace_id: iroh_docs::NamespaceId,
    ) -> Option<WorkDistribution> {
        let doc = node.docs.open(namespace_id).await.ok()??;
        let blobs: &iroh_blobs::api::Store = &node.blobs_store;

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
        project_id: &str,
        app_state: &AppState,
    ) -> Result<Vec<PeerWorkStats>, String> {
        let node_guard = self.node.read().await;
        let node = node_guard.as_ref().ok_or("No hay nodo P2P activo")?;
        let sessions = self.sessions.read().await;
        let session = sessions
            .get(project_id)
            .ok_or("No hay sesión P2P activa para este proyecto")?;

        let dist = self
            .read_distribution_inner(node, session.namespace_id)
            .await
            .ok_or("No hay distribución activa")?;

        let sess_project_id = &session.project_id;

        // Construir sets de imágenes/videos completados
        let (annotated_images, completed_videos) =
            app_state.with_project(sess_project_id, |pf| {
                // Imágenes sueltas con >=1 anotación
                let ann_imgs: HashSet<String> = pf
                    .images
                    .iter()
                    .filter(|i| i.video_id.is_none() && !i.annotations.is_empty())
                    .map(|i| i.id.clone())
                    .collect();

                // Videos donde TODOS sus frames tienen anotaciones
                let comp_vids: HashSet<String> = pf
                    .videos
                    .iter()
                    .filter(|v| {
                        let frames: Vec<&_> = pf
                            .images
                            .iter()
                            .filter(|i| i.video_id.as_deref() == Some(&v.id))
                            .collect();
                        !frames.is_empty() && frames.iter().all(|f| !f.annotations.is_empty())
                    })
                    .map(|v| v.id.clone())
                    .collect();

                (ann_imgs, comp_vids)
            })?;

        let stats: Vec<PeerWorkStats> = dist
            .assignments
            .iter()
            .map(|a| {
                let videos_assigned = a.video_ids.len();
                let videos_completed = a
                    .video_ids
                    .iter()
                    .filter(|vid| completed_videos.contains(*vid))
                    .count();
                let images_assigned = a.image_ids.len();
                let images_completed = a
                    .image_ids
                    .iter()
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
            })
            .collect();

        Ok(stats)
    }
}

/// Asigna items en round-robin a los assignments existentes.
/// Reparte cada ítem a `replicacion` evaluadores **distintos**.
///
/// Con replicación 1 es el reparto de siempre: cada ítem a una persona. Con 2 o
/// más, la misma imagen le toca a varias, que es lo que hace posible medir el
/// acuerdo entre ellas — sin dos lecturas independientes no hay nada que comparar.
///
/// Un mismo par no puede recibir el ítem dos veces: leerlo dos veces uno mismo no
/// es una lectura independiente, es la misma opinión contada dos veces. Si se
/// piden más lecturas que evaluadores hay, se dan las que se pueden dar; decirlo
/// es trabajo de quien configura la sesión (ver `SessionRules::replicacion_efectiva`).
///
/// El desplazamiento del arranque evita que las mismas parejas se repitan siempre:
/// con dos lecturas y cuatro pares, repetir pareja concentraría todo el acuerdo
/// medido en dos personas.
fn round_robin_replicado(
    assignments: &mut [WorkAssignment],
    videos: &[String],
    images: &[String],
    replicacion: usize,
) {
    if assignments.is_empty() {
        return;
    }

    let n = assignments.len();
    let veces = replicacion.clamp(1, n);

    for (i, vid) in videos.iter().enumerate() {
        for k in 0..veces {
            assignments[(i + k) % n].video_ids.push(vid.clone());
        }
    }

    // Las imágenes sueltas arrancan donde terminaron los videos, para no cargar
    // siempre al primer par con el principio de las dos listas.
    let desfase = videos.len();
    for (i, iid) in images.iter().enumerate() {
        for k in 0..veces {
            assignments[(desfase + i + k) % n]
                .image_ids
                .push(iid.clone());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mk_assignment(node_id: &str) -> WorkAssignment {
        WorkAssignment {
            node_id: node_id.into(),
            display_name: node_id.into(),
            video_ids: vec![],
            image_ids: vec![],
            updated_at: 0.0,
        }
    }

    #[test]
    fn round_robin_assign_no_ops_when_empty_peers() {
        let mut empty: Vec<WorkAssignment> = vec![];
        round_robin_replicado(&mut empty, &["v".into()], &["i".into()], 1);
        assert!(empty.is_empty());
    }

    #[test]
    fn round_robin_assign_distributes_evenly() {
        let mut peers = vec![mk_assignment("a"), mk_assignment("b"), mk_assignment("c")];
        let videos: Vec<String> = (0..6).map(|i| format!("v{}", i)).collect();
        let images: Vec<String> = (0..5).map(|i| format!("i{}", i)).collect();

        round_robin_replicado(&mut peers, &videos, &images, 1);

        // Videos: 6 items / 3 peers = 2 c/u
        assert_eq!(peers[0].video_ids, vec!["v0", "v3"]);
        assert_eq!(peers[1].video_ids, vec!["v1", "v4"]);
        assert_eq!(peers[2].video_ids, vec!["v2", "v5"]);

        // Imágenes: 5/3 → 2, 2, 1
        assert_eq!(peers[0].image_ids, vec!["i0", "i3"]);
        assert_eq!(peers[1].image_ids, vec!["i1", "i4"]);
        assert_eq!(peers[2].image_ids, vec!["i2"]);
    }

    #[test]
    fn round_robin_assign_single_peer_gets_all() {
        let mut peers = vec![mk_assignment("solo")];
        let videos: Vec<String> = vec!["v1".into(), "v2".into()];
        let images: Vec<String> = vec!["i1".into()];

        round_robin_replicado(&mut peers, &videos, &images, 1);

        assert_eq!(peers[0].video_ids.len(), 2);
        assert_eq!(peers[0].image_ids.len(), 1);
    }

    /// Con dos lecturas por ítem, cada imagen tiene que llegar a dos personas
    /// distintas: es lo que hace que haya algo que comparar.
    #[test]
    fn con_replicacion_cada_item_va_a_varios_evaluadores() {
        let mut peers = vec![mk_assignment("a"), mk_assignment("b"), mk_assignment("c")];
        let imagenes: Vec<String> = (0..3).map(|i| format!("i{}", i)).collect();

        round_robin_replicado(&mut peers, &[], &imagenes, 2);

        for img in &imagenes {
            let quienes: Vec<&str> = peers
                .iter()
                .filter(|p| p.image_ids.contains(img))
                .map(|p| p.node_id.as_str())
                .collect();
            assert_eq!(
                quienes.len(),
                2,
                "{img} no llegó a dos evaluadores: {quienes:?}"
            );
        }
        // Y el reparto sigue siendo parejo: 3 imágenes × 2 lecturas entre 3 pares.
        for p in &peers {
            assert_eq!(p.image_ids.len(), 2, "carga desigual: {:?}", p.image_ids);
        }
    }

    /// Leer dos veces uno mismo no es una lectura independiente: es la misma
    /// opinión contada dos veces.
    #[test]
    fn nadie_recibe_el_mismo_item_dos_veces() {
        let mut peers = vec![mk_assignment("a"), mk_assignment("b")];
        let imagenes: Vec<String> = (0..4).map(|i| format!("i{}", i)).collect();

        round_robin_replicado(&mut peers, &[], &imagenes, 2);

        for p in &peers {
            let mut vistos = std::collections::HashSet::new();
            for id in &p.image_ids {
                assert!(vistos.insert(id), "{} recibió {} dos veces", p.node_id, id);
            }
        }
    }

    /// Pedir más lecturas que evaluadores no deja ítems a medias: se dan las que
    /// se pueden dar.
    #[test]
    fn pedir_mas_lecturas_que_evaluadores_no_bloquea_el_reparto() {
        let mut peers = vec![mk_assignment("a"), mk_assignment("b")];
        round_robin_replicado(&mut peers, &[], &["i0".into()], 5);

        let reparto: usize = peers.iter().filter(|p| !p.image_ids.is_empty()).count();
        assert_eq!(reparto, 2, "se esperaban las dos lecturas posibles");
    }

    /// La replicación 1 tiene que dar exactamente el reparto de siempre, o cambia
    /// el trabajo de toda sesión ya en curso.
    #[test]
    fn replicacion_uno_es_el_reparto_de_siempre() {
        let mut peers = vec![mk_assignment("a"), mk_assignment("b"), mk_assignment("c")];
        let videos: Vec<String> = (0..6).map(|i| format!("v{}", i)).collect();
        let imagenes: Vec<String> = (0..5).map(|i| format!("i{}", i)).collect();

        round_robin_replicado(&mut peers, &videos, &imagenes, 1);

        // Videos: uno a cada par, por turno.
        assert_eq!(peers[0].video_ids, vec!["v0", "v3"]);
        assert_eq!(peers[1].video_ids, vec!["v1", "v4"]);
        assert_eq!(peers[2].video_ids, vec!["v2", "v5"]);
        // Cada imagen a una sola persona, y todas repartidas.
        let total: usize = peers.iter().map(|p| p.image_ids.len()).sum();
        assert_eq!(total, imagenes.len());
    }

    #[test]
    fn round_robin_assign_preserves_existing_items() {
        let mut peers = vec![mk_assignment("a"), mk_assignment("b")];
        peers[0].video_ids.push("existing".into());

        round_robin_replicado(&mut peers, &["new1".into()], &[], 1);

        assert_eq!(peers[0].video_ids, vec!["existing", "new1"]);
        assert!(peers[1].video_ids.is_empty());
    }
}
