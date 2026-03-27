use crate::store::project_file::{AudioEntry, AudioSegment, AudioEvent};
use crate::store::state::AppState;

/// Timestamp compatible con JS Date.now()
fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}

/// Respuesta de audio para el frontend
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioResponse {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub file: String,
    pub duration_ms: i64,
    pub sample_rate: i32,
    pub transcription: String,
    pub speaker_id: Option<String>,
    pub language: String,
    pub segments: Vec<AudioSegment>,
    pub class_id: Option<i64>,
    pub events: Vec<AudioEvent>,
    pub metadata: AudioMetadataResponse,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AudioMetadataResponse {
    pub uploaded: f64,
    pub annotated: Option<f64>,
    pub status: String,
}

fn entry_to_response(entry: &AudioEntry, project_id: &str) -> AudioResponse {
    AudioResponse {
        id: entry.id.clone(),
        project_id: project_id.to_string(),
        name: entry.name.clone(),
        file: entry.file.clone(),
        duration_ms: entry.duration_ms,
        sample_rate: entry.sample_rate,
        transcription: entry.transcription.clone(),
        speaker_id: entry.speaker_id.clone(),
        language: entry.language.clone(),
        segments: entry.segments.clone(),
        class_id: entry.class_id,
        events: entry.events.clone(),
        metadata: AudioMetadataResponse {
            uploaded: entry.uploaded,
            annotated: entry.annotated,
            status: entry.status.clone(),
        },
    }
}

impl AppState {
    pub fn upload_audio(
        &self,
        project_id: &str,
        file_path: &str,
        duration_ms: i64,
        sample_rate: i32,
        language: &str,
    ) -> Result<String, String> {
        let now = js_timestamp();
        let id = uuid::Uuid::new_v4().to_string();

        // Copiar archivo a la carpeta audio/ del proyecto
        let project_dir = self.project_dir(project_id)?;
        let audio_dir = project_dir.join("audio");
        std::fs::create_dir_all(&audio_dir)
            .map_err(|e| format!("Error creando directorio audio: {}", e))?;

        let src = std::path::Path::new(file_path);
        let file_name = src.file_name()
            .ok_or("Nombre de archivo inválido")?
            .to_string_lossy();
        let unique_name = format!("{}_{}", &id[..8], file_name);
        let dest = audio_dir.join(&unique_name);

        std::fs::copy(src, &dest)
            .map_err(|e| format!("Error copiando archivo de audio: {}", e))?;

        let original_name = file_name.to_string();

        let entry = AudioEntry {
            id: id.clone(),
            name: original_name,
            file: unique_name,
            duration_ms,
            sample_rate,
            transcription: String::new(),
            speaker_id: None,
            language: language.to_string(),
            segments: Vec::new(),
            class_id: None,
            events: Vec::new(),
            uploaded: now,
            annotated: None,
            status: "pending".to_string(),
        };

        self.with_project_mut(project_id, |pf| {
            pf.audio.push(entry);
            pf.updated = now;
        })?;

        Ok(id)
    }

    pub fn get_audio(
        &self,
        project_id: &str,
        audio_id: &str,
    ) -> Result<Option<AudioResponse>, String> {
        self.with_project(project_id, |pf| {
            pf.audio
                .iter()
                .find(|a| a.id == audio_id)
                .map(|a| entry_to_response(a, &pf.id))
        })
    }

    pub fn list_audio(
        &self,
        project_id: &str,
    ) -> Result<Vec<AudioResponse>, String> {
        self.with_project(project_id, |pf| {
            pf.audio
                .iter()
                .map(|a| entry_to_response(a, &pf.id))
                .collect()
        })
    }

    pub fn save_transcription(
        &self,
        project_id: &str,
        audio_id: &str,
        transcription: &str,
        speaker_id: Option<&str>,
        language: Option<&str>,
    ) -> Result<(), String> {
        let now = js_timestamp();
        self.with_project_mut(project_id, |pf| {
            if let Some(a) = pf.audio.iter_mut().find(|a| a.id == audio_id) {
                a.transcription = transcription.to_string();
                if let Some(sid) = speaker_id {
                    a.speaker_id = if sid.is_empty() { None } else { Some(sid.to_string()) };
                }
                if let Some(lang) = language {
                    a.language = lang.to_string();
                }
                a.status = if transcription.is_empty() { "pending".to_string() } else { "done".to_string() };
                a.annotated = if transcription.is_empty() { None } else { Some(now) };
            }
            pf.updated = now;
        })
    }

    pub fn delete_audio(
        &self,
        project_id: &str,
        audio_id: &str,
    ) -> Result<(), String> {
        // Obtener nombre de archivo para borrar del disco
        let file_name = self.with_project(project_id, |pf| {
            pf.audio.iter().find(|a| a.id == audio_id).map(|a| a.file.clone())
        })?;

        self.with_project_mut(project_id, |pf| {
            pf.audio.retain(|a| a.id != audio_id);
            pf.updated = js_timestamp();
        })?;

        // Borrar archivo físico
        if let Some(file) = file_name {
            let project_dir = self.project_dir(project_id)?;
            let audio_path = project_dir.join("audio").join(&file);
            let _ = std::fs::remove_file(audio_path);
        }

        Ok(())
    }

    pub fn get_audio_file_path(
        &self,
        project_id: &str,
        audio_id: &str,
    ) -> Result<String, String> {
        let file_name = self.with_project(project_id, |pf| {
            pf.audio.iter().find(|a| a.id == audio_id).map(|a| a.file.clone())
        })?;

        match file_name {
            Some(file) => {
                let project_dir = self.project_dir(project_id)?;
                let path = project_dir.join("audio").join(&file);
                Ok(path.to_string_lossy().to_string())
            }
            None => Err("Audio no encontrado".to_string()),
        }
    }

    pub fn get_audio_data(
        &self,
        project_id: &str,
        audio_id: &str,
    ) -> Result<Vec<u8>, String> {
        let path = self.get_audio_file_path(project_id, audio_id)?;
        std::fs::read(&path).map_err(|e| format!("Error leyendo audio: {}", e))
    }

    /// Registra un archivo de audio ya existente en disco (para ediciones FFmpeg)
    pub fn add_audio_from_file(
        &self,
        project_id: &str,
        file_name: &str,
        display_name: &str,
        duration_ms: i64,
        sample_rate: i32,
    ) -> Result<String, String> {
        let now = js_timestamp();
        let id = uuid::Uuid::new_v4().to_string();

        let entry = AudioEntry {
            id: id.clone(),
            name: display_name.to_string(),
            file: file_name.to_string(),
            duration_ms,
            sample_rate,
            transcription: String::new(),
            speaker_id: None,
            language: "en".to_string(),
            segments: Vec::new(),
            class_id: None,
            events: Vec::new(),
            uploaded: now,
            annotated: None,
            status: "pending".to_string(),
        };

        self.with_project_mut(project_id, |pf| {
            pf.audio.push(entry);
            pf.updated = now;
        })?;

        Ok(id)
    }

    pub fn save_audio_annotation(
        &self,
        project_id: &str,
        audio_id: &str,
        transcription: Option<&str>,
        speaker_id: Option<&str>,
        language: Option<&str>,
        segments: Option<Vec<AudioSegment>>,
        class_id: Option<i64>,
        events: Option<Vec<AudioEvent>>,
    ) -> Result<(), String> {
        let now = js_timestamp();
        self.with_project_mut(project_id, |pf| {
            if let Some(a) = pf.audio.iter_mut().find(|a| a.id == audio_id) {
                if let Some(t) = transcription {
                    a.transcription = t.to_string();
                }
                if let Some(sid) = speaker_id {
                    a.speaker_id = if sid.is_empty() { None } else { Some(sid.to_string()) };
                }
                if let Some(lang) = language {
                    a.language = lang.to_string();
                }
                if let Some(segs) = segments {
                    a.segments = segs;
                }
                if let Some(cid) = class_id {
                    a.class_id = if cid < 0 { None } else { Some(cid) };
                }
                if let Some(evts) = events {
                    a.events = evts;
                }

                // Determine status based on annotation content
                let has_annotation = !a.transcription.is_empty()
                    || !a.segments.is_empty()
                    || a.class_id.is_some()
                    || !a.events.is_empty();
                a.status = if has_annotation { "done".to_string() } else { "pending".to_string() };
                a.annotated = if has_annotation { Some(now) } else { None };
            }
            pf.updated = now;
        })
    }
}
