use iroh_docs::DocTicket;

const PREFIX: &str = "ANN";
const HOST_PREFIX: &str = "ANN-HOST";

/// Codifica un DocTicket como código compacto "ANN-XXXX-XXXX-..."
pub fn encode_share_code(ticket: &DocTicket) -> String {
    let ticket_str = ticket.to_string();
    let b32 = base32_encode(ticket_str.as_bytes());
    let chunks: Vec<&str> = b32
        .as_bytes()
        .chunks(4)
        .map(|c| std::str::from_utf8(c).unwrap_or(""))
        .collect();
    format!("{}-{}", PREFIX, chunks.join("-"))
}

/// Decodifica un código "ANN-XXXX-..." de vuelta a DocTicket
pub fn decode_share_code(code: &str) -> Result<DocTicket, String> {
    let code = code.trim().to_uppercase();

    // Si tiene prefijo HOST, extraer solo la parte del ticket
    let stripped = if code.starts_with("ANN-HOST-") {
        // Es una host key, extraer la parte del ticket (antes del separador ZZZZ)
        let after_prefix = code.strip_prefix("ANN-HOST-").unwrap();
        let parts: Vec<&str> = after_prefix.split("-ZZZZ-").collect();
        if parts.is_empty() {
            return Err("Host key inválida".to_string());
        }
        parts[0].to_string()
    } else {
        code.strip_prefix("ANN-")
            .ok_or("Código inválido: debe comenzar con ANN-")?
            .to_string()
    };

    let b32: String = stripped.chars().filter(|c| *c != '-').collect();
    let bytes = base32_decode(&b32)?;
    let ticket_str = String::from_utf8(bytes)
        .map_err(|e| format!("Código inválido: {}", e))?;
    ticket_str.parse::<DocTicket>()
        .map_err(|e| format!("Ticket inválido: {}", e))
}

/// Codifica una host key: "ANN-HOST-{ticket_b32}-ZZZZ-{secret_b32}"
pub fn encode_host_key(host_secret: &str, share_code: &str) -> String {
    let share_part = share_code.strip_prefix("ANN-").unwrap_or(share_code);
    let secret_b32 = base32_encode(host_secret.as_bytes());
    let secret_chunks: Vec<&str> = secret_b32
        .as_bytes()
        .chunks(4)
        .map(|c| std::str::from_utf8(c).unwrap_or(""))
        .collect();
    format!("{}-{}-ZZZZ-{}", HOST_PREFIX, share_part, secret_chunks.join("-"))
}

/// Decodifica una host key y extrae (DocTicket, host_secret)
pub fn decode_host_key(code: &str) -> Result<(DocTicket, String), String> {
    let code = code.trim().to_uppercase();

    if !code.starts_with("ANN-HOST-") {
        return Err("No es una host key: debe comenzar con ANN-HOST-".to_string());
    }

    let after_prefix = code.strip_prefix("ANN-HOST-").unwrap();
    let parts: Vec<&str> = after_prefix.split("-ZZZZ-").collect();
    if parts.len() != 2 {
        return Err("Host key inválida: formato incorrecto".to_string());
    }

    // Decodificar ticket
    let ticket_b32: String = parts[0].chars().filter(|c| *c != '-').collect();
    let ticket_bytes = base32_decode(&ticket_b32)?;
    let ticket_str = String::from_utf8(ticket_bytes)
        .map_err(|e| format!("Ticket inválido: {}", e))?;
    let ticket = ticket_str.parse::<DocTicket>()
        .map_err(|e| format!("Ticket inválido: {}", e))?;

    // Decodificar secret
    let secret_b32: String = parts[1].chars().filter(|c| *c != '-').collect();
    let secret_bytes = base32_decode(&secret_b32)?;
    let host_secret = String::from_utf8(secret_bytes)
        .map_err(|e| format!("Secret inválido: {}", e))?;

    Ok((ticket, host_secret))
}

/// Detecta si un código es host key o share code
pub fn is_host_key(code: &str) -> bool {
    code.trim().to_uppercase().starts_with("ANN-HOST-")
}

fn base32_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut result = String::new();
    let mut bits = 0u32;
    let mut n_bits = 0;

    for &byte in data {
        bits = (bits << 8) | byte as u32;
        n_bits += 8;
        while n_bits >= 5 {
            n_bits -= 5;
            result.push(ALPHABET[((bits >> n_bits) & 0x1F) as usize] as char);
        }
    }
    if n_bits > 0 {
        result.push(ALPHABET[((bits << (5 - n_bits)) & 0x1F) as usize] as char);
    }
    result
}

fn base32_decode(input: &str) -> Result<Vec<u8>, String> {
    let mut result = Vec::new();
    let mut bits = 0u32;
    let mut n_bits = 0;

    for c in input.chars() {
        let val = match c {
            'A'..='Z' => c as u32 - 'A' as u32,
            '2'..='7' => c as u32 - '2' as u32 + 26,
            _ => return Err(format!("Carácter inválido en base32: {}", c)),
        };
        bits = (bits << 5) | val;
        n_bits += 5;
        if n_bits >= 8 {
            n_bits -= 8;
            result.push((bits >> n_bits) as u8);
        }
    }
    Ok(result)
}
