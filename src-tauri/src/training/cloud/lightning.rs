use super::{CloudJobHandle, CloudJobState, CloudJobStatus, CloudRunner};
use crate::training::{CloudProvider, CloudTrainingConfig, TrainingRequest};

pub struct LightningRunner {
    api_key: String,
}

impl LightningRunner {
    pub fn new(api_key: String) -> Self {
        Self { api_key }
    }

    fn client(&self) -> reqwest::blocking::Client {
        reqwest::blocking::Client::new()
    }

    fn auth_header(&self) -> String {
        format!("Bearer {}", self.api_key)
    }

    fn api_base(&self) -> String {
        "https://lightning.ai/api/v1".to_string()
    }

    fn generate_train_script(
        &self,
        request: &TrainingRequest,
        project_classes: &[String],
    ) -> String {
        let classes_str = project_classes
            .iter()
            .map(|c| format!("'{}'", c))
            .collect::<Vec<_>>()
            .join(", ");

        format!(
            r#"#!/usr/bin/env python3
import subprocess, os

subprocess.run(["pip", "install", "ultralytics"], check=True)

from ultralytics import YOLO

DATASET_DIR = "/teamspace/studios/this_studio/dataset"

# Classes: [{classes}]

model = YOLO("{model_id}")
results = model.train(
    data=os.path.join(DATASET_DIR, "dataset.yaml"),
    epochs={epochs},
    batch={batch_size},
    imgsz={image_size},
    device="0",
    lr0={lr},
    patience={patience},
    workers=2,
    project="/teamspace/studios/this_studio/results",
)
model.export(format="onnx")
"#,
            classes = classes_str,
            model_id = request.model_id,
            epochs = request.epochs,
            batch_size = request.batch_size,
            image_size = request.image_size,
            lr = request.lr,
            patience = request.patience,
        )
    }

    fn resolve_gpu_type(config: &CloudTrainingConfig) -> String {
        config
            .accelerator_type
            .as_deref()
            .unwrap_or("gpu-t4")
            .to_string()
    }
}

impl CloudRunner for LightningRunner {
    fn submit_job(
        &self,
        config: &CloudTrainingConfig,
        request: &TrainingRequest,
        dataset_path: &str,
        project_classes: &[String],
    ) -> Result<CloudJobHandle, String> {
        let job_uuid = uuid::Uuid::new_v4().to_string();
        let short_id = job_uuid.split('-').next().unwrap_or("job");
        let studio_name = format!("annotix-train-{}", short_id);
        let gpu_type = Self::resolve_gpu_type(config);

        // 1. Create studio with GPU
        let create_body = serde_json::json!({
            "name": studio_name,
            "teamspace": "default",
            "cloud_compute": {
                "name": gpu_type,
            },
            "disk_size": 10,
        });

        let resp = self
            .client()
            .post(format!("{}/studios", self.api_base()))
            .header("Authorization", self.auth_header())
            .json(&create_body)
            .send()
            .map_err(|e| format!("Error creando studio en Lightning AI: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Lightning AI studio create: {}", body));
        }

        let resp_body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let studio_id = resp_body["id"]
            .as_str()
            .unwrap_or(&job_uuid)
            .to_string();

        // 2. Upload dataset to studio filesystem
        let dataset_data = std::fs::read(dataset_path)
            .map_err(|e| format!("Error leyendo dataset: {}", e))?;

        let form = reqwest::blocking::multipart::Form::new()
            .part(
                "file",
                reqwest::blocking::multipart::Part::bytes(dataset_data)
                    .file_name("dataset.zip")
                    .mime_str("application/zip")
                    .map_err(|e| format!("Error preparando upload: {}", e))?,
            );

        let upload_resp = self
            .client()
            .post(format!(
                "{}/studios/{}/artifacts/dataset.zip",
                self.api_base(),
                studio_id
            ))
            .header("Authorization", self.auth_header())
            .multipart(form)
            .send()
            .map_err(|e| format!("Error subiendo dataset a Lightning AI: {}", e))?;

        if !upload_resp.status().is_success() {
            let body = upload_resp.text().unwrap_or_default();
            return Err(format!("Error Lightning AI dataset upload: {}", body));
        }

