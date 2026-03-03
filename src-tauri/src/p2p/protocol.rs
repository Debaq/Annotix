#![allow(dead_code)]
use serde::{Deserialize, Serialize};

/// Mensajes gossip ligeros para notificaciones en tiempo real
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum GossipMessage {
    PeerJoined {
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(rename = "displayName")]
        display_name: String,
    },
    PeerLeft {
        #[serde(rename = "nodeId")]
        node_id: String,
    },
    ImageLocked {
        #[serde(rename = "imageId")]
        image_id: String,
        by: String,
        #[serde(rename = "byName")]
        by_name: String,
    },
    ImageUnlocked {
        #[serde(rename = "imageId")]
        image_id: String,
    },
    AnnotationsSaved {
        #[serde(rename = "imageId")]
        image_id: String,
        by: String,
    },
    BatchAssigned {
        #[serde(rename = "batchId")]
        batch_id: String,
        #[serde(rename = "imageIds")]
        image_ids: Vec<String>,
        to: String,
        #[serde(rename = "toName")]
        to_name: String,
    },
    PeerRoleChanged {
        #[serde(rename = "nodeId")]
        node_id: String,
        #[serde(rename = "newRole")]
        new_role: String,
    },
    DataSubmitted {
        #[serde(rename = "itemId")]
        item_id: String,
        #[serde(rename = "itemType")]
        item_type: String,
        by: String,
        #[serde(rename = "byName")]
        by_name: String,
    },
    DataApproved {
        #[serde(rename = "itemId")]
        item_id: String,
    },
    DataRejected {
        #[serde(rename = "itemId")]
        item_id: String,
    },
}

impl GossipMessage {
    pub fn to_bytes(&self) -> Result<Vec<u8>, String> {
        serde_json::to_vec(self).map_err(|e| format!("Error serializando gossip: {}", e))
    }

    pub fn from_bytes(data: &[u8]) -> Result<Self, String> {
        serde_json::from_slice(data).map_err(|e| format!("Error deserializando gossip: {}", e))
    }
}
