use super::{CloudJobHandle, CloudJobState, CloudJobStatus, CloudRunner};
use crate::training::{CloudProvider, CloudTrainingConfig, TrainingRequest};

pub struct KaggleRunner {
    username: String,
    api_key: String,
}

impl KaggleRunner {
    pub fn new(username: String, api_key: String) -> Self {
        Self { username, api_key }
    }

    fn client(&self) -> reqwest::blocking::Client {
        reqwest::blocking::Client::new()
    }

    fn auth_header(&self) -> String {
        let credentials = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            format!("{}:{}", self.username, self.api_key),
        );
        format!("Basic {}", credentials)
    }

    fn create_dataset(&self, dataset_path: &str) -> Result<String, String> {
        let dataset_slug = format!("{}/annotix-training-{}", self.username, uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("ds"));

        // Read zip file
        let _data = std::fs::read(dataset_path)
            .map_err(|e| format!("Error leyendo dataset: {}", e))?;

        // Create dataset metadata
        let metadata = serde_json::json!({
            "title": format!("Annotix Training Dataset"),
            "slug": dataset_slug,
            "ownerSlug": self.username,
            "licenseName": "unknown",
            "isPrivate": true,
            "files": [],
        });

        // Create new dataset via API
        let resp = self.client()
            .post("https://www.kaggle.com/api/v1/datasets/create/new")
            .header("Authorization", self.auth_header())
            .json(&metadata)
            .send()
            .map_err(|e| format!("Error creando dataset en Kaggle: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Kaggle dataset create: {}", body));
        }

        // Upload file content as blob
        let form = reqwest::blocking::multipart::Form::new()
            .file("fileName", dataset_path)
            .map_err(|e| format!("Error preparando upload: {}", e))?;

        let upload_resp = self.client()
            .post(format!("https://www.kaggle.com/api/v1/datasets/upload/file/{}", 0))
            .header("Authorization", self.auth_header())
            .multipart(form)
            .send()
            .map_err(|e| format!("Error subiendo archivo a Kaggle: {}", e))?;

        if !upload_resp.status().is_success() {
            let body = upload_resp.text().unwrap_or_default();
            return Err(format!("Error Kaggle file upload: {}", body));
        }

        Ok(dataset_slug)
    }

    fn generate_notebook_source(
        &self,
        request: &TrainingRequest,
        dataset_slug: &str,
        project_classes: &[String],
    ) -> String {
        let classes_str = project_classes.iter()
            .map(|c| format!("'{}'", c))
            .collect::<Vec<_>>()
            .join(", ");

        format!(
            r#"# Annotix Cloud Training Notebook
import subprocess
subprocess.run(["pip", "install", "ultralytics"], check=True)

from ultralytics import YOLO
import os

# Dataset path (mounted from Kaggle dataset)
DATASET_DIR = f"/kaggle/input/{dataset_slug_name}"

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
)
model.export(format="onnx")
"#,
            dataset_slug_name = dataset_slug.rsplit('/').next().unwrap_or(dataset_slug),
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

impl CloudRunner for KaggleRunner {
    fn submit_job(
        &self,
        config: &CloudTrainingConfig,
        request: &TrainingRequest,
        dataset_path: &str,
        project_classes: &[String],
    ) -> Result<CloudJobHandle, String> {
        // 1. Upload dataset
        let dataset_slug = self.create_dataset(dataset_path)?;

        // 2. Generate notebook
        let notebook_source = self.generate_notebook_source(request, &dataset_slug, project_classes);
        let kernel_slug = format!("{}/annotix-train-{}", self.username, uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("k"));

        let accelerator = config.kaggle_accelerator.as_deref().unwrap_or("gpu");

        let kernel_push = serde_json::json!({
            "id": kernel_slug,
            "title": "Annotix Training",
            "code_file_type": "script",
            "language": "python",
            "kernel_type": "script",
            "is_private": true,
            "enable_gpu": accelerator != "none",
            "enable_tpu": accelerator == "tpu",
            "enable_internet": true,
            "dataset_sources": [dataset_slug],
            "competition_sources": [],
            "kernel_sources": [],
            "text": notebook_source,
        });

        let resp = self.client()
            .post("https://www.kaggle.com/api/v1/kernels/push")
            .header("Authorization", self.auth_header())
            .json(&kernel_push)
            .send()
            .map_err(|e| format!("Error creando kernel en Kaggle: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Kaggle kernel push: {}", body));
        }

        let resp_body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let _version_number = resp_body["versionNumber"].as_i64().unwrap_or(1);

        Ok(CloudJobHandle {
            job_id: kernel_slug.clone(),
            job_url: Some(format!("https://www.kaggle.com/code/{}", kernel_slug)),
            provider: CloudProvider::Kaggle,
        })
    }

    fn poll_status(&self, handle: &CloudJobHandle) -> Result<CloudJobStatus, String> {
        let url = format!(
            "https://www.kaggle.com/api/v1/kernels/status?userName={}&kernelSlug={}",
            self.username,
            handle.job_id.rsplit('/').next().unwrap_or(&handle.job_id),
        );

        let resp = self.client()
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error polling Kaggle: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Kaggle status: {}", body));
        }

        let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let status = body["status"].as_str().unwrap_or("unknown");

        let (state, progress) = match status {
            "queued" => (CloudJobState::Queued, Some(0.0)),
            "running" => (CloudJobState::Running, Some(50.0)),
            "complete" => (CloudJobState::Succeeded, Some(100.0)),
            "error" => (CloudJobState::Failed, None),
            "cancelAcknowledged" => (CloudJobState::Cancelled, None),
            _ => (CloudJobState::Running, Some(25.0)),
        };

        Ok(CloudJobStatus {
            state,
            message: body["failureMessage"].as_str().map(|s| s.to_string()),
            progress_percent: progress,
            model_output_uri: None,
        })
    }

    fn cancel_job(&self, handle: &CloudJobHandle) -> Result<(), String> {
        // Kaggle API doesn't have a direct cancel endpoint for kernels
        // The kernel will eventually time out
        log::warn!("Kaggle no soporta cancelación directa de kernels: {}", handle.job_id);
        Ok(())
    }

    fn download_model(
        &self,
        handle: &CloudJobHandle,
        _status: &CloudJobStatus,
        output_dir: &str,
    ) -> Result<String, String> {
        let url = format!(
            "https://www.kaggle.com/api/v1/kernels/output?userName={}&kernelSlug={}",
            self.username,
            handle.job_id.rsplit('/').next().unwrap_or(&handle.job_id),
        );

        let resp = self.client()
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error descargando output de Kaggle: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Kaggle output download: {}", body));
        }

        let output_path = std::path::Path::new(output_dir).join("kaggle_output.zip");
        let bytes = resp.bytes().map_err(|e| e.to_string())?;
        std::fs::write(&output_path, &bytes)
            .map_err(|e| format!("Error escribiendo modelo: {}", e))?;

        Ok(output_path.to_string_lossy().to_string())
    }
}

/// Valida credenciales de Kaggle intentando listar datasets
pub fn validate_credentials(username: &str, api_key: &str) -> Result<(), String> {
    let credentials = base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        format!("{}:{}", username, api_key),
    );

    let client = reqwest::blocking::Client::new();
    let resp = client
        .get("https://www.kaggle.com/api/v1/datasets/list?page=1&pageSize=1")
        .header("Authorization", format!("Basic {}", credentials))
        .send()
        .map_err(|e| format!("Error conectando con Kaggle: {}", e))?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Credenciales de Kaggle inválidas (HTTP {})", resp.status()))
    }
}
