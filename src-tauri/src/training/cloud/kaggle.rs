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

    fn is_token_auth(&self) -> bool {
        self.api_key.to_uppercase().starts_with("KGAT_")
    }

    fn auth_header(&self) -> String {
        if self.is_token_auth() {
            format!("Bearer {}", self.api_key)
        } else {
            let credentials = base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                format!("{}:{}", self.username, self.api_key),
            );
            format!("Basic {}", credentials)
        }
    }

    fn create_dataset(&self, dataset_path: &str) -> Result<String, String> {
        if self.username.is_empty() {
            return Err("Falta username de Kaggle (necesario como ownerSlug del dataset)".to_string());
        }
        let slug_short = uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("ds").to_string();
        let dataset_slug_only = format!("annotix-training-{}", slug_short);
        let dataset_ref = format!("{}/{}", self.username, dataset_slug_only);

        // Leer bytes
        let data = std::fs::read(dataset_path)
            .map_err(|e| format!("Error leyendo dataset: {}", e))?;
        let content_length = data.len();
        let file_name = std::path::Path::new(dataset_path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("dataset.zip")
            .to_string();
        let last_modified_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        // 1. Solicitar URL de upload (Kaggle devuelve URL firmada GCS + token)
        // Sanitizar filename (acepta solo alfanumérico/._-)
        let safe_name: String = file_name.chars()
            .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.'|'_'|'-') { c } else { '_' })
            .collect();
        let last_modified_secs = last_modified_ms / 1000;
        // Kaggle API moderna: POST /api/v1/blobs/upload con body JSON
        let blob_req = serde_json::json!({
            "type": "dataset",
            "name": safe_name,
            "contentLength": content_length,
            "contentType": "application/octet-stream",
            "lastModifiedEpochSeconds": last_modified_secs,
        });
        let start_resp = self.client()
            .post("https://www.kaggle.com/api/v1/blobs/upload")
            .header("Authorization", self.auth_header())
            .json(&blob_req)
            .send()
            .map_err(|e| format!("Error iniciando upload Kaggle: {}", e))?;
        if !start_resp.status().is_success() {
            let status = start_resp.status();
            let body = start_resp.text().unwrap_or_default();
            return Err(format!("Error Kaggle upload start ({}): {}", status, body.chars().take(300).collect::<String>()));
        }
        let start_body: serde_json::Value = start_resp.json()
            .map_err(|e| format!("Respuesta Kaggle inválida: {}", e))?;

        let create_url = start_body.get("createUrl")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Falta createUrl en respuesta Kaggle: {}", start_body))?
            .to_string();
        let token = start_body.get("token")
            .and_then(|v| v.as_str())
            .ok_or_else(|| format!("Falta token en respuesta Kaggle: {}", start_body))?
            .to_string();

        // 2. PUT bytes a la URL firmada (GCS)
        let put_resp = self.client()
            .put(&create_url)
            .header("Content-Length", content_length.to_string())
            .header("Content-Type", "application/octet-stream")
            .body(data)
            .send()
            .map_err(|e| format!("Error subiendo bytes a Kaggle/GCS: {}", e))?;
        if !put_resp.status().is_success() {
            let status = put_resp.status();
            let body = put_resp.text().unwrap_or_default();
            return Err(format!("Error Kaggle PUT GCS ({}): {}", status, body.chars().take(300).collect::<String>()));
        }

        // 3. Crear dataset con el token
        let metadata = serde_json::json!({
            "title": "Annotix Training Dataset",
            "slug": dataset_slug_only,
            "ownerSlug": self.username,
            "licenseName": "CC0-1.0",
            "isPrivate": true,
            "files": [{"token": token}],
        });
        let create_resp = self.client()
            .post("https://www.kaggle.com/api/v1/datasets/create/new")
            .header("Authorization", self.auth_header())
            .json(&metadata)
            .send()
            .map_err(|e| format!("Error creando dataset Kaggle: {}", e))?;
        let create_status = create_resp.status();
        let create_body = create_resp.text().unwrap_or_default();
        log::info!("Kaggle dataset create response ({}): {}", create_status, create_body.chars().take(500).collect::<String>());
        if !create_status.is_success() {
            return Err(format!("Error Kaggle dataset create ({}): {}", create_status, create_body.chars().take(300).collect::<String>()));
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&create_body) {
            if v.get("hasError").and_then(|b| b.as_bool()).unwrap_or(false)
                || !v.get("error").and_then(|e| e.as_str()).unwrap_or("").is_empty()
            {
                return Err(format!(
                    "Error Kaggle dataset create: {}",
                    v.get("error").and_then(|e| e.as_str()).unwrap_or(&create_body)
                ));
            }
        }

        // Esperar a que el dataset esté procesado
        self.wait_dataset_ready(&self.username, &dataset_slug_only)?;

        Ok(dataset_ref)
    }

    fn wait_dataset_ready(&self, owner: &str, slug: &str) -> Result<(), String> {
        let url = format!("https://www.kaggle.com/api/v1/datasets/status/{}/{}", owner, slug);
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(300);
        loop {
            let resp = self.client()
                .get(&url)
                .header("Authorization", self.auth_header())
                .send()
                .map_err(|e| format!("Error consultando status dataset: {}", e))?;
            let status_http = resp.status();
            let body = resp.text().unwrap_or_default();
            if status_http.is_success() {
                let status_str = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|v| v.get("status").and_then(|s| s.as_str()).map(String::from))
                    .unwrap_or_else(|| body.trim().trim_matches('"').to_string());
                let s = status_str.to_lowercase();
                if s == "complete" || s == "ready" {
                    log::info!("Kaggle dataset {}/{} listo", owner, slug);
                    return Ok(());
                }
                if s == "error" || s == "failed" {
                    return Err(format!("Dataset Kaggle falló al procesar: {}", body));
                }
                log::info!("Esperando dataset Kaggle ({}/{}): status={}", owner, slug, status_str);
            } else {
                log::warn!("Status dataset HTTP {} body={}", status_http, body.chars().take(200).collect::<String>());
            }
            if std::time::Instant::now() >= deadline {
                return Err("Timeout esperando que dataset Kaggle esté listo (5 min)".to_string());
            }
            std::thread::sleep(std::time::Duration::from_secs(5));
        }
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
        let dataset_name = dataset_slug.rsplit('/').next().unwrap_or(dataset_slug);

        format!(
            r#"# Annotix Cloud Training Notebook (Kaggle)
import subprocess, sys, json, os, shutil
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "ultralytics"], check=True)

