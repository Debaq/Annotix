pub mod gcp_auth;
pub mod gcs;
pub mod colab;
pub mod vertex_custom;
pub mod vertex_tuning;
pub mod kaggle;
pub mod lightning;
pub mod huggingface;
pub mod saturn;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use crate::store::AppState;
use crate::store::io;
use crate::training::{CloudProvider, CloudTrainingConfig, TrainingRequest};

// ─── Cloud Job Status ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CloudJobState {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudJobStatus {
    pub state: CloudJobState,
    pub message: Option<String>,
    #[serde(rename = "progressPercent")]
    pub progress_percent: Option<f64>,
    #[serde(rename = "modelOutputUri")]
    pub model_output_uri: Option<String>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CloudJobHandle {
    pub job_id: String,
    pub job_url: Option<String>,
    pub provider: CloudProvider,
}

// ─── Cloud Runner Trait ──────────────────────────────────────────────────────

pub trait CloudRunner: Send + Sync {
    fn submit_job(
        &self,
        config: &CloudTrainingConfig,
        request: &TrainingRequest,
        dataset_path: &str,
        project_classes: &[String],
    ) -> Result<CloudJobHandle, String>;

    fn poll_status(&self, handle: &CloudJobHandle) -> Result<CloudJobStatus, String>;

    fn cancel_job(&self, handle: &CloudJobHandle) -> Result<(), String>;

    fn download_model(
        &self,
        handle: &CloudJobHandle,
        status: &CloudJobStatus,
        output_dir: &str,
    ) -> Result<String, String>;

    /// Devuelve eventos de progreso (`ANNOTIX_EVENT:` JSON) parseados desde los logs del job.
    /// Default: vacío (provider sin soporte de progreso en vivo).
    fn fetch_progress(&self, _handle: &CloudJobHandle) -> Result<Vec<serde_json::Value>, String> {
        Ok(Vec::new())
    }
}

// ─── Active Cloud Job ────────────────────────────────────────────────────────

#[allow(dead_code)]
struct ActiveCloudJob {
    project_dir: PathBuf,
    training_job_id: String,
    cancelled: bool,
}

// ─── Cloud Training Manager ─────────────────────────────────────────────────

pub struct CloudTrainingManager {
    active_jobs: Arc<Mutex<HashMap<String, ActiveCloudJob>>>,
}

