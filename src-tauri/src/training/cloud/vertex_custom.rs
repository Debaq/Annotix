use super::{CloudJobHandle, CloudJobState, CloudJobStatus, CloudRunner};
use super::gcp_auth;
use super::gcs;
use crate::training::{CloudProvider, CloudTrainingConfig, TrainingRequest};

pub struct VertexCustomRunner {
    sa_path: String,
    project_id: String,
    region: String,
    bucket: String,
}

impl VertexCustomRunner {
    pub fn new(sa_path: String, project_id: String, region: String, bucket: String) -> Self {
        Self { sa_path, project_id, region, bucket }
    }

    fn get_token(&self) -> Result<String, String> {
        gcp_auth::get_access_token(&self.sa_path)
    }

    fn api_base(&self) -> String {
        format!(
            "https://{}-aiplatform.googleapis.com/v1/projects/{}/locations/{}",
            self.region, self.project_id, self.region
        )
    }

    fn generate_train_script(&self, request: &TrainingRequest, gcs_dataset: &str, project_classes: &[String]) -> String {
        let classes_str = project_classes.iter()
            .map(|c| format!("'{}'", c))
            .collect::<Vec<_>>()
            .join(", ");

        format!(
            r#"#!/usr/bin/env python3
import subprocess, os
subprocess.run(["pip", "install", "ultralytics"], check=True)
from ultralytics import YOLO

# Download dataset from GCS
subprocess.run(["gsutil", "-m", "cp", "-r", "{gcs_dataset}/*", "/tmp/dataset/"], check=True)

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

# Upload results to GCS
subprocess.run(["gsutil", "-m", "cp", "-r", "/tmp/results/", "{gcs_results}/"], check=True)
"#,
            gcs_dataset = gcs_dataset,
            classes = classes_str,
            model_id = request.model_id,
            epochs = request.epochs,
            batch_size = request.batch_size,
            image_size = request.image_size,
            lr = request.lr,
            patience = request.patience,
            gcs_results = format!("gs://{}/results/{}", self.bucket, uuid::Uuid::new_v4()),
        )
    }
}

impl CloudRunner for VertexCustomRunner {
    fn submit_job(
        &self,
        config: &CloudTrainingConfig,
        request: &TrainingRequest,
        dataset_path: &str,
        project_classes: &[String],
    ) -> Result<CloudJobHandle, String> {
        let token = self.get_token()?;
        let job_uuid = uuid::Uuid::new_v4().to_string();

        // 1. Upload dataset to GCS
        let gcs_prefix = format!("annotix-training/{}/dataset", job_uuid);
        let gcs_dataset = gcs::upload_file(&token, &self.bucket, &format!("{}/dataset.zip", gcs_prefix), dataset_path)?;

        // 2. Generate and upload training script
        let script = self.generate_train_script(request, &gcs_dataset, project_classes);
        let script_path = format!("/tmp/annotix_train_{}.py", job_uuid);
        std::fs::write(&script_path, &script)
            .map_err(|e| format!("Error escribiendo script: {}", e))?;
        let _gcs_script = gcs::upload_file(
            &token, &self.bucket,
            &format!("{}/train.py", gcs_prefix),
            &script_path,
        )?;

        // 3. Create Vertex AI Custom Job
        let machine_type = config.machine_type.as_deref().unwrap_or("n1-standard-4");
        let accelerator_type = config.accelerator_type.as_deref().unwrap_or("NVIDIA_TESLA_T4");
        let accelerator_count = config.accelerator_count.unwrap_or(1);

        let job_spec = serde_json::json!({
            "displayName": format!("annotix-training-{}", &job_uuid[..8]),
            "jobSpec": {
                "workerPoolSpecs": [{
                    "machineSpec": {
                        "machineType": machine_type,
                        "acceleratorType": accelerator_type,
                        "acceleratorCount": accelerator_count,
                    },
                    "replicaCount": 1,
                    "pythonPackageSpec": {
                        "executorImageUri": "us-docker.pkg.dev/vertex-ai/training/pytorch-gpu.2-1:latest",
                        "packageUris": [format!("gs://{}/{}/train.py", self.bucket, gcs_prefix)],
                        "pythonModule": "train",
                    },
                }],
            },
        });

        let url = format!("{}/customJobs", self.api_base());
        let client = reqwest::blocking::Client::new();
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&job_spec)
            .send()
            .map_err(|e| format!("Error creando Vertex AI job: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Vertex AI Custom Job: {}", body));
        }

        let resp_body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let job_name = resp_body["name"].as_str().unwrap_or("").to_string();

        // Cleanup temp script
        let _ = std::fs::remove_file(&script_path);

        Ok(CloudJobHandle {
            job_id: job_name.clone(),
            job_url: Some(format!(
                "https://console.cloud.google.com/vertex-ai/training/custom-jobs?project={}",
                self.project_id
            )),
            provider: CloudProvider::VertexAiCustom,
        })
    }

    fn poll_status(&self, handle: &CloudJobHandle) -> Result<CloudJobStatus, String> {
        let token = self.get_token()?;
        let url = format!(
            "https://{}-aiplatform.googleapis.com/v1/{}",
            self.region, handle.job_id
        );

        let client = reqwest::blocking::Client::new();
        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .map_err(|e| format!("Error polling Vertex AI: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error polling: {}", body));
        }

        let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let state_str = body["state"].as_str().unwrap_or("JOB_STATE_UNSPECIFIED");

        let (state, progress) = match state_str {
            "JOB_STATE_QUEUED" | "JOB_STATE_PENDING" => (CloudJobState::Queued, Some(5.0)),
            "JOB_STATE_RUNNING" => (CloudJobState::Running, Some(50.0)),
            "JOB_STATE_SUCCEEDED" => (CloudJobState::Succeeded, Some(100.0)),
            "JOB_STATE_FAILED" | "JOB_STATE_EXPIRED" => (CloudJobState::Failed, None),
            "JOB_STATE_CANCELLED" | "JOB_STATE_CANCELLING" => (CloudJobState::Cancelled, None),
            _ => (CloudJobState::Running, Some(25.0)),
        };

        let error_msg = body["error"]["message"].as_str().map(|s| s.to_string());

        Ok(CloudJobStatus {
            state,
            message: error_msg,
            progress_percent: progress,
            model_output_uri: None,
        })
    }

    fn cancel_job(&self, handle: &CloudJobHandle) -> Result<(), String> {
        let token = self.get_token()?;
        let url = format!(
            "https://{}-aiplatform.googleapis.com/v1/{}:cancel",
            self.region, handle.job_id
        );

        let client = reqwest::blocking::Client::new();
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .map_err(|e| format!("Error cancelando Vertex AI job: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error cancelando: {}", body));
        }

        Ok(())
    }

    fn download_model(
        &self,
        _handle: &CloudJobHandle,
        status: &CloudJobStatus,
        output_dir: &str,
    ) -> Result<String, String> {
        let model_uri = status.model_output_uri.as_deref()
            .ok_or("No hay URI del modelo en el resultado")?;

        let token = self.get_token()?;

        // Parse gs:// URI
        let uri = model_uri.strip_prefix("gs://").ok_or("URI inválida")?;
        let (bucket, object) = uri.split_once('/').ok_or("URI inválida")?;

        gcs::download_file(&token, bucket, object, output_dir)
    }
}
