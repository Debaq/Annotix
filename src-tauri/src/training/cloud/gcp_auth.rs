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

    let body: serde_json::Value = resp.json()
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
