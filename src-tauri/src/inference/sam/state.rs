//! Estado runtime SAM: sesiones ONNX, embedding cacheado, candidatos AMG.
//!
//! Separado de `store::state::AppState` por ciclo de vida distinto (efímero,
//! nunca se persiste). Lo registramos como `tauri::State` aparte.

use std::collections::HashMap;
use std::sync::Mutex;

use ort::session::Session;

use super::{SamMask, SamPrediction};

/// Sesiones ONNX cargadas (encoder + decoder emparejados).
#[allow(dead_code)]
pub struct SamSessions {
    pub encoder: Session,
    pub decoder: Session,
    /// Identificador del par cargado (hash combinado o UUID) — sirve para
    /// invalidar `SamEmbeddingCache` y `SamCandidates` al cambiar modelo.
    pub pair_id: String,
}

/// Cache del embedding de la imagen actual.
/// v1: un solo slot. Código preparado para LRU-N extendiendo a `HashMap`.
#[allow(dead_code)]
pub struct SamEmbeddingCache {
    pub image_id: String,
    pub project_id: String,
    pub orig_size: (u32, u32),
    pub input_size: (u32, u32),
    pub embedding: Vec<f32>,
}

/// Estado global SAM. Se `.manage()` en `tauri::Builder`.
pub struct SamState {
    pub sessions: Mutex<Option<SamSessions>>,
    pub cache: Mutex<Option<SamEmbeddingCache>>,
    /// Candidatos AMG por `image_id`. Efímero, nunca persiste.
    /// v1 mantiene 1 imagen; estructura lista para LRU.
    pub candidates: Mutex<HashMap<String, Vec<SamMask>>>,
    /// Última predicción del modo refine (sam_predict). Stash efímero para que
    /// `sam_accept_refine` reuse el pipeline conversión sin reenviar bytes por IPC.
    pub refine: Mutex<Option<SamPrediction>>,
}

impl SamState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(None),
            cache: Mutex::new(None),
            candidates: Mutex::new(HashMap::new()),
            refine: Mutex::new(None),
        }
    }

    /// Invalida TODO (cambio de modelo o de proyecto).
    #[allow(dead_code)]
    pub fn clear_all(&self) {
        if let Ok(mut s) = self.sessions.lock() { *s = None; }
        if let Ok(mut c) = self.cache.lock() { *c = None; }
        if let Ok(mut m) = self.candidates.lock() { m.clear(); }
        if let Ok(mut r) = self.refine.lock() { *r = None; }
    }

    /// Invalida solo cache de embedding + candidatos (cambio de imagen / reencode).
    #[allow(dead_code)]
    pub fn clear_runtime(&self) {
        if let Ok(mut c) = self.cache.lock() { *c = None; }
        if let Ok(mut m) = self.candidates.lock() { m.clear(); }
        if let Ok(mut r) = self.refine.lock() { *r = None; }
    }
}

impl Default for SamState {
    fn default() -> Self { Self::new() }
}
