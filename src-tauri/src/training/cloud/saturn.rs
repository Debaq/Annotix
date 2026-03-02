use super::{CloudJobHandle, CloudJobState, CloudJobStatus, CloudRunner};
use crate::training::{CloudProvider, CloudTrainingConfig, TrainingRequest};

pub struct SaturnCloudRunner {
    api_token: String,
}

impl SaturnCloudRunner {
    pub fn new(api_token: String) -> Self {
        Self { api_token }
    }

    fn client(&self) -> reqwest::blocking::Client {
        reqwest::blocking::Client::new()
    }

    fn auth_header(&self) -> String {
        format!("token {}", self.api_token)
    }

    fn api_base(&self) -> String {
        "https://app.community.saturnenterprise.io/api".to_string()
    }

    fn resolve_instance_type(config: &CloudTrainingConfig) -> String {
        config
            .machine_type
            .as_deref()
            .unwrap_or("T4-4XLarge")
            .to_string()
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

DATASET_DIR = "/tmp/dataset"

# Unzip dataset
subprocess.run(["unzip", "-o", "/tmp/dataset.zip", "-d", DATASET_DIR], check=True)

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
    project="/tmp/results",
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
}

impl CloudRunner for SaturnCloudRunner {
    fn submit_job(
        &self,
        config: &CloudTrainingConfig,
        request: &TrainingRequest,
        dataset_path: &str,
        project_classes: &[String],
    ) -> Result<CloudJobHandle, String> {
        let job_uuid = uuid::Uuid::new_v4().to_string();
        let short_id = job_uuid.split('-').next().unwrap_or("job");
        let server_name = format!("annotix-train-{}", short_id);
        let instance_type = Self::resolve_instance_type(config);

        let auto_shutoff = config
            .max_runtime_seconds
            .map(|s| format!("{} hours", s / 3600))
            .unwrap_or_else(|| "6 hours".to_string());

        // 1. Create Jupyter server with GPU
        let create_body = serde_json::json!({
            "name": server_name,
            "instance_type": instance_type,
            "image_uri": "saturncloud/saturn-python:latest",
            "auto_shutoff": auto_shutoff,
        });

        let resp = self
            .client()
            .post(format!("{}/jupyter_servers", self.api_base()))
            .header("Authorization", self.auth_header())
            .json(&create_body)
            .send()
            .map_err(|e| format!("Error creando server en Saturn Cloud: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Saturn Cloud server create: {}", body));
        }

        let resp_body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let server_id = resp_body["id"]
            .as_str()
            .unwrap_or(&job_uuid)
            .to_string();

        // 2. Start the server
        let start_resp = self
            .client()
            .post(format!(
                "{}/jupyter_servers/{}/start",
                self.api_base(),
                server_id
            ))
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error iniciando server en Saturn Cloud: {}", e))?;

        if !start_resp.status().is_success() {
            let body = start_resp.text().unwrap_or_default();
            return Err(format!("Error Saturn Cloud server start: {}", body));
        }

        // 3. Upload dataset
        let dataset_data = std::fs::read(dataset_path)
            .map_err(|e| format!("Error leyendo dataset: {}", e))?;

        let form = reqwest::blocking::multipart::Form::new().part(
            "file",
            reqwest::blocking::multipart::Part::bytes(dataset_data)
                .file_name("dataset.zip")
                .mime_str("application/zip")
                .map_err(|e| format!("Error preparando upload: {}", e))?,
        );

        let upload_resp = self
            .client()
            .post(format!(
                "{}/jupyter_servers/{}/files/tmp/dataset.zip",
                self.api_base(),
                server_id
            ))
            .header("Authorization", self.auth_header())
            .multipart(form)
            .send()
            .map_err(|e| format!("Error subiendo dataset a Saturn Cloud: {}", e))?;

        if !upload_resp.status().is_success() {
            let body = upload_resp.text().unwrap_or_default();
            return Err(format!("Error Saturn Cloud dataset upload: {}", body));
        }

