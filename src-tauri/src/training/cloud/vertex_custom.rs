use super::gcp_auth;
use super::gcs;
use super::{CloudJobHandle, CloudJobState, CloudJobStatus, CloudRunner};
use crate::training::{CloudProvider, CloudTrainingConfig, TrainingRequest};

pub struct VertexCustomRunner {
    sa_path: String,
    project_id: String,
    region: String,
    bucket: String,
}

impl VertexCustomRunner {
    pub fn new(sa_path: String, project_id: String, region: String, bucket: String) -> Self {
        Self {
            sa_path,
            project_id,
            region,
            bucket,
        }
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

impl CloudRunner for VertexCustomRunner {
    fn submit_job(
        &self,
        config: &CloudTrainingConfig,
        // El paquete ya lleva el backend, el modelo y las clases dentro: la nube no
        // necesita conocer el `TrainingRequest`.
        _request: &TrainingRequest,
        dataset_path: &str,
        _project_classes: &[String],
    ) -> Result<CloudJobHandle, String> {
        let token = self.get_token()?;
        let job_uuid = uuid::Uuid::new_v4().to_string();

        // 1. Subir el paquete de entrenamiento (train.py + dataset + requirements)
        let gcs_prefix = format!("annotix-training/{}", job_uuid);
        let gcs_paquete = gcs::upload_file(
            &token,
            &self.bucket,
            &format!("{}/paquete.zip", gcs_prefix),
            dataset_path,
        )?;

        // 2. Entrypoint genérico: descarga el paquete, lo ejecuta y publica el zip
        //    de resultados en el mismo bucket.
        let gcs_resultados = format!("gs://{}/{}/results.zip", self.bucket, gcs_prefix);
        let script = super::script::entrypoint_python(&super::script::Entrypoint {
            package_location: "/tmp/annotix/paquete.zip",
            workdir: "/tmp/annotix/pkg",
            upload_cmd: Some("gsutil cp {src} {dest}"),
            results_uri: Some(&gcs_resultados),
        });
        let descarga = format!(
            "import subprocess, os\nos.makedirs('/tmp/annotix', exist_ok=True)\n\
             subprocess.check_call(['gsutil', 'cp', '{}', '/tmp/annotix/paquete.zip'])\n",
            gcs_paquete
        );
        let script = format!("{}{}", descarga, script);
        // Rutas temporales del host: `/tmp` no existe en Windows.
        let script_path = std::env::temp_dir().join(format!("annotix_train_{}.py", job_uuid));
        let script_path = script_path.to_string_lossy().to_string();
        std::fs::write(&script_path, &script)
            .map_err(|e| format!("Error escribiendo script: {}", e))?;
        let gcs_script = gcs::upload_file(
            &token,
            &self.bucket,
            &format!("{}/train.py", gcs_prefix),
            &script_path,
        )?;

        // 3. Create Vertex AI Custom Job
        let machine_type = config.machine_type.as_deref().unwrap_or("n1-standard-4");
        let accelerator_type = config
            .accelerator_type
            .as_deref()
            .unwrap_or("NVIDIA_TESLA_T4");
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
                        "packageUris": [gcs_script.clone()],
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
        let model_uri = status
            .model_output_uri
            .as_deref()
            .ok_or("No hay URI del modelo en el resultado")?;

        let token = self.get_token()?;

        // Parse gs:// URI
        let uri = model_uri.strip_prefix("gs://").ok_or("URI inválida")?;
        let (bucket, object) = uri.split_once('/').ok_or("URI inválida")?;

        gcs::download_file(&token, bucket, object, output_dir)
    }

    fn fetch_progress(&self, handle: &CloudJobHandle) -> Result<Vec<serde_json::Value>, String> {
        // Los eventos del entrenamiento llegan a Cloud Logging por stdout del job.
        // Sin esto, Vertex AI no daba progreso en vivo: la UI mostraba sólo el estado
        // grueso del job y el gráfico de métricas se quedaba vacío.
        let token = self.get_token()?;
        super::gcp_auth::fetch_annotix_events(&token, &self.project_id, &handle.job_id)
    }
}
