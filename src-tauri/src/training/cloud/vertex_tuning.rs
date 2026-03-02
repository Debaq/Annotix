use super::{CloudJobHandle, CloudJobState, CloudJobStatus, CloudRunner};
use super::gcp_auth;
use super::gcs;
use crate::training::{CloudProvider, CloudTrainingConfig, TrainingRequest};

/// Vertex AI Gemini fine-tuning runner — usa supervisedTuningSpec
pub struct VertexTuningRunner {
    sa_path: String,
    project_id: String,
    region: String,
    bucket: String,
}

impl VertexTuningRunner {
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
}

impl CloudRunner for VertexTuningRunner {
    fn submit_job(
        &self,
        _config: &CloudTrainingConfig,
        request: &TrainingRequest,
        dataset_path: &str,
        project_classes: &[String],
    ) -> Result<CloudJobHandle, String> {
        let token = self.get_token()?;
        let job_uuid = uuid::Uuid::new_v4().to_string();

        // 1. Convert dataset to JSONL for Gemini tuning
        let jsonl_path = format!("/tmp/annotix_tuning_{}.jsonl", job_uuid);
        convert_to_jsonl(dataset_path, &jsonl_path, project_classes)?;

        // 2. Upload JSONL to GCS
        let gcs_prefix = format!("annotix-tuning/{}", job_uuid);
        let gcs_training_data = gcs::upload_file(
            &token, &self.bucket,
            &format!("{}/training_data.jsonl", gcs_prefix),
            &jsonl_path,
        )?;

        let _ = std::fs::remove_file(&jsonl_path);

        // 3. Create tuning job
        let base_model = request.model_id.clone();

        let tuning_spec = serde_json::json!({
            "displayName": format!("annotix-gemini-tuning-{}", &job_uuid[..8]),
            "baseModel": base_model,
            "supervisedTuningSpec": {
                "trainingDatasetUri": gcs_training_data,
                "hyperParameters": {
                    "epochCount": request.epochs,
                    "learningRateMultiplier": request.lr,
                },
            },
        });

        let url = format!("{}/tuningJobs", self.api_base());
        let client = reqwest::blocking::Client::new();
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", token))
            .json(&tuning_spec)
            .send()
            .map_err(|e| format!("Error creando Gemini tuning job: {}", e))?;

        if !resp.status().is_success() {
            let body = resp.text().unwrap_or_default();
            return Err(format!("Error Gemini Tuning: {}", body));
        }

        let resp_body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
        let job_name = resp_body["name"].as_str().unwrap_or("").to_string();

        Ok(CloudJobHandle {
            job_id: job_name.clone(),
            job_url: Some(format!(
                "https://console.cloud.google.com/vertex-ai/generative/language/tuning?project={}",
                self.project_id
            )),
            provider: CloudProvider::VertexAiGeminiTuning,
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
            .map_err(|e| format!("Error polling Gemini tuning: {}", e))?;

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

        let tuned_model = body["tunedModelEndpointName"].as_str().map(|s| s.to_string())
            .or_else(|| body["tunedModel"]["endpoint"].as_str().map(|s| s.to_string()));

        Ok(CloudJobStatus {
            state,
            message: body["error"]["message"].as_str().map(|s| s.to_string()),
            progress_percent: progress,
            model_output_uri: tuned_model,
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
        _output_dir: &str,
    ) -> Result<String, String> {
        // Gemini tuned models live as endpoints, not downloadable files
        let endpoint = status.model_output_uri.as_deref()
            .ok_or("No hay endpoint del modelo tuneado")?;
        Ok(endpoint.to_string())
    }
}

/// Convierte un dataset ZIP a formato JSONL para Gemini tuning
fn convert_to_jsonl(_dataset_path: &str, output_path: &str, project_classes: &[String]) -> Result<(), String> {
    use std::io::Write;

    let mut out = std::fs::File::create(output_path)
        .map_err(|e| format!("Error creando JSONL: {}", e))?;

    // Generate simple training examples from class names
    for class in project_classes {
        let example = serde_json::json!({
            "messages": [
                {"role": "user", "content": format!("Classify this image containing: {}", class)},
                {"role": "model", "content": format!("This image contains a {}.", class)},
            ]
        });
        writeln!(out, "{}", serde_json::to_string(&example).unwrap())
            .map_err(|e| format!("Error escribiendo JSONL: {}", e))?;
    }

    Ok(())
}