        // 3. Generate training script and upload
        let script = self.generate_train_script(request, project_classes);
        let script_form = reqwest::blocking::multipart::Form::new()
            .part(
                "file",
                reqwest::blocking::multipart::Part::bytes(script.into_bytes())
                    .file_name("train.py")
                    .mime_str("text/x-python")
                    .map_err(|e| format!("Error preparando script: {}", e))?,
            );

        let script_resp = self
            .client()
            .post(format!(
                "{}/studios/{}/artifacts/train.py",
                self.api_base(),
                studio_id
            ))
            .header("Authorization", self.auth_header())
            .multipart(script_form)
            .send()
            .map_err(|e| format!("Error subiendo script a Lightning AI: {}", e))?;

        if !script_resp.status().is_success() {
            let body = script_resp.text().unwrap_or_default();
            return Err(format!("Error Lightning AI script upload: {}", body));
        }

        // 4. Execute training command
        let cmd_body = serde_json::json!({
            "command": "cd /teamspace/studios/this_studio && unzip -o dataset.zip -d dataset && python train.py",
        });

        let cmd_resp = self
            .client()
            .post(format!(
                "{}/studios/{}/command",
                self.api_base(),
                studio_id
            ))
            .header("Authorization", self.auth_header())
            .json(&cmd_body)
            .send()
            .map_err(|e| format!("Error ejecutando comando en Lightning AI: {}", e))?;

        if !cmd_resp.status().is_success() {
            let body = cmd_resp.text().unwrap_or_default();
            return Err(format!("Error Lightning AI command exec: {}", body));
        }

        Ok(CloudJobHandle {
            job_id: studio_id.clone(),
            job_url: Some(format!("https://lightning.ai/studios/{}", studio_id)),
            provider: CloudProvider::LightningAi,
        })
    }

    fn poll_status(&self, handle: &CloudJobHandle) -> Result<CloudJobStatus, String> {
        let url = format!("{}/studios/{}", self.api_base(), handle.job_id);

        let resp = self
            .client()
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error polling Lightning AI: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Lightning AI status: {}", body));
        }

        let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let status = body["status"].as_str().unwrap_or("unknown");

        let (state, progress) = match status {
            "pending" => (CloudJobState::Queued, Some(5.0)),
            "starting" => (CloudJobState::Queued, Some(10.0)),
            "running" => (CloudJobState::Running, Some(50.0)),
            "stopping" => (CloudJobState::Running, Some(90.0)),
            "stopped" => (CloudJobState::Succeeded, Some(100.0)),
            "failed" => (CloudJobState::Failed, None),
            _ => (CloudJobState::Running, Some(25.0)),
        };

        let error_msg = body["error"].as_str().map(|s| s.to_string());

        Ok(CloudJobStatus {
            state,
            message: error_msg,
            progress_percent: progress,
            model_output_uri: None,
        })
    }

    fn cancel_job(&self, handle: &CloudJobHandle) -> Result<(), String> {
        let url = format!("{}/studios/{}", self.api_base(), handle.job_id);

        let resp = self
            .client()
            .delete(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error cancelando studio en Lightning AI: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error cancelando Lightning AI: {}", body));
        }

        Ok(())
    }

    fn download_model(
        &self,
        handle: &CloudJobHandle,
        _status: &CloudJobStatus,
        output_dir: &str,
    ) -> Result<String, String> {
        // Download the best model from studio artifacts
        let url = format!(
            "{}/studios/{}/artifacts/results/train/weights/best.pt",
            self.api_base(),
            handle.job_id
        );

        let resp = self
            .client()
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error descargando modelo de Lightning AI: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Lightning AI model download: {}", body));
        }

        let output_path = std::path::Path::new(output_dir).join("lightning_best.pt");
        let bytes = resp.bytes().map_err(|e| e.to_string())?;
        std::fs::write(&output_path, &bytes)
            .map_err(|e| format!("Error escribiendo modelo: {}", e))?;

        Ok(output_path.to_string_lossy().to_string())
    }
}

/// Valida credenciales de Lightning AI consultando el perfil del usuario
pub fn validate_credentials(api_key: &str) -> Result<(), String> {
    let client = reqwest::blocking::Client::new();
    let resp = client
        .get("https://lightning.ai/api/v1/me")
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .map_err(|e| format!("Error conectando con Lightning AI: {}", e))?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Credenciales de Lightning AI inválidas (HTTP {})",
            resp.status()
        ))
    }
}
