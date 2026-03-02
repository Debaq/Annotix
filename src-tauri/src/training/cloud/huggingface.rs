use super::{CloudJobHandle, CloudJobState, CloudJobStatus, CloudRunner};
use crate::training::{CloudProvider, CloudTrainingConfig, TrainingRequest};

pub struct HuggingFaceRunner {
    token: String,
    username: String,
}

impl HuggingFaceRunner {
    pub fn new(token: String, username: String) -> Self {
        Self { token, username }
    }

    fn client(&self) -> reqwest::blocking::Client {
        reqwest::blocking::Client::new()
    }

    fn auth_header(&self) -> String {
        format!("Bearer {}", self.token)
    }

    fn create_model_repo(&self, repo_name: &str) -> Result<String, String> {
        let full_name = format!("{}/{}", self.username, repo_name);

        let body = serde_json::json!({
            "type": "model",
            "name": repo_name,
            "private": true,
        });

        let resp = self
            .client()
            .post("https://huggingface.co/api/repos/create")
            .header("Authorization", self.auth_header())
            .json(&body)
            .send()
            .map_err(|e| format!("Error creando repo en Hugging Face: {}", e))?;

        if !resp.status().is_success() {
            let resp_body = resp.text().unwrap_or_default();
            // Repo already exists is acceptable
            if !resp_body.contains("already") {
                return Err(format!("Error HF repo create: {}", resp_body));
            }
        }

        Ok(full_name)
    }

    fn upload_dataset_to_repo(
        &self,
        repo_name: &str,
        dataset_path: &str,
    ) -> Result<String, String> {
        let dataset_repo = format!("{}/{}-dataset", self.username, repo_name);

        // Create dataset repo
        let body = serde_json::json!({
            "type": "dataset",
            "name": format!("{}-dataset", repo_name),
            "private": true,
        });

        let resp = self
            .client()
            .post("https://huggingface.co/api/repos/create")
            .header("Authorization", self.auth_header())
            .json(&body)
            .send()
            .map_err(|e| format!("Error creando dataset repo en HF: {}", e))?;

        if !resp.status().is_success() {
            let resp_body = resp.text().unwrap_or_default();
            if !resp_body.contains("already") {
                return Err(format!("Error HF dataset repo create: {}", resp_body));
            }
        }

        // Upload dataset zip via the upload API
        let data = std::fs::read(dataset_path)
            .map_err(|e| format!("Error leyendo dataset: {}", e))?;

        let upload_url = format!(
            "https://huggingface.co/api/datasets/{}/upload/main/dataset.zip",
            dataset_repo
        );

        let form = reqwest::blocking::multipart::Form::new().part(
            "file",
            reqwest::blocking::multipart::Part::bytes(data)
                .file_name("dataset.zip")
                .mime_str("application/zip")
                .map_err(|e| format!("Error preparando upload: {}", e))?,
        );

        let upload_resp = self
            .client()
            .post(&upload_url)
            .header("Authorization", self.auth_header())
            .multipart(form)
            .send()
            .map_err(|e| format!("Error subiendo dataset a HF: {}", e))?;

        if !upload_resp.status().is_success() {
            let body = upload_resp.text().unwrap_or_default();
            return Err(format!("Error HF dataset upload: {}", body));
        }

        Ok(dataset_repo)
    }

    fn generate_train_script(
        &self,
        request: &TrainingRequest,
        dataset_repo: &str,
        model_repo: &str,
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

subprocess.run(["pip", "install", "ultralytics", "huggingface_hub"], check=True)

from ultralytics import YOLO
from huggingface_hub import hf_hub_download, upload_folder

# Download dataset
hf_hub_download(repo_id="{dataset_repo}", filename="dataset.zip", repo_type="dataset", local_dir="/tmp/hf_dataset")
subprocess.run(["unzip", "-o", "/tmp/hf_dataset/dataset.zip", "-d", "/tmp/dataset"], check=True)

# Classes: [{classes}]

model = YOLO("{model_id}")
results = model.train(
    data="/tmp/dataset/dataset.yaml",
    epochs={epochs},
    batch={batch_size},
    imgsz={image_size},
    device="0",
    lr0={lr},
    patience={patience},
    workers=2,
    project="/tmp/results",
)
model.export(format="onnx")

# Upload results to model repo
upload_folder(
    folder_path="/tmp/results/train/weights",
    repo_id="{model_repo}",
    repo_type="model",
)
"#,
            dataset_repo = dataset_repo,
            classes = classes_str,
            model_id = request.model_id,
            epochs = request.epochs,
            batch_size = request.batch_size,
            image_size = request.image_size,
            lr = request.lr,
            patience = request.patience,
            model_repo = model_repo,
        )
    }
}

