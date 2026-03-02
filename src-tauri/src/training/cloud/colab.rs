use super::{CloudJobHandle, CloudJobState, CloudJobStatus, CloudRunner};
use super::gcp_auth;
use super::gcs;
use crate::training::{CloudProvider, CloudTrainingConfig, TrainingRequest};

/// Colab Enterprise runner — usa la API de Vertex AI notebookExecutionJobs
pub struct ColabEnterpriseRunner {
    sa_path: String,
    project_id: String,
    region: String,
    bucket: String,
}

impl ColabEnterpriseRunner {
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

    fn generate_notebook(&self, request: &TrainingRequest, gcs_dataset: &str, project_classes: &[String]) -> serde_json::Value {
        let classes_str = project_classes.iter()
            .map(|c| format!("'{}'", c))
            .collect::<Vec<_>>()
            .join(", ");

        let code = format!(
            r#"!pip install ultralytics -q
!gsutil -m cp -r {gcs_dataset}/* /tmp/dataset/
from ultralytics import YOLO
model = YOLO("{model_id}")
# Classes: [{classes}]
results = model.train(
    data="/tmp/dataset/dataset.yaml",
    epochs={epochs},
    batch={batch_size},
    imgsz={image_size},
    device="0",
    lr0={lr},
    patience={patience},
    workers=2,
)
!gsutil -m cp -r /tmp/results/* {gcs_results}/
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
        );

        serde_json::json!({
            "nbformat": 4,
            "nbformat_minor": 4,
            "metadata": {
                "kernelspec": {
                    "name": "python3",
                    "display_name": "Python 3"
                }
            },
            "cells": [{
                "cell_type": "code",
                "source": code,
                "metadata": {},
                "outputs": [],
                "execution_count": null,
            }]
        })
    }
}

impl CloudRunner for ColabEnterpriseRunner {
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
        let gcs_dataset = gcs::upload_file(
            &token, &self.bucket,
            &format!("{}/dataset.zip", gcs_prefix),
            dataset_path,
        )?;

        // 2. Generate and upload notebook
        let notebook = self.generate_notebook(request, &gcs_dataset, project_classes);
        let notebook_path = format!("/tmp/annotix_colab_{}.ipynb", job_uuid);
        std::fs::write(&notebook_path, serde_json::to_string_pretty(&notebook).unwrap())
            .map_err(|e| format!("Error escribiendo notebook: {}", e))?;

        let gcs_notebook = gcs::upload_file(
            &token, &self.bucket,
            &format!("{}/training.ipynb", gcs_prefix),
            &notebook_path,
        )?;

        let _ = std::fs::remove_file(&notebook_path);

        // 3. Create notebook execution job
        let _machine_type = config.machine_type.as_deref().unwrap_or("n1-standard-4");
        let _accelerator_type = config.accelerator_type.as_deref().unwrap_or("NVIDIA_TESLA_T4");
        let _accelerator_count = config.accelerator_count.unwrap_or(1);

        let execution_spec = serde_json::json!({
            "displayName": format!("annotix-colab-{}", &job_uuid[..8]),
            "executionTimeout": format!("{}s", config.max_runtime_seconds.unwrap_or(21600)),
            "notebookRuntimeTemplateResourceName": format!(
                "projects/{}/locations/{}/notebookRuntimeTemplates/default",
                self.project_id, self.region
            ),
            "gcsNotebookSource": {
                "uri": gcs_notebook,
            },
            "serviceAccount": "",
        });

        let url = format!("{}/notebookExecutionJobs", self.api_base());
        let client = reqwest::blocking::Client::new();
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&execution_spec)
            .send()
            .map_err(|e| format!("Error creando Colab Enterprise job: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Colab Enterprise: {}", body));
        }

        let resp_body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let job_name = resp_body["name"].as_str().unwrap_or("").to_string();

        Ok(CloudJobHandle {
            job_id: job_name.clone(),
            job_url: Some(format!(
                "https://console.cloud.google.com/vertex-ai/colab/executions?project={}",
                self.project_id
            )),
            provider: CloudProvider::ColabEnterprise,
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
            .map_err(|e| format!("Error polling Colab Enterprise: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error polling: {}", body));
        }

        let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let state_str = body["jobState"].as_str().unwrap_or("JOB_STATE_UNSPECIFIED");

        let (state, progress) = match state_str {
            "JOB_STATE_QUEUED" | "JOB_STATE_PENDING" => (CloudJobState::Queued, Some(5.0)),
            "JOB_STATE_RUNNING" => (CloudJobState::Running, Some(50.0)),
            "JOB_STATE_SUCCEEDED" => (CloudJobState::Succeeded, Some(100.0)),
            "JOB_STATE_FAILED" | "JOB_STATE_EXPIRED" => (CloudJobState::Failed, None),
            "JOB_STATE_CANCELLED" | "JOB_STATE_CANCELLING" => (CloudJobState::Cancelled, None),
            _ => (CloudJobState::Running, Some(25.0)),
        };

        Ok(CloudJobStatus {
            state,
            message: body["error"]["message"].as_str().map(|s| s.to_string()),
            progress_percent: progress,
            model_output_uri: body["gcsOutputUri"].as_str().map(|s| s.to_string()),
        })
    }

    fn cancel_job(&self, handle: &CloudJobHandle) -> Result<(), String> {
        let token = self.get_token()?;
        let url = format!(
            "https://{}-aiplatform.googleapis.com/v1/{}:cancel",
            self.region, handle.job_id
        );

        let client = reqwest::blocking::Client::new();
        let _ = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .map_err(|e| format!("Error cancelando: {}", e))?;

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
        let uri = model_uri.strip_prefix("gs://").ok_or("URI inválida")?;
        let (bucket, object) = uri.split_once('/').ok_or("URI inválida")?;

        gcs::download_file(&token, bucket, object, output_dir)
    }
}