from ultralytics import YOLO

DATASET_DIR = "/kaggle/input/{dataset_name}"
WORK_DIR = "/kaggle/working"
os.makedirs(WORK_DIR, exist_ok=True)

# Classes: [{classes}]

def _emit(ev):
    print("ANNOTIX_EVENT:" + json.dumps(ev), flush=True)

_emit({{"type": "log", "message": "Starting training on Kaggle"}})

data_yaml = os.path.join(DATASET_DIR, "dataset.yaml")
if not os.path.exists(data_yaml):
    for cand in os.listdir(DATASET_DIR):
        if cand.endswith(".yaml") or cand.endswith(".yml"):
            data_yaml = os.path.join(DATASET_DIR, cand); break

model = YOLO("{model_id}")

def on_fit_epoch_end(trainer):
    metrics = {{}}
    epoch = trainer.epoch + 1
    total = trainer.epochs
    m = getattr(trainer, "metrics", None)
    if isinstance(m, dict):
        metrics["precision"] = m.get("metrics/precision(B)")
        metrics["recall"] = m.get("metrics/recall(B)")
        metrics["mAP50"] = m.get("metrics/mAP50(B)")
        metrics["mAP50_95"] = m.get("metrics/mAP50-95(B)")
    li = getattr(trainer, "loss_items", None)
    if li is not None:
        try:
            arr = li.cpu().numpy()
            if len(arr) >= 3:
                metrics["boxLoss"] = float(arr[0])
                metrics["clsLoss"] = float(arr[1])
                metrics["dflLoss"] = float(arr[2])
        except Exception: pass
    tloss = getattr(trainer, "tloss", None)
    if tloss is not None:
        try: metrics["trainLoss"] = float(tloss.cpu().numpy())
        except Exception: pass
    lr = getattr(trainer, "lr", None)
    if lr:
        try: metrics["lr"] = list(lr.values())[0] if isinstance(lr, dict) else float(lr)
        except Exception: pass
    _emit({{"type": "epoch", "epoch": epoch, "totalEpochs": total,
            "progress": (epoch / max(total, 1)) * 100.0, "metrics": metrics}})

