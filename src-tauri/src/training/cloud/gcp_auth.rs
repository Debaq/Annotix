use serde::Deserialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Deserialize)]
struct ServiceAccountKey {
    client_email: String,
    private_key: String,
    token_uri: String,
}

/// Obtiene un access token OAuth2 desde un archivo Service Account JSON de GCP.
/// Firma un JWT con la clave privada RSA y lo intercambia por un Bearer token.
pub fn get_access_token(sa_json_path: &str) -> Result<String, String> {
    let sa_content = std::fs::read_to_string(sa_json_path)
        .map_err(|e| format!("Error leyendo Service Account JSON: {}", e))?;

    let sa: ServiceAccountKey = serde_json::from_str(&sa_content)
        .map_err(|e| format!("Error parseando Service Account JSON: {}", e))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();

    let claims = serde_json::json!({
        "iss": sa.client_email,
        "scope": "https://www.googleapis.com/auth/cloud-platform",
        "aud": sa.token_uri,
        "iat": now,
        "exp": now + 3600,
    });

    // Use jsonwebtoken crate to create the JWT
    let encoding_key = jsonwebtoken::EncodingKey::from_rsa_pem(sa.private_key.as_bytes())
        .map_err(|e| format!("Error con clave privada RSA: {}", e))?;

    let jwt_header = jsonwebtoken::Header::new(jsonwebtoken::Algorithm::RS256);
    let token = jsonwebtoken::encode(&jwt_header, &claims, &encoding_key)
        .map_err(|e| format!("Error firmando JWT: {}", e))?;

    // Exchange JWT for access token
    let client = reqwest::blocking::Client::new();
    let resp = client
        .post(&sa.token_uri)
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", &token),
        ])
        .send()
        .map_err(|e| format!("Error solicitando token OAuth2: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().unwrap_or_default();
        return Err(format!("Error OAuth2 ({}): {}", status, body));
    }

    let body: serde_json::Value = resp
        .json()
        .map_err(|e| format!("Error parseando respuesta OAuth2: {}", e))?;

    body["access_token"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "access_token no encontrado en respuesta OAuth2".to_string())
}

/// Valida las credenciales GCP probando obtener un token
pub fn validate_credentials(sa_json_path: &str) -> Result<(), String> {
    get_access_token(sa_json_path)?;
    Ok(())
}

// ─── Cloud Logging ──────────────────────────────────────────────────────────

/// Extrae los eventos `ANNOTIX_EVENT:` de los logs de un job de Vertex AI.
///
/// Sin esto, los proveedores de GCP no tenían progreso en vivo: la barra se quedaba
/// en el porcentaje grueso del estado del job (5 / 50 / 100) y el gráfico de métricas
/// vacío hasta terminar. El entrypoint imprime los eventos por stdout y Vertex los
/// manda a Cloud Logging, así que basta consultarlos.
pub fn fetch_annotix_events(
    token: &str,
    project_id: &str,
    job_resource: &str,
) -> Result<Vec<serde_json::Value>, String> {
    // El nombre del recurso viene como `projects/<p>/locations/<l>/<tipo>/<id>`.
    let job_id = job_resource.rsplit('/').next().unwrap_or(job_resource);
    let filtro = format!(
        "resource.labels.job_id=\"{}\" AND textPayload:\"ANNOTIX_EVENT:\"",
        job_id
    );
    let cuerpo = serde_json::json!({
        "resourceNames": [format!("projects/{}", project_id)],
        "filter": filtro,
        "orderBy": "timestamp asc",
        "pageSize": 500,
    });

    let client = reqwest::blocking::Client::new();
    let resp = client
        .post("https://logging.googleapis.com/v2/entries:list")
        .header("Authorization", format!("Bearer {}", token))
        .json(&cuerpo)
        .send()
        .map_err(|e| format!("Error consultando Cloud Logging: {}", e))?;

    if !resp.status().is_success() {
        // Un job recién creado todavía no tiene logs: no es un error para el poller.
        return Ok(Vec::new());
    }

    let body: serde_json::Value = match resp.json() {
        Ok(v) => v,
        Err(_) => return Ok(Vec::new()),
    };

    let mut eventos = Vec::new();
    if let Some(entries) = body["entries"].as_array() {
        for entry in entries {
            let Some(texto) = entry["textPayload"].as_str() else {
                continue;
            };
            eventos.extend(parse_annotix_events(texto));
        }
    }
    Ok(eventos)
}

/// Eventos `ANNOTIX_EVENT:` contenidos en un texto de log.
pub fn parse_annotix_events(texto: &str) -> Vec<serde_json::Value> {
    const MARCA: &str = "ANNOTIX_EVENT:";
    let mut fuera = Vec::new();
    for linea in texto.lines() {
        let Some(pos) = linea.find(MARCA) else {
            continue;
        };
        let json = &linea[pos + MARCA.len()..];
        // Python escribe Infinity/NaN, que no son JSON válido.
        let saneado = json
            .replace("-Infinity", "null")
            .replace("Infinity", "null")
            .replace("NaN", "null");
        if let Ok(valor) = serde_json::from_str::<serde_json::Value>(saneado.trim()) {
            fuera.push(valor);
        }
    }
    fuera
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extrae_eventos_aunque_vengan_pegados_a_otra_salida() {
        let texto = "Epoch 1/2 100%|####| ANNOTIX_EVENT:{\"type\": \"epoch\", \"epoch\": 1}\n\
                     nada\n\
                     ANNOTIX_EVENT:{\"type\": \"artifact\", \"uri\": \"gs://b/r.zip\"}";
        let eventos = parse_annotix_events(texto);
        assert_eq!(eventos.len(), 2);
        assert_eq!(eventos[0]["epoch"].as_u64(), Some(1));
        assert_eq!(eventos[1]["uri"].as_str(), Some("gs://b/r.zip"));
    }

    #[test]
    fn sanea_los_no_finitos_de_python() {
        let eventos = parse_annotix_events(
            "ANNOTIX_EVENT:{\"type\": \"epoch\", \"metrics\": {\"a\": Infinity}}",
        );
        assert_eq!(eventos.len(), 1);
        assert!(eventos[0]["metrics"]["a"].is_null());
    }
}