impl CloudTrainingManager {
    pub fn new() -> Self {
        Self {
            active_jobs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn start_cloud_training(
        &self,
        app: &AppHandle,
        state: &AppState,
        project_id: &str,
        training_job_id: &str,
        request: &TrainingRequest,
        cloud_config: &CloudTrainingConfig,
        dataset_path: &str,
        project_classes: &[String],
    ) -> Result<String, String> {
        let runner = self.get_runner(&cloud_config.provider, state)?;
        // reqwest::blocking no puede correr dentro del runtime tokio del comando Tauri.
        // Aislamos la llamada en un thread propio.
        let handle = std::thread::scope(|s| {
            s.spawn(|| runner.submit_job(cloud_config, request, dataset_path, project_classes))
                .join()
                .map_err(|_| "panic en submit_job".to_string())?
        })?;

        let cloud_job_id = handle.job_id.clone();
        let provider_str = provider_to_string(&cloud_config.provider);
        let job_url = handle.job_url.clone();
        let tjid = training_job_id.to_string();
        let project_dir = state.project_dir(project_id)?;

        // Update training job entry with cloud info
        state.with_project_mut(project_id, |pf| {
            if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == tjid) {
                job.status = "running".to_string();
                job.cloud_provider = Some(provider_str.clone());
                job.cloud_job_id = Some(cloud_job_id.clone());
                job.cloud_job_url = job_url.clone();
            }
        })?;

        // Emit initial status
        let _ = app.emit("training:cloud:status", serde_json::json!({
            "jobId": training_job_id,
            "provider": provider_str,
            "cloudJobId": cloud_job_id,
            "cloudJobUrl": job_url,
            "state": "queued",
        }));

        // Register active job
        {
            let mut jobs = self.active_jobs.lock().map_err(|e| e.to_string())?;
            jobs.insert(training_job_id.to_string(), ActiveCloudJob {
                project_dir: project_dir.clone(),
                training_job_id: training_job_id.to_string(),
                cancelled: false,
            });
        }

        // Start polling in background
        self.spawn_poller(
            app.clone(),
            project_dir,
            training_job_id.to_string(),
            runner,
            handle,
        );

        Ok(cloud_job_id)
    }

    #[allow(dead_code)]
    pub fn cancel_cloud_training(&self, training_job_id: &str) -> Result<(), String> {
        let mut jobs = self.active_jobs.lock().map_err(|e| e.to_string())?;
        if let Some(job) = jobs.get_mut(training_job_id) {
            job.cancelled = true;
        }
        Ok(())
    }

    #[allow(dead_code)]
    pub fn is_cloud_job(&self, training_job_id: &str) -> bool {
        let jobs = self.active_jobs.lock().ok();
        jobs.map(|j| j.contains_key(training_job_id)).unwrap_or(false)
    }

    fn get_runner(
        &self,
        provider: &CloudProvider,
        state: &AppState,
    ) -> Result<Box<dyn CloudRunner>, String> {
        let config = state.get_app_config()?;

        match provider {
            CloudProvider::Kaggle => {
                let kaggle_cfg = config.cloud_providers.kaggle
                    .ok_or("Kaggle no configurado. Ve a Settings > Cloud Providers")?;
                let username = kaggle_cfg.username
                    .ok_or("Falta username de Kaggle")?;
                let api_key = kaggle_cfg.api_key
                    .ok_or("Falta API key de Kaggle")?;
                Ok(Box::new(kaggle::KaggleRunner::new(username, api_key)))
            }
            CloudProvider::VertexAiCustom => {
                let gcp_cfg = config.cloud_providers.gcp
                    .ok_or("GCP no configurado. Ve a Settings > Cloud Providers")?;
                let sa_path = gcp_cfg.service_account_path
                    .ok_or("Falta Service Account JSON path")?;
                let project_id = gcp_cfg.project_id
                    .ok_or("Falta GCP Project ID")?;
                let region = gcp_cfg.region
                    .unwrap_or_else(|| "us-central1".to_string());
                let bucket = gcp_cfg.gcs_bucket
                    .ok_or("Falta GCS Bucket")?;
                Ok(Box::new(vertex_custom::VertexCustomRunner::new(
                    sa_path, project_id, region, bucket,
                )))
            }
            CloudProvider::ColabEnterprise => {
                let gcp_cfg = config.cloud_providers.gcp
                    .ok_or("GCP no configurado. Ve a Settings > Cloud Providers")?;
                let sa_path = gcp_cfg.service_account_path
                    .ok_or("Falta Service Account JSON path")?;
                let project_id = gcp_cfg.project_id
                    .ok_or("Falta GCP Project ID")?;
                let region = gcp_cfg.region
                    .unwrap_or_else(|| "us-central1".to_string());
                let bucket = gcp_cfg.gcs_bucket
                    .ok_or("Falta GCS Bucket")?;
                Ok(Box::new(colab::ColabEnterpriseRunner::new(
                    sa_path, project_id, region, bucket,
                )))
            }
            CloudProvider::VertexAiGeminiTuning => {
                let gcp_cfg = config.cloud_providers.gcp
                    .ok_or("GCP no configurado. Ve a Settings > Cloud Providers")?;
                let sa_path = gcp_cfg.service_account_path
                    .ok_or("Falta Service Account JSON path")?;
                let project_id = gcp_cfg.project_id
                    .ok_or("Falta GCP Project ID")?;
                let region = gcp_cfg.region
                    .unwrap_or_else(|| "us-central1".to_string());
                let bucket = gcp_cfg.gcs_bucket
                    .ok_or("Falta GCS Bucket")?;
                Ok(Box::new(vertex_tuning::VertexTuningRunner::new(
                    sa_path, project_id, region, bucket,
                )))
            }
            CloudProvider::LightningAi => {
                let lai_cfg = config.cloud_providers.lightning_ai
                    .ok_or("Lightning AI no configurado. Ve a Settings > Cloud Providers")?;
                let api_key = lai_cfg.api_key
                    .ok_or("Falta API key de Lightning AI")?;
                Ok(Box::new(lightning::LightningRunner::new(api_key)))
            }
            CloudProvider::HuggingFace => {
                let hf_cfg = config.cloud_providers.huggingface
                    .ok_or("Hugging Face no configurado. Ve a Settings > Cloud Providers")?;
                let token = hf_cfg.token
                    .ok_or("Falta token de Hugging Face")?;
                let username = hf_cfg.username
                    .ok_or("Falta username de Hugging Face")?;
                Ok(Box::new(huggingface::HuggingFaceRunner::new(token, username)))
            }
            CloudProvider::SaturnCloud => {
                let sc_cfg = config.cloud_providers.saturn_cloud
                    .ok_or("Saturn Cloud no configurado. Ve a Settings > Cloud Providers")?;
                let api_token = sc_cfg.api_token
                    .ok_or("Falta API token de Saturn Cloud")?;
                Ok(Box::new(saturn::SaturnCloudRunner::new(api_token)))
            }
        }
    }

    fn spawn_poller(
        &self,
        app: AppHandle,
        project_dir: PathBuf,
        training_job_id: String,
        runner: Box<dyn CloudRunner>,
        handle: CloudJobHandle,
    ) {
        let active_jobs = self.active_jobs.clone();

        std::thread::spawn(move || {
            let poll_interval = std::time::Duration::from_secs(30);
            let mut seen_epochs: std::collections::HashSet<u64> = std::collections::HashSet::new();
            let mut last_metrics_history: Vec<serde_json::Value> = Vec::new();

            loop {
                std::thread::sleep(poll_interval);

                // Check if cancelled
                {
                    let jobs = active_jobs.lock().ok();
                    if let Some(jobs) = jobs {
                        if let Some(active) = jobs.get(&training_job_id) {
                            if active.cancelled {
                                let _ = runner.cancel_job(&handle);
                                update_job_status(&project_dir, &training_job_id, "cancelled");
                                let _ = app.emit("training:cancelled", serde_json::json!({
                                    "jobId": training_job_id,
                                }));
                                break;
                            }
                        } else {
                            break;
                        }
                    }
                }

                // Fetch progress events (ANNOTIX_EVENT del log)
                if let Ok(events) = runner.fetch_progress(&handle) {
                    for ev in events {
                        let ev_type = ev["type"].as_str().unwrap_or("");
                        if ev_type == "epoch" {
                            let epoch = ev["epoch"].as_u64().unwrap_or(0);
                            if epoch == 0 || !seen_epochs.insert(epoch) { continue; }
                            let total_epochs = ev["totalEpochs"].as_u64().unwrap_or(0);
                            let progress = ev["progress"].as_f64().unwrap_or(0.0);
                            let metrics = ev["metrics"].clone();

                            let _ = app.emit("training:progress", serde_json::json!({
                                "jobId": training_job_id,
                                "epoch": epoch,
                                "totalEpochs": total_epochs,
                                "progress": progress,
                                "metrics": metrics,
                                "phase": "training",
                            }));

                            let entry = serde_json::json!({
                                "epoch": epoch,
                                "metrics": metrics,
                                "ts": 0.0,
                            });
                            if let Some(pos) = last_metrics_history.iter().position(|e| e["epoch"].as_u64() == Some(epoch)) {
                                last_metrics_history[pos] = entry;
                            } else {
                                last_metrics_history.push(entry);
                            }

                            let history_clone = last_metrics_history.clone();
                            if let Ok(mut pf) = io::read_project(&project_dir) {
                                if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == training_job_id) {
                                    job.progress = progress;
                                    job.metrics_history = history_clone;
                                }
                                let _ = io::write_project(&project_dir, &pf);
                            }
                        } else if ev_type == "log" {
                            if let Some(msg) = ev["message"].as_str() {
                                let _ = app.emit("training:log", serde_json::json!({
                                    "jobId": training_job_id,
                                    "message": msg,
                                }));
                            }
                        }
                    }
                }

                // Poll status real
                match runner.poll_status(&handle) {
                    Ok(status) => {
                        let state_str = match &status.state {
                            CloudJobState::Queued => "queued",
                            CloudJobState::Running => "running",
                            CloudJobState::Succeeded => "succeeded",
                            CloudJobState::Failed => "failed",
                            CloudJobState::Cancelled => "cancelled",
                        };

                        let _ = app.emit("training:cloud:status", serde_json::json!({
                            "jobId": training_job_id,
                            "state": state_str,
                            "message": status.message,
                            "progressPercent": status.progress_percent,
                        }));

                        // Update progress in project file
                        let progress = status.progress_percent.unwrap_or(0.0);
                        update_job_progress(&project_dir, &training_job_id, state_str, progress);

                        let _ = app.emit("training:progress", serde_json::json!({
                            "jobId": training_job_id,
                            "epoch": 0,
                            "totalEpochs": 0,
                            "progress": progress,
                            "metrics": null,
                            "phase": state_str,
                        }));

                        match status.state {
                            CloudJobState::Succeeded => {
                                if let Ok(model_path) = runner.download_model(&handle, &status, "/tmp") {
                                    update_job_model(&project_dir, &training_job_id, &model_path, status.model_output_uri.as_deref());
                                }

                                let _ = app.emit("training:completed", serde_json::json!({
                                    "jobId": training_job_id,
                                    "result": {
                                        "bestModelPath": null,
                                        "lastModelPath": null,
                                        "resultsDir": null,
                                        "finalMetrics": null,
                                        "exportedModels": [],
                                    },
                                }));
                                break;
                            }
                            CloudJobState::Failed => {
                                let _ = app.emit("training:error", serde_json::json!({
                                    "jobId": training_job_id,
                                    "error": status.message.unwrap_or_else(|| "Cloud job failed".to_string()),
                                }));
                                break;
                            }
                            CloudJobState::Cancelled => {
                                let _ = app.emit("training:cancelled", serde_json::json!({
                                    "jobId": training_job_id,
                                }));
                                break;
                            }
                            _ => {}
                        }
                    }
                    Err(e) => {
                        log::error!("Error polling cloud job {}: {}", training_job_id, e);
                    }
                }
            }

            // Cleanup
            if let Ok(mut jobs) = active_jobs.lock() {
                jobs.remove(&training_job_id);
            }
        });
    }
}