model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

results = model.train(
    data=data_yaml,
    epochs={epochs},
    batch={batch_size},
    imgsz={image_size},
    device="0",
    lr0={lr},
    patience={patience},
    workers=2,
    project=WORK_DIR,
    name="train",
)

train_dir = os.path.join(WORK_DIR, "train")
best = os.path.join(train_dir, "weights", "best.pt")
last = os.path.join(train_dir, "weights", "last.pt")

final = {{}}
if results and hasattr(results, "results_dict"):
    rd = results.results_dict
    final = {{
        "precision": rd.get("metrics/precision(B)"),
        "recall": rd.get("metrics/recall(B)"),
        "mAP50": rd.get("metrics/mAP50(B)"),
        "mAP50_95": rd.get("metrics/mAP50-95(B)"),
    }}

# Export ONNX
onnx_path = None
try:
    if os.path.exists(best):
        onnx_path = YOLO(best).export(format="onnx")
        if isinstance(onnx_path, (list, tuple)) and onnx_path:
            onnx_path = onnx_path[0]
except Exception as e:
    _emit({{"type": "log", "message": f"ONNX export failed: {{e}}"}})

# Copy models to /kaggle/working raíz para que aparezcan en output
for src in [best, last, onnx_path]:
    if src and os.path.exists(src):
        try: shutil.copy2(src, os.path.join(WORK_DIR, os.path.basename(src)))
        except Exception: pass

