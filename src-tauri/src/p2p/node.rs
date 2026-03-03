use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use iroh::endpoint::Endpoint;
use iroh::protocol::Router;
use iroh::EndpointId;
use iroh_blobs::store::fs::FsStore;
use iroh_blobs::BlobsProtocol;
use iroh_docs::protocol::Docs;
use iroh_gossip::net::Gossip;
use tokio::sync::RwLock;

use super::{P2pPermission, P2pSessionInfo, PeerInfo, PeerRole, SessionRules, SessionStatus};

/// Nodo iroh activo con todos los protocolos
pub struct IrohNode {
    pub endpoint: Endpoint,
    pub docs: Docs,
    pub blobs_store: FsStore,
    pub _router: Router,
}

/// Sesión P2P activa
pub struct ActiveSession {
    pub session_id: String,
    pub project_id: String,
    pub project_name: String,
    pub share_code: String,
    pub role: PeerRole,
    pub rules: SessionRules,
    pub my_display_name: String,
    pub my_node_id: String,
    pub namespace_id: iroh_docs::NamespaceId,
    pub author_id: iroh_docs::AuthorId,
    pub peers: HashMap<String, PeerInfo>,
    pub node: Arc<IrohNode>,
    /// Secreto del host (solo presente si somos host)
    pub host_secret: Option<String>,
}

impl ActiveSession {
    pub fn to_info(&self) -> P2pSessionInfo {
        P2pSessionInfo {
            session_id: self.session_id.clone(),
            project_id: self.project_id.clone(),
            project_name: self.project_name.clone(),
            share_code: self.share_code.clone(),
            host_key: self.host_secret.as_ref().map(|s| {
                super::ticket::encode_host_key(s, &self.share_code)
            }),
            role: self.role.clone(),
            rules: self.rules.clone(),
            my_node_id: self.my_node_id.clone(),
            my_display_name: self.my_display_name.clone(),
            peers: self.peers.values().cloned().collect(),
            status: SessionStatus::Connected,
        }
    }
}

/// Estado P2P global gestionado por Tauri
pub struct P2pState {
    pub session: RwLock<Option<ActiveSession>>,
    pub data_dir: PathBuf,
}

impl P2pState {
    pub fn new() -> Self {
        let base_dir = directories::ProjectDirs::from("com", "tecmedhub", "annotix")
            .expect("No se pudo determinar el directorio de datos");
        let data_dir = base_dir.data_dir().join("p2p");
        let _ = std::fs::create_dir_all(&data_dir);

        Self {
            session: RwLock::new(None),
            data_dir,
        }
    }

    /// Verifica si la acción está permitida según rol + reglas de sesión.
    /// Si no hay sesión activa (modo local), todo se permite.
    pub async fn check_permission(&self, perm: P2pPermission) -> Result<(), String> {
        let session = self.session.read().await;
        let session = match session.as_ref() {
            Some(s) => s,
            None => return Ok(()),
        };

        if session.role == PeerRole::LeadResearcher {
            return Ok(());
        }

        let allowed = match perm {
            P2pPermission::Annotate => session.role.can_annotate(),
            P2pPermission::UploadData => session.role.can_upload_data() || session.rules.can_upload,
            P2pPermission::Export => session.role.can_export() || session.rules.can_export,
            P2pPermission::EditClasses => session.rules.can_edit_classes,
            P2pPermission::Delete => session.rules.can_delete,
            P2pPermission::Manage => false,
        };

        if allowed {
            Ok(())
        } else {
            let msg = match perm {
                P2pPermission::Annotate => "No tienes permiso para anotar en esta sesión",
                P2pPermission::UploadData => "No tienes permiso para subir datos en esta sesión",
                P2pPermission::Export => "No tienes permiso para exportar en esta sesión",
                P2pPermission::EditClasses => "No tienes permiso para editar clases en esta sesión",
                P2pPermission::Delete => "No tienes permiso para eliminar datos en esta sesión",
                P2pPermission::Manage => "Solo el investigador principal puede gestionar la sesión",
            };
            Err(msg.to_string())
        }
    }

    /// Inicializa un nodo iroh completo con blobs, gossip y docs
    pub async fn start_node(&self) -> Result<Arc<IrohNode>, String> {
        let iroh_dir = self.data_dir.join("iroh");
        let _ = std::fs::create_dir_all(&iroh_dir);
        let blobs_dir = iroh_dir.join("blobs");
        let docs_dir = iroh_dir.join("docs");
        let _ = std::fs::create_dir_all(&blobs_dir);
        let _ = std::fs::create_dir_all(&docs_dir);

        // Crear endpoint
        let endpoint = Endpoint::builder()
            .bind()
            .await
            .map_err(|e| format!("Error creando endpoint iroh: {}", e))?;

        // Blob store en filesystem
        let blobs_store = FsStore::load(&blobs_dir)
            .await
            .map_err(|e| format!("Error creando blob store: {}", e))?;

        // Gossip (sync, no async)
        let gossip = Gossip::builder().spawn(endpoint.clone());

        // Docs protocol (usa el builder de Docs)
        let blobs_api: iroh_blobs::api::Store = blobs_store.clone().into();
        let docs = Docs::persistent(docs_dir)
            .spawn(endpoint.clone(), blobs_api, gossip.clone())
            .await
            .map_err(|e| format!("Error creando docs: {}", e))?;

        // Blobs protocol handler
        let blobs_protocol = BlobsProtocol::new(&blobs_store, None);

        // Router para aceptar conexiones entrantes
        let router = Router::builder(endpoint.clone())
            .accept(iroh_blobs::ALPN, blobs_protocol)
            .accept(iroh_gossip::ALPN, gossip)
            .accept(iroh_docs::ALPN, docs.clone())
            .spawn();

        log::info!(
            "Nodo iroh iniciado. EndpointId: {}",
            endpoint.id()
        );

        Ok(Arc::new(IrohNode {
            endpoint,
            docs,
            blobs_store,
            _router: router,
        }))
    }

    pub fn endpoint_id_str(id: &EndpointId) -> String {
        id.to_string()
    }

    /// Genera un secreto de host (32 bytes random, hex-encoded)
    pub fn generate_host_secret() -> String {
        let mut bytes = [0u8; 32];
        getrandom(&mut bytes);
        hex::encode(&bytes)
    }

    /// Computa el hash blake3 de un secreto
    pub fn hash_secret(secret: &str) -> String {
        blake3::hash(secret.as_bytes()).to_hex().to_string()
    }
}

/// Rellena bytes aleatorios usando uuid v4 como fuente
fn getrandom(buf: &mut [u8]) {
    for chunk in buf.chunks_mut(16) {
        let id = uuid::Uuid::new_v4();
        let bytes = id.as_bytes();
        let len = chunk.len().min(16);
        chunk[..len].copy_from_slice(&bytes[..len]);
    }
}

mod hex {
    pub fn encode(data: &[u8]) -> String {
        data.iter().map(|b| format!("{:02x}", b)).collect()
    }
}
