use super::gcp_auth;
use super::gcs;
use super::{CloudJobHandle, CloudJobState, CloudJobStatus, CloudRunner};
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

    /// Notebook de una celda: el entrypoint genérico que ejecuta el paquete.
    ///
    /// Antes esto incrustaba `YOLO(...)` con los hiperparámetros interpolados, hacía
    /// `gsutil cp -r <uri-del-zip>/*` —una glob sobre un archivo, que no copia
    /// nada— y nunca descomprimía: buscaba un `dataset.yaml` que el paquete no
    /// genera.
    fn generate_notebook(&self, gcs_paquete: &str, gcs_resultados: &str) -> serde_json::Value {
        let descarga = format!(
            "import os, subprocess\nos.makedirs('/content/annotix', exist_ok=True)\n\
             subprocess.check_call(['gsutil', 'cp', '{}', '/content/annotix/paquete.zip'])\n",
            gcs_paquete
        );
        let code = format!(
            "{}{}",
            descarga,
            super::script::entrypoint_python(&super::script::Entrypoint {
                package_location: "/content/annotix/paquete.zip",
                workdir: "/content/annotix/pkg",
                upload_cmd: Some("gsutil cp {src} {dest}"),
                results_uri: Some(gcs_resultados),
            })
        );

        serde_json::json!({
            "nbformat": 4,
            "nbformat_minor": 4,
            "metadata": {
                "kernelspec": {"name": "python3", "display_name": "Python 3"}
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
        // El paquete de entrenamiento ya lleva dentro el backend, el modelo y las
        // clases: la nube sólo lo ejecuta (ver cloud::script).
        _request: &TrainingRequest,
        dataset_path: &str,
        _project_classes: &[String],
    ) -> Result<CloudJobHandle, String> {
        let token = self.get_token()?;
        let job_uuid = uuid::Uuid::new_v4().to_string();

        // 1. Subir el paquete de entrenamiento completo
        let gcs_prefix = format!("annotix-training/{}", job_uuid);
        let gcs_paquete = gcs::upload_file(
            &token,
            &self.bucket,
            &format!("{}/paquete.zip", gcs_prefix),
            dataset_path,
        )?;
        let gcs_resultados = format!("gs://{}/{}/results.zip", self.bucket, gcs_prefix);

        // 2. Generate and upload notebook
        let notebook = self.generate_notebook(&gcs_paquete, &gcs_resultados);
        let notebook_path = std::env::temp_dir()
            .join(format!("annotix_colab_{}.ipynb", job_uuid))
            .to_string_lossy()
            .to_string();
        std::fs::write(
            &notebook_path,
            serde_json::to_string_pretty(&notebook).unwrap(),
        )
        .map_err(|e| format!("Error escribiendo notebook: {}", e))?;

        let gcs_notebook = gcs::upload_file(
            &token,
            &self.bucket,
            &format!("{}/training.ipynb", gcs_prefix),
            &notebook_path,
        )?;

        let _ = std::fs::remove_file(&notebook_path);

        // 3. Create notebook execution job.
        //
        // La máquina y el acelerador se leían y se descartaban (iban prefijados con
        // `_`): ahora definen el runtime del job. El template ya no está fijo en
        // "default", que no existe salvo que alguien lo cree con ese nombre.
        let machine_type = config.machine_type.as_deref().unwrap_or("n1-standard-4");
        let accelerator_type = config
            .accelerator_type
            .as_deref()
            .unwrap_or("NVIDIA_TESLA_T4");
        let accelerator_count = config.accelerator_count.unwrap_or(1);

        let mut execution_spec = serde_json::json!({
            "displayName": format!("annotix-colab-{}", &job_uuid[..8]),
            "executionTimeout": format!("{}s", config.max_runtime_seconds.unwrap_or(21600)),
            "gcsNotebookSource": {
                "uri": gcs_notebook,
            },
            "gcsOutputUri": format!("gs://{}/{}/salida", self.bucket, gcs_prefix),
            "directNotebookSource": serde_json::Value::Null,
            "customEnvironmentSpec": {
                "machineSpec": {
                    "machineType": machine_type,
                    "acceleratorType": accelerator_type,
                    "acceleratorCount": accelerator_count,
                },
            },
        });
        if let Some(obj) = execution_spec.as_object_mut() {
            obj.remove("directNotebookSource");
            if accelerator_count == 0 {
                obj.remove("customEnvironmentSpec");
            }
        }

        let url = format!("{}/notebookExecutionJobs", self.api_base());
        let client = crate::net::blocking(crate::net::Purpose::RemoteTraining);
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

        let client = crate::net::blocking(crate::net::Purpose::RemoteTraining);
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

        let client = crate::net::blocking(crate::net::Purpose::RemoteTraining);
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
        let model_uri = status
            .model_output_uri
            .as_deref()
            .ok_or("No hay URI del modelo en el resultado")?;

        let token = self.get_token()?;
        let uri = model_uri.strip_prefix("gs://").ok_or("URI inválida")?;
        let (bucket, object) = uri.split_once('/').ok_or("URI inválida")?;

        gcs::download_file(&token, bucket, object, output_dir)
    }

    fn fetch_progress(&self, handle: &CloudJobHandle) -> Result<Vec<serde_json::Value>, String> {
        // Los eventos del entrenamiento llegan a Cloud Logging por stdout del job.
        // Sin esto, Colab Enterprise no daba progreso en vivo: la UI mostraba sólo el estado
        // grueso del job y el gráfico de métricas se quedaba vacío.
        let token = self.get_token()?;
        super::gcp_auth::fetch_annotix_events(&token, &self.project_id, &handle.job_id)
    }
}