_emit({{
    "type": "completed",
    "bestModelPath": best if os.path.exists(best) else None,
    "lastModelPath": last if os.path.exists(last) else None,
    "resultsDir": train_dir,
    "finalMetrics": final,
    "exportedModels": [p for p in [onnx_path] if p and os.path.exists(p)],
}})
"#,
            dataset_name = dataset_name,
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
        let slug_short = uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("k").to_string();
        let kernel_slug_only = format!("annotix-train-{}", slug_short);
        let kernel_slug = format!("{}/{}", self.username, kernel_slug_only);

        let accelerator = config.kaggle_accelerator.as_deref().unwrap_or("gpu");

        let kernel_push = serde_json::json!({
            "slug": kernel_slug,
            "newTitle": format!("Annotix Training {}", slug_short),
            "language": "python",
            "kernelType": "script",
            "isPrivate": true,
            "enableGpu": accelerator != "none",
            "enableTpu": accelerator == "tpu",
            "enableInternet": true,
            "datasetDataSources": [dataset_slug],
            "competitionDataSources": [],
            "kernelDataSources": [],
            "modelDataSources": [],
            "categoryIds": [],
            "text": notebook_source,
        });

        let resp = self.client()
            .post("https://www.kaggle.com/api/v1/kernels/push")
            .header("Authorization", self.auth_header())
            .json(&kernel_push)
            .send()
            .map_err(|e| format!("Error creando kernel en Kaggle: {}", e))?;

        let status = resp.status();
        let body_text = resp.text().unwrap_or_default();
        log::info!("Kaggle kernel push response ({}): {}", status, body_text.chars().take(500).collect::<String>());

        if !status.is_success() {
            return Err(format!("Error Kaggle kernel push ({}): {}", status, body_text));
        }

        let resp_body: serde_json::Value = serde_json::from_str(&body_text)
            .map_err(|e| format!("Respuesta push inválida: {} | body: {}", e, body_text))?;

        // Kaggle a veces devuelve 200 con error en body
        if let Some(err_msg) = resp_body.get("message").and_then(|v| v.as_str()) {
            if resp_body.get("code").and_then(|v| v.as_i64()).map(|c| c >= 400).unwrap_or(false) {
                return Err(format!("Error Kaggle kernel push: {}", err_msg));
            }
        }

        // Verificar que se creó (debe traer ref o url)
        let kernel_ref = resp_body.get("ref").and_then(|v| v.as_str()).map(String::from);
        let kernel_url = resp_body.get("url").and_then(|v| v.as_str()).map(String::from);
        if kernel_ref.is_none() && kernel_url.is_none() {
            return Err(format!(
                "Kaggle no creó el kernel. Respuesta: {}. Verifica que tu token tenga scope 'kernels' (los KGAT_ tokens requieren permisos de Kernels al crearlos).",
                body_text.chars().take(300).collect::<String>()
            ));
        }
        let _version_number = resp_body["versionNumber"].as_i64().unwrap_or(1);

        let final_slug = kernel_ref.unwrap_or_else(|| kernel_slug.clone());
        let final_url = kernel_url.unwrap_or_else(|| format!("https://www.kaggle.com/code/{}", final_slug));

        Ok(CloudJobHandle {
            job_id: final_slug,
            job_url: Some(final_url),
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

    fn fetch_progress(&self, handle: &CloudJobHandle) -> Result<Vec<serde_json::Value>, String> {
        let kernel_slug = handle.job_id.rsplit('/').next().unwrap_or(&handle.job_id);
        let url = format!(
            "https://www.kaggle.com/api/v1/kernels/output?userName={}&kernelSlug={}",
            self.username, kernel_slug,
        );
        let resp = self.client()
            .get(&url)
            .header("Authorization", self.auth_header())
            .send()
            .map_err(|e| format!("Error fetch_progress Kaggle: {}", e))?;
        if !resp.status().is_success() {
            return Ok(Vec::new());
        }
        let body: serde_json::Value = match resp.json() { Ok(v) => v, Err(_) => return Ok(Vec::new()) };

        // log puede venir como string JSON o array de entries
        let mut texts: Vec<String> = Vec::new();
        if let Some(arr) = body.get("log").and_then(|v| v.as_array()) {
            for entry in arr {
                if let Some(msg) = entry.get("message").and_then(|m| m.as_str()) {
                    texts.push(msg.to_string());
                } else if let Some(s) = entry.as_str() {
                    texts.push(s.to_string());
                }
            }
        } else if let Some(s) = body.get("log").and_then(|v| v.as_str()) {
            texts.push(s.to_string());
        }

        let mut events = Vec::new();
        for chunk in texts {
            for line in chunk.lines() {
                if let Some(json_str) = line.find("ANNOTIX_EVENT:").map(|i| &line[i + "ANNOTIX_EVENT:".len()..]) {
                    if let Ok(ev) = serde_json::from_str::<serde_json::Value>(json_str.trim()) {
                        events.push(ev);
                    }
                }
            }
        }
        Ok(events)
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
    let auth = if api_key.to_uppercase().starts_with("KGAT_") {
        format!("Bearer {}", api_key)
    } else {
        if username.is_empty() {
            return Err("Kaggle: username requerido para API key clásica (kaggle.json)".to_string());
        }
        let credentials = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            format!("{}:{}", username, api_key),
        );
        format!("Basic {}", credentials)
    };

    let client = reqwest::blocking::Client::new();
    let resp = client
        .get("https://www.kaggle.com/api/v1/datasets/list?page=1&pageSize=1")
        .header("Authorization", auth)
        .send()
        .map_err(|e| format!("Error conectando con Kaggle: {}", e))?;

    if resp.status().is_success() {
        Ok(())
    } else {
        Err(format!("Credenciales de Kaggle inválidas (HTTP {})", resp.status()))
    }
}
