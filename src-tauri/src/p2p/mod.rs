pub mod node;
pub mod session;
pub mod sync;
pub mod locks;
pub mod ticket;
pub mod protocol;
pub mod distribution;

use serde::{Deserialize, Serialize};

// ─── Tipos base P2P ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PeerRole {
    Host,
    Collaborator,
}

impl std::fmt::Display for PeerRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PeerRole::Host => write!(f, "host"),
            PeerRole::Collaborator => write!(f, "collaborator"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum LockMode {
    Individual,
    Batch,
}

impl std::fmt::Display for LockMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LockMode::Individual => write!(f, "individual"),
            LockMode::Batch => write!(f, "batch"),
        }
    }
}

impl LockMode {
    #[allow(dead_code)]
    pub fn from_str_lossy(s: &str) -> Self {
        match s {
            "batch" => LockMode::Batch,
            _ => LockMode::Individual,
        }
    }
}

/// Reglas de la sesión configurables por el host
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRules {
    pub lock_mode: LockMode,
    /// Colaboradores pueden subir imágenes
    pub can_upload: bool,
    /// Colaboradores pueden editar/crear clases
    pub can_edit_classes: bool,
    /// Colaboradores pueden eliminar imágenes/anotaciones
    pub can_delete: bool,
    /// Colaboradores pueden exportar el proyecto
    pub can_export: bool,
}

impl Default for SessionRules {
    fn default() -> Self {
        Self {
            lock_mode: LockMode::Individual,
            can_upload: false,
            can_edit_classes: false,
            can_delete: false,
            can_export: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    #[serde(rename = "nodeId")]
    pub node_id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    pub role: PeerRole,
    #[serde(rename = "joinedAt")]
    pub joined_at: f64,
    pub online: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageLockInfo {
    #[serde(rename = "imageId")]
    pub image_id: String,
    #[serde(rename = "lockedBy")]
    pub locked_by: String,
    #[serde(rename = "lockedByName")]
    pub locked_by_name: String,
    #[serde(rename = "lockedAt")]
    pub locked_at: f64,
    #[serde(rename = "expiresAt")]
    pub expires_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchInfo {
    pub id: String,
    #[serde(rename = "imageIds")]
    pub image_ids: Vec<String>,
    #[serde(rename = "assignedTo")]
    pub assigned_to: String,
    #[serde(rename = "assignedToName")]
    pub assigned_to_name: String,
    #[serde(rename = "createdAt")]
    pub created_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkAssignment {
    pub node_id: String,
    pub display_name: String,
    pub video_ids: Vec<String>,
    pub image_ids: Vec<String>,
    pub updated_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkDistribution {
    pub version: u64,
    pub assignments: Vec<WorkAssignment>,
    pub created_by: String,
    pub created_at: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerWorkStats {
    pub node_id: String,
    pub display_name: String,
    pub videos_assigned: usize,
    pub videos_completed: usize,
    pub images_assigned: usize,
    pub images_completed: usize,
    pub progress_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct P2pSessionInfo {
    pub session_id: String,
    pub project_id: String,
    pub project_name: String,
    /// Código para colaboradores
    pub share_code: String,
    /// Clave del host (solo presente para el host)
    pub host_key: Option<String>,
    pub role: PeerRole,
    pub rules: SessionRules,
    pub my_node_id: String,
    pub my_display_name: String,
    pub peers: Vec<PeerInfo>,
    pub status: SessionStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionStatus {
    Connecting,
    Syncing,
    Connected,
    Disconnected,
    Error,
}