impl CloudRunner for HuggingFaceRunner {
    fn submit_job(
        &self,
        _config: &CloudTrainingConfig,
        request: &TrainingRequest,
        dataset_path: &str,
        project_classes: &[String],
    ) -> Result<CloudJobHandle, String> {
        let job_uuid = uuid::Uuid::new_v4().to_string();
        let short_id = job_uuid.split('-').next().unwrap_or("job");
        let repo_name = format!("annotix-train-{}", short_id);

        // 1. Create output model repo
        let model_repo = self.create_model_repo(&repo_name)?;

        // 2. Upload dataset as a dataset repo
        let dataset_repo = self.upload_dataset_to_repo(&repo_name, dataset_path)?;

        // 3. Generate training script
        let script = self.generate_train_script(request, &dataset_repo, &model_repo, project_classes);

        // 4. Upload training script to model repo
        let script_form = reqwest::blocking::multipart::Form::new().part(
            "file",
            reqwest::blocking::multipart::Part::bytes(script.into_bytes())
                .file_name("train.py")
                .mime_str("text/x-python")
                .map_err(|e| format!("Error preparando script: {}", e))?,
        );

        let script_url = format!(
            "https://huggingface.co/api/models/{}/upload/main/train.py",
            model_repo
        );

        let script_resp = self
            .client()
            .post(&script_url)
            .header("Authorization", self.auth_header())
            .multipart(script_form)
            .send()
            .map_err(|e| format!("Error subiendo script a HF: {}", e))?;

        if !script_resp.status().is_success() {
            let body = script_resp.text().unwrap_or_default();
            return Err(format!("Error HF script upload: {}", body));
        }

        // 5. Launch AutoTrain job
        let autotrain_body = serde_json::json!({
            "model": model_repo,
            "dataset": dataset_repo,
            "task": "object-detection",
            "training_script": "train.py",
            "hardware": "gpu-t4-small",
        });

        let autotrain_resp = self
            .client()
            .post(format!(
                "https://huggingface.co/api/spaces/{}/autotrain/create",
                self.username
            ))
            .header("Authorization", self.auth_header())
            .json(&autotrain_body)
            .send()
            .map_err(|e| format!("Error lanzando AutoTrain en HF: {}", e))?;

        if !autotrain_resp.status().is_success() {
            let body = autotrain_resp.text().unwrap_or_default();
            return Err(format!("Error HF AutoTrain create: {}", body));
        }

        let resp_body: serde_json::Value = autotrain_resp.json().map_err(|e| e.to_string())?;
        let space_id = resp_body["space_id"]
            .as_str()
            .unwrap_or(&model_repo)
            .to_string();

        Ok(CloudJobHandle {
            job_id: space_id.clone(),
            job_url: Some(format!("https://huggingface.co/{}", model_repo)),
            provider: CloudProvider::HuggingFace,
        })
    }

    fn poll_status(&self, handle: &CloudJobHandle) -> Result<CloudJobStatus, String> {
        let url = format!(
            "https://huggingface.co/api/spaces/{}",
            handle.job_id
        );

        let resp = self
            .client()
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error polling Hugging Face: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error HF status: {}", body));
        }

        let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let runtime_stage = body["runtime"]["stage"].as_str().unwrap_or("unknown");

        let (state, progress) = match runtime_stage {
            "NO_APP_FILE" | "CONFIG_ERROR" => (CloudJobState::Failed, None),
            "BUILDING" | "BUILD_ERROR" => (CloudJobState::Queued, Some(10.0)),
            "RUNNING" | "RUNNING_BUILDING" => (CloudJobState::Running, Some(50.0)),
            "PAUSED" | "SLEEPING" | "STOPPED" => (CloudJobState::Succeeded, Some(100.0)),
            _ => (CloudJobState::Running, Some(25.0)),
        };

        let error_msg = if state == CloudJobState::Failed {
            Some(format!("HF Space stage: {}", runtime_stage))
        } else {
            None
        };

        Ok(CloudJobStatus {
            state,
            message: error_msg,
            progress_percent: progress,
            model_output_uri: None,
        })
    }

    fn cancel_job(&self, handle: &CloudJobHandle) -> Result<(), String> {
        let url = format!(
            "https://huggingface.co/api/spaces/{}",
            handle.job_id
        );

        let resp = self
            .client()
            .delete(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error cancelando Space en HF: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error cancelando HF: {}", body));
        }

        Ok(())
    }

    fn download_model(
        &self,
        handle: &CloudJobHandle,
        _status: &CloudJobStatus,
        output_dir: &str,
    ) -> Result<String, String> {
        // Try to extract model repo from the job_id / space_id
        // The model repo follows the naming convention from submit
        let model_repo = handle.job_id.clone();

        let url = format!(
            "https://huggingface.co/api/models/{}/resolve/main/best.pt",
            model_repo
        );

        let resp = self
            .client()
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error descargando modelo de HF: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error HF model download: {}", body));
        }

        let output_path = std::path::Path::new(output_dir).join("hf_best.pt");
        let bytes = resp.bytes().map_err(|e| e.to_string())?;
        std::fs::write(&output_path, &bytes)
            .map_err(|e| format!("Error escribiendo modelo: {}", e))?;

        Ok(output_path.to_string_lossy().to_string())
    }
}

/// Valida credenciales de Hugging Face consultando el perfil del usuario
pub fn validate_credentials(token: &str) -> Result<(), String> {
    let client = reqwest::blocking::Client::new();
    let resp = client
        .get("https://huggingface.co/api/whoami-v2")
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .map_err(|e| format!("Error conectando con Hugging Face: {}", e))?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Token de Hugging Face inválido (HTTP {})",
            resp.status()
        ))
    }
}
