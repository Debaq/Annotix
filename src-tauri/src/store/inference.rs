use std::path::PathBuf;

use crate::store::project_file::{
    AnnotationEntry, ClassMapping, InferenceModelEntry, PredictionEntry,
};
use crate::store::state::AppState;

/// Timestamp JS compatible con Date.now()
fn js_timestamp() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as f64
}

impl AppState {
    /// Directorio de modelos de un proyecto
    pub fn project_models_dir(&self, project_id: &str) -> Result<PathBuf, String> {
        let dir = self.project_dir(project_id)?.join("models");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("Error creando directorio models: {}", e))?;
        Ok(dir)
    }

    /// Sube un modelo de inferencia al proyecto
    pub fn upload_inference_model(
        &self,
        project_id: &str,
        source_path: &str,
        name: &str,
        format: &str,
        task: &str,
        class_names: Vec<String>,
        input_size: Option<u32>,
        output_format: Option<String>,
        metadata: Option<serde_json::Value>,
    ) -> Result<InferenceModelEntry, String> {
        let models_dir = self.project_models_dir(project_id)?;
        let source = PathBuf::from(source_path);

        if !source.exists() {
            return Err(format!("Archivo fuente no encontrado: {}", source_path));
        }

        let original_name = source
            .file_name()
            .ok_or("Nombre de archivo inválido")?
            .to_string_lossy()
            .to_string();

        let id = uuid::Uuid::new_v4().to_string();
        let dest_name = format!("{}_{}", id, original_name);
        let dest = models_dir.join(&dest_name);

        // Copiar archivo
        std::fs::copy(&source, &dest)
            .map_err(|e| format!("Error copiando modelo: {}", e))?;

        // Calcular hash con blake3 (ya disponible en deps)
        let file_bytes = std::fs::read(&dest)
            .map_err(|e| format!("Error leyendo modelo para hash: {}", e))?;
        let hash = blake3::hash(&file_bytes);
        let model_hash = hash.to_hex().to_string();

        let now = js_timestamp();

        // Generar mapeo automático: sin mapear inicialmente
        let class_mapping: Vec<ClassMapping> = class_names
            .iter()
            .enumerate()
            .map(|(i, name)| ClassMapping {
                model_class_id: i,
                model_class_name: name.clone(),
                project_class_id: None,
            })
            .collect();

        let entry = InferenceModelEntry {
            id: id.clone(),
            name: name.to_string(),
            file: dest_name,
            format: format.to_string(),
            task: task.to_string(),
            class_names,
            class_mapping,
            input_size,
            output_format,
            model_hash,
            uploaded: now,
            metadata,
        };

        let entry_clone = entry.clone();
        self.with_project_mut(project_id, |pf| {
            pf.inference_models.push(entry_clone);
            pf.updated = now;
        })?;

        Ok(entry)
    }

    /// Elimina un modelo de inferencia
    pub fn delete_inference_model(
        &self,
        project_id: &str,
        model_id: &str,
    ) -> Result<(), String> {
        // Obtener nombre de archivo antes de eliminar
        let file = self.with_project(project_id, |pf| {
            pf.inference_models
                .iter()
                .find(|m| m.id == model_id)
                .map(|m| m.file.clone())
        })?;

        self.with_project_mut(project_id, |pf| {
            pf.inference_models.retain(|m| m.id != model_id);
            pf.updated = js_timestamp();
        })?;

        // Eliminar archivo físico
        if let Some(file) = file {
            let models_dir = self.project_models_dir(project_id)?;
            let path = models_dir.join(&file);
            let _ = std::fs::remove_file(&path);
        }

        Ok(())
    }

    /// Lista modelos de inferencia del proyecto
    pub fn list_inference_models(
        &self,
        project_id: &str,
    ) -> Result<Vec<InferenceModelEntry>, String> {
        self.with_project(project_id, |pf| pf.inference_models.clone())
    }

    /// Actualiza configuración del modelo (mapeo de clases, task, etc.)
    pub fn update_model_config(
        &self,
        project_id: &str,
        model_id: &str,
        class_mapping: Vec<ClassMapping>,
        input_size: Option<u32>,
        task: Option<String>,
        output_format: Option<String>,
    ) -> Result<(), String> {
        self.with_project_mut(project_id, |pf| {
            if let Some(model) = pf.inference_models.iter_mut().find(|m| m.id == model_id) {
                model.class_mapping = class_mapping;
                if let Some(size) = input_size {
                    model.input_size = Some(size);
                }
                if let Some(t) = task {
                    model.task = t;
                }
                // output_format: Some("yolov5") sets it, Some("") or None clears it
                model.output_format = output_format.filter(|s| !s.is_empty());
            }
            pf.updated = js_timestamp();
        })
    }

    /// Limpia predicciones de una imagen o de todas
    pub fn clear_predictions(
        &self,
        project_id: &str,
        image_id: Option<&str>,
    ) -> Result<(), String> {
        self.with_project_mut(project_id, |pf| {
            match image_id {
                Some(id) => {
                    if let Some(img) = pf.images.iter_mut().find(|i| i.id == id) {
                        img.predictions.clear();
                    }
                }
                None => {
                    for img in pf.images.iter_mut() {
                        img.predictions.clear();
                    }
                }
            }
            pf.updated = js_timestamp();
        })
    }

    /// Acepta una predicción
    pub fn accept_prediction(
        &self,
        project_id: &str,
        image_id: &str,
        prediction_id: &str,
    ) -> Result<(), String> {
        self.with_project_mut(project_id, |pf| {
            if let Some(img) = pf.images.iter_mut().find(|i| i.id == image_id) {
                if let Some(pred) = img.predictions.iter_mut().find(|p| p.id == prediction_id) {
                    pred.status = "accepted".to_string();
                }
            }
        })
    }

    /// Rechaza una predicción
    pub fn reject_prediction(
        &self,
        project_id: &str,
        image_id: &str,
        prediction_id: &str,
    ) -> Result<(), String> {
        self.with_project_mut(project_id, |pf| {
            if let Some(img) = pf.images.iter_mut().find(|i| i.id == image_id) {
                if let Some(pred) = img.predictions.iter_mut().find(|p| p.id == prediction_id) {
                    pred.status = "rejected".to_string();
                }
            }
        })
    }

    /// Convierte predicciones aceptadas a anotaciones reales
    pub fn convert_predictions_to_annotations(
        &self,
        project_id: &str,
        image_id: &str,
        class_mapping: &[ClassMapping],
    ) -> Result<usize, String> {
        let now = js_timestamp();
        let mut converted = 0usize;

        self.with_project_mut(project_id, |pf| {
            if let Some(img) = pf.images.iter_mut().find(|i| i.id == image_id) {
                let accepted: Vec<PredictionEntry> = img
                    .predictions
                    .iter()
                    .filter(|p| p.status == "accepted")
                    .cloned()
                    .collect();

                for pred in &accepted {
                    // Buscar mapeo para esta clase
                    let mapping = class_mapping
                        .iter()
                        .find(|m| m.model_class_id == pred.class_id);

                    let project_class_id = mapping
                        .and_then(|m| m.project_class_id.as_ref())
                        .and_then(|id_str| id_str.parse::<i64>().ok());

                    if let Some(class_id) = project_class_id {
                        // Verificar que la clase existe en el proyecto
                        if pf.classes.iter().any(|c| c.id == class_id) {
                            let annotation = AnnotationEntry {
                                id: uuid::Uuid::new_v4().to_string(),
                                annotation_type: infer_annotation_type(&pred.data),
                                class_id,
                                data: pred.data.clone(),
                                source: "user".to_string(),
                                confidence: Some(pred.confidence),
                                model_class_name: Some(pred.class_name.clone()),
                            };
                            img.annotations.push(annotation);
                            converted += 1;
                        }
                    }
                }

                // Eliminar predicciones convertidas
                img.predictions.retain(|p| p.status != "accepted");

                // Actualizar estado de imagen
                if !img.annotations.is_empty() {
                    img.status = "annotated".to_string();
                    img.annotated = Some(now);
                }
            }
            pf.updated = now;
        })?;

        Ok(converted)
    }

    /// Obtiene la ruta absoluta del archivo de modelo
    pub fn get_model_file_path(
        &self,
        project_id: &str,
        model_id: &str,
    ) -> Result<String, String> {
        let models_dir = self.project_models_dir(project_id)?;
        let file = self.with_project(project_id, |pf| {
            pf.inference_models
                .iter()
                .find(|m| m.id == model_id)
                .map(|m| m.file.clone())
        })?;

        match file {
            Some(f) => Ok(models_dir.join(f).to_string_lossy().to_string()),
            None => Err("Modelo no encontrado".to_string()),
        }
    }
}

/// Infiere el tipo de anotación basado en la estructura de data
fn infer_annotation_type(data: &serde_json::Value) -> String {
    if data.get("points").is_some() {
        "polygon".to_string()
    } else if data.get("x").is_some() && data.get("y").is_some()
        && data.get("width").is_some() && data.get("height").is_some()
    {
        "bbox".to_string()
    } else if data.get("angle").is_some() {
        "obb".to_string()
    } else {
        "bbox".to_string()
    }
}