        // 4. Upload training script
        let script = self.generate_train_script(request, project_classes);
        let script_form = reqwest::blocking::multipart::Form::new().part(
            "file",
            reqwest::blocking::multipart::Part::bytes(script.into_bytes())
                .file_name("train.py")
                .mime_str("text/x-python")
                .map_err(|e| format!("Error preparando script: {}", e))?,
        );

        let script_resp = self
            .client()
            .post(format!(
                "{}/jupyter_servers/{}/files/tmp/train.py",
                self.api_base(),
                server_id
            ))
            .header("Authorization", self.auth_header())
            .multipart(script_form)
            .send()
            .map_err(|e| format!("Error subiendo script a Saturn Cloud: {}", e))?;

        if !script_resp.status().is_success() {
            let body = script_resp.text().unwrap_or_default();
            return Err(format!("Error Saturn Cloud script upload: {}", body));
        }

        // 5. Execute training command via the Jupyter server
        let cmd_body = serde_json::json!({
            "command": "cd /tmp && python train.py",
        });

        let cmd_resp = self
            .client()
            .post(format!(
                "{}/jupyter_servers/{}/execute",
                self.api_base(),
                server_id
            ))
            .header("Authorization", self.auth_header())
            .json(&cmd_body)
            .send()
            .map_err(|e| format!("Error ejecutando training en Saturn Cloud: {}", e))?;

        if !cmd_resp.status().is_success() {
            let body = cmd_resp.text().unwrap_or_default();
            return Err(format!("Error Saturn Cloud command exec: {}", body));
        }

        Ok(CloudJobHandle {
            job_id: server_id.clone(),
            job_url: Some(format!(
                "https://app.community.saturnenterprise.io/dash/resources/jupyter_server/{}",
                server_id
            )),
            provider: CloudProvider::SaturnCloud,
        })
    }

    fn poll_status(&self, handle: &CloudJobHandle) -> Result<CloudJobStatus, String> {
        let url = format!(
            "{}/jupyter_servers/{}",
            self.api_base(),
            handle.job_id
        );

        let resp = self
            .client()
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error polling Saturn Cloud: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Saturn Cloud status: {}", body));
        }

        let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let status = body["status"].as_str().unwrap_or("unknown");

        let (state, progress) = match status {
            "pending" => (CloudJobState::Queued, Some(5.0)),
            "starting" => (CloudJobState::Queued, Some(10.0)),
            "running" => (CloudJobState::Running, Some(50.0)),
            "stopping" => (CloudJobState::Running, Some(90.0)),
            "stopped" => (CloudJobState::Succeeded, Some(100.0)),
            "error" => (CloudJobState::Failed, None),
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
        let url = format!(
            "{}/jupyter_servers/{}/stop",
            self.api_base(),
            handle.job_id
        );

        let resp = self
            .client()
            .post(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error deteniendo server en Saturn Cloud: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error cancelando Saturn Cloud: {}", body));
        }

        Ok(())
    }

    fn download_model(
        &self,
        handle: &CloudJobHandle,
        _status: &CloudJobStatus,
        output_dir: &str,
    ) -> Result<String, String> {
        let url = format!(
            "{}/jupyter_servers/{}/files/tmp/results/train/weights/best.pt",
            self.api_base(),
            handle.job_id
        );

        let resp = self
            .client()
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error descargando modelo de Saturn Cloud: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Saturn Cloud model download: {}", body));
        }

        let output_path = std::path::Path::new(output_dir).join("saturn_best.pt");
        let bytes = resp.bytes().map_err(|e| e.to_string())?;
        std::fs::write(&output_path, &bytes)
            .map_err(|e| format!("Error escribiendo modelo: {}", e))?;

        Ok(output_path.to_string_lossy().to_string())
    }
}

/// Valida credenciales de Saturn Cloud consultando info de la cuenta
pub fn validate_credentials(api_token: &str) -> Result<(), String> {
    let client = reqwest::blocking::Client::new();
    let resp = client
        .get("https://app.community.saturnenterprise.io/api/info")
        .header("Authorization", format!("token {}", api_token))
        .send()
        .map_err(|e| format!("Error conectando con Saturn Cloud: {}", e))?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "Credenciales de Saturn Cloud inválidas (HTTP {})",
            resp.status()
        ))
    }
}