// ─── Helpers para actualizar project.json desde threads ──────────────────────

fn update_job_status(project_dir: &PathBuf, job_id: &str, status: &str) {
    if let Ok(mut pf) = io::read_project(project_dir) {
        if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id) {
            job.status = status.to_string();
        }
        let _ = io::write_project(project_dir, &pf);
    }
}

fn update_job_progress(project_dir: &PathBuf, job_id: &str, status: &str, progress: f64) {
    if let Ok(mut pf) = io::read_project(project_dir) {
        if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id) {
            job.status = status.to_string();
            job.progress = progress;
        }
        let _ = io::write_project(project_dir, &pf);
    }
}

fn update_job_model(project_dir: &PathBuf, job_id: &str, model_path: &str, download_url: Option<&str>) {
    if let Ok(mut pf) = io::read_project(project_dir) {
        if let Some(job) = pf.training_jobs.iter_mut().find(|j| j.id == job_id) {
            job.best_model_path = Some(model_path.to_string());
            job.model_download_url = download_url.map(|s| s.to_string());
            job.status = "completed".to_string();
            job.progress = 100.0;
        }
        let _ = io::write_project(project_dir, &pf);
    }
}

fn provider_to_string(provider: &CloudProvider) -> String {
    match provider {
        CloudProvider::ColabEnterprise => "colab_enterprise".to_string(),
        CloudProvider::VertexAiCustom => "vertex_ai_custom".to_string(),
        CloudProvider::VertexAiGeminiTuning => "vertex_ai_gemini_tuning".to_string(),
        CloudProvider::Kaggle => "kaggle".to_string(),
        CloudProvider::LightningAi => "lightning_ai".to_string(),
        CloudProvider::HuggingFace => "hugging_face".to_string(),
        CloudProvider::SaturnCloud => "saturn_cloud".to_string(),
    }
}
