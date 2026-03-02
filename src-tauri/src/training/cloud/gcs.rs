use std::path::Path;

/// Sube un archivo a Google Cloud Storage
pub fn upload_file(
    access_token: &str,
    bucket: &str,
    object_name: &str,
    local_path: &str,
) -> Result<String, String> {
    let data = std::fs::read(local_path)
        .map_err(|e| format!("Error leyendo archivo {}: {}", local_path, e))?;

    let url = format!(
        "https://storage.googleapis.com/upload/storage/v1/b/{}/o?uploadType=media&name={}",
        urlencoded(bucket),
        urlencoded(object_name),
    );

    let content_type = mime_from_path(local_path);

    let client = reqwest::blocking::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .header("Content-Type", content_type)
        .body(data)
        .send()
        .map_err(|e| format!("Error subiendo a GCS: {}", e))?;

    if !resp.status().is_success() {
        let body = resp.text().unwrap_or_default();
        return Err(format!("Error GCS upload: {}", body));
    }

    Ok(format!("gs://{}/{}", bucket, object_name))
}

/// Descarga un archivo de GCS a un directorio local
pub fn download_file(
    access_token: &str,
    bucket: &str,
    object_name: &str,
    output_dir: &str,
) -> Result<String, String> {
    let url = format!(
        "https://storage.googleapis.com/storage/v1/b/{}/o/{}?alt=media",
        urlencoded(bucket),
        urlencoded(object_name),
    );

    let client = reqwest::blocking::Client::new();
    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .map_err(|e| format!("Error descargando de GCS: {}", e))?;

    if !resp.status().is_success() {
        let body = resp.text().unwrap_or_default();
        return Err(format!("Error GCS download: {}", body));
    }

    let filename = object_name.rsplit('/').next().unwrap_or(object_name);
    let output_path = Path::new(output_dir).join(filename);
    let bytes = resp.bytes().map_err(|e| e.to_string())?;

    std::fs::write(&output_path, &bytes)
        .map_err(|e| format!("Error escribiendo archivo descargado: {}", e))?;

    Ok(output_path.to_string_lossy().to_string())
}

/// Sube un directorio completo a GCS con prefijo
#[allow(dead_code)]
pub fn upload_directory(
    access_token: &str,
    bucket: &str,
    prefix: &str,
    local_dir: &str,
) -> Result<String, String> {
    let dir = Path::new(local_dir);
    if !dir.is_dir() {
        return Err(format!("{} no es un directorio", local_dir));
    }

    for entry in walkdir(dir)? {
        let relative = entry.strip_prefix(dir).map_err(|e| e.to_string())?;
        let object_name = format!("{}/{}", prefix, relative.to_string_lossy());
        upload_file(access_token, bucket, &object_name, &entry.to_string_lossy())?;
    }

    Ok(format!("gs://{}/{}", bucket, prefix))
}

#[allow(dead_code)]
fn walkdir(dir: &Path) -> Result<Vec<std::path::PathBuf>, String> {
    let mut files = Vec::new();
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("Error leyendo directorio: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            files.extend(walkdir(&path)?);
        } else {
            files.push(path);
        }
    }
    Ok(files)
}

fn urlencoded(s: &str) -> String {
    s.replace('/', "%2F")
        .replace(' ', "%20")
}

fn mime_from_path(path: &str) -> &'static str {
    if path.ends_with(".zip") {
        "application/zip"
    } else if path.ends_with(".json") || path.ends_with(".jsonl") {
        "application/json"
    } else if path.ends_with(".py") {
        "text/x-python"
    } else if path.ends_with(".ipynb") {
        "application/x-ipynb+json"
    } else {
        "application/octet-stream"
    }
}
