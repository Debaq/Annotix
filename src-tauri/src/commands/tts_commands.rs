use tauri::{AppHandle, Emitter, State};

use crate::store::config::LlmConfig;
use crate::store::project_file::TtsSentence;
use crate::store::AppState;

#[tauri::command]
pub fn get_tts_sentences(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<Vec<TtsSentence>, String> {
    state.get_tts_sentences(&project_id)
}

#[tauri::command]
pub fn save_tts_sentences(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    sentences: Vec<TtsSentence>,
) -> Result<(), String> {
    state.save_tts_sentences(&project_id, sentences)?;
    let _ = app.emit("db:tts-changed", &project_id);
    Ok(())
}

#[tauri::command]
pub fn save_tts_recording(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    sentence_id: String,
    audio_base64: String,
    file_ext: String,
    duration_ms: i64,
    sample_rate: i32,
) -> Result<String, String> {
    let id = state.save_tts_recording(
        &project_id,
        &sentence_id,
        &audio_base64,
        &file_ext,
        duration_ms,
        sample_rate,
    )?;
    let _ = app.emit("db:tts-changed", &project_id);
    let _ = app.emit("db:audio-changed", &project_id);
    Ok(id)
}

#[tauri::command]
pub fn link_tts_upload(
    state: State<'_, AppState>,
    app: AppHandle,
    project_id: String,
    sentence_id: String,
    audio_id: String,
) -> Result<(), String> {
    state.link_tts_upload(&project_id, &sentence_id, &audio_id)?;
    let _ = app.emit("db:tts-changed", &project_id);
    let _ = app.emit("db:audio-changed", &project_id);
    Ok(())
}

#[tauri::command]
pub fn get_llm_config(
    state: State<'_, AppState>,
) -> Result<Option<LlmConfig>, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.llm.clone())
}

#[tauri::command]
pub fn save_llm_config(
    state: State<'_, AppState>,
    llm_config: LlmConfig,
) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.llm = Some(llm_config);
    config.save(&state.data_dir)?;
    Ok(())
}

#[tauri::command]
pub async fn generate_tts_with_llm(
    state: State<'_, AppState>,
    language: String,
    count: u32,
    domain: String,
    length: String,
) -> Result<Vec<String>, String> {
    // Obtener config del LLM
    let llm_config = {
        let config = state.config.lock().map_err(|e| e.to_string())?;
        config.llm.clone().ok_or("LLM no configurado")?
    };

    let api_key = llm_config.api_key.as_deref().ok_or("API key no configurada")?;
    let provider = llm_config.provider.as_deref().unwrap_or("openai");

    let length_hint = match length.as_str() {
        "short" => "5-10 words each",
        "long" => "20-30 words each",
        _ => "10-20 words each", // medium
    };

    let system_prompt = format!(
        "You are a linguistic expert. Generate exactly {} phonetically balanced sentences in {} for TTS dataset recording. \
         Domain: {}. Length: {}. \
         Requirements:\n\
         - Cover diverse phonemes of the language\n\
         - Natural, conversational sentences\n\
         - Avoid tongue twisters or unusual constructions\n\
         - Each sentence on its own line\n\
         - No numbering, bullets, or extra formatting\n\
         - Only output the sentences, nothing else",
        count, language, domain, length_hint
    );

    let (url, body) = match provider {
        "anthropic" => {
            let url = "https://api.anthropic.com/v1/messages";
            let body = serde_json::json!({
                "model": "claude-sonnet-4-20250514",
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": system_prompt}]
            });
            (url.to_string(), body)
        }
        _ => {
            // OpenAI o compatible
            let base = llm_config.base_url.as_deref().unwrap_or("https://api.openai.com/v1");
            let url = format!("{}/chat/completions", base);
            let body = serde_json::json!({
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": "You generate phonetically balanced sentences for TTS datasets."},
                    {"role": "user", "content": system_prompt}
                ],
                "temperature": 0.8
            });
            (url, body)
        }
    };

    let client = reqwest::Client::new();
    let mut req = client.post(&url).json(&body);

    if provider == "anthropic" {
        req = req
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json");
    } else {
        req = req.header("Authorization", format!("Bearer {}", api_key));
    }

    let resp = req.send().await.map_err(|e| format!("Error llamando LLM: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("LLM respondió con error {}: {}", status, body));
    }

    let json: serde_json::Value = resp.json().await
        .map_err(|e| format!("Error parseando respuesta LLM: {}", e))?;

    // Extraer texto según el proveedor
    let text = if provider == "anthropic" {
        json["content"][0]["text"].as_str().unwrap_or("").to_string()
    } else {
        json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string()
    };

    let sentences: Vec<String> = text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    Ok(sentences)
}

// ─── Phonetic analysis via espeak-ng ────────────────────────────────────────

/// Resultado del análisis fonético
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhoneticAnalysis {
    /// true si espeak-ng está disponible
    pub available: bool,
    /// Fonemas únicos encontrados en los textos
    pub found_phonemes: Vec<String>,
    /// Inventario completo del idioma (si se conoce)
    pub inventory: Vec<String>,
    /// Fonemas faltantes
    pub missing: Vec<String>,
}

/// Mapeo de nombre de idioma completo a código espeak-ng
fn lang_to_espeak_voice(lang: &str) -> String {
    let lower = lang.to_lowercase();
    let code = match lower.as_str() {
        "english" => "en",
        "spanish" | "español" => "es",
        "french" | "français" => "fr",
        "german" | "deutsch" => "de",
        "italian" | "italiano" => "it",
        "portuguese" | "português" => "pt",
        "russian" | "русский" => "ru",
        "japanese" | "日本語" => "ja",
        "korean" | "한국어" => "ko",
        "chinese (mandarin)" | "中文" => "cmn",
        "arabic" | "العربية" => "ar",
        "hindi" | "हिन्दी" => "hi",
        "turkish" | "türkçe" => "tr",
        "dutch" | "nederlands" => "nl",
        "polish" | "polski" => "pl",
        "swedish" | "svenska" => "sv",
        "czech" | "čeština" => "cs",
        "greek" | "ελληνικά" => "el",
        "romanian" | "română" => "ro",
        "catalan" | "català" => "ca",
        other => {
            if other.len() <= 3 { other } else { "en" }
        }
    };
    code.to_string()
}

#[tauri::command]
pub async fn analyze_phonetic_coverage(
    texts: Vec<String>,
    language: String,
) -> Result<PhoneticAnalysis, String> {
    let voice = lang_to_espeak_voice(&language);

    // Verificar si espeak-ng está instalado
    let check = std::process::Command::new("espeak-ng").arg("--version").output();
    if check.is_err() {
        return Ok(PhoneticAnalysis {
            available: false,
            found_phonemes: vec![],
            inventory: vec![],
            missing: vec![],
        });
    }

    let alphabet_sample = match voice.as_str() {
        "es" => "a be ce de e efe ge hache i jota ka ele eme ene eñe o pe cu erre ese te u uve doble ve equis ye zeta",
        "fr" => "a bé cé dé e effe gé hache i ji ka elle emme enne o pé cu erre esse té u vé double vé ixe i grec zède",
        "de" => "a be ce de e eff ge ha i jot ka ell em en o pe ku err ess te u vau we ix ypsilon zett ä ö ü",
        "it" => "a bi ci di e effe gi acca i elle emme enne o pi cu erre esse ti u vu zeta",
        "pt" => "a bê cê dê e efe gê agá i jota ka ele eme ene o pê quê erre esse tê u vê xis ípsilon zê",
        "en" => "the quick brown fox jumps over a lazy dog which vexes my sphinx",
        _ => "a b c d e f g h i j k l m n o p q r s t u v w x y z",
    };

    // Phonemizar inventario para obtener todos los fonemas posibles
    let inv_output = std::process::Command::new("espeak-ng")
        .args(["--ipa", "-v", &voice, "-q"])
        .arg(alphabet_sample)
        .output()
        .map_err(|e| format!("Error ejecutando espeak-ng: {}", e))?;

    let inv_ipa = String::from_utf8_lossy(&inv_output.stdout);
    let inventory = extract_phonemes(&inv_ipa);

    // Phonemizar todos los textos grabados
    let mut all_found = std::collections::HashSet::new();

    // Procesar en lotes para no lanzar demasiados procesos
    for chunk in texts.chunks(50) {
        let combined = chunk.join("\n");
        let output = std::process::Command::new("espeak-ng")
            .args(["--ipa", "-v", &voice, "-q"])
            .arg(&combined)
            .output()
            .map_err(|e| format!("Error ejecutando espeak-ng: {}", e))?;

        let ipa = String::from_utf8_lossy(&output.stdout);
        for ph in extract_phonemes(&ipa) {
            all_found.insert(ph);
        }
    }

    let found: Vec<String> = all_found.iter().cloned().collect();
    let missing: Vec<String> = inventory.iter()
        .filter(|p| !all_found.contains(*p))
        .cloned()
        .collect();

    Ok(PhoneticAnalysis {
        available: true,
        found_phonemes: found,
        inventory: inventory.clone(),
        missing,
    })
}

/// Extrae fonemas IPA únicos de la salida de espeak-ng
fn extract_phonemes(ipa_text: &str) -> Vec<String> {
    let mut phonemes = std::collections::HashSet::new();

    for line in ipa_text.lines() {
        let clean = line.trim();
        if clean.is_empty() { continue; }

        // espeak-ng separa fonemas con espacios y sílabas con puntos/acentos
        for word in clean.split_whitespace() {
            // Eliminar marcadores prosódicos
            let word = word.replace(['ˈ', 'ˌ', '.', '|', '‖', ','], "");
            if word.is_empty() { continue; }

            // Separar caracteres IPA individuales
            // Los fonemas multi-char (como tʃ, dʒ) se manejan buscando combinaciones
            let chars: Vec<char> = word.chars().collect();
            let mut i = 0;
            while i < chars.len() {
                // Intentar combinaciones de 2 chars primero (africadas, etc)
                if i + 1 < chars.len() {
                    let pair = format!("{}{}", chars[i], chars[i+1]);
                    if is_ipa_phoneme(&pair) {
                        // Verificar si hay un tercer char (ej: tʃʰ)
                        if i + 2 < chars.len() {
                            let triple = format!("{}{}{}", chars[i], chars[i+1], chars[i+2]);
                            if is_ipa_phoneme(&triple) {
                                phonemes.insert(triple);
                                i += 3;
                                continue;
                            }
                        }
                        phonemes.insert(pair);
                        i += 2;
                        continue;
                    }
                }

                let ch = chars[i];
                // Solo fonemas IPA reales, no espacios ni puntuación
                if is_ipa_char(ch) {
                    // Verificar si es vocal larga (ej: iː, uː)
                    if i + 1 < chars.len() && chars[i+1] == 'ː' {
                        phonemes.insert(format!("{}ː", ch));
                        i += 2;
                        continue;
                    }
                    // Verificar nasalización (ej: ɑ̃)
                    if i + 1 < chars.len() && chars[i+1] == '\u{0303}' {
                        phonemes.insert(format!("{}\u{0303}", ch));
                        i += 2;
                        continue;
                    }
                    phonemes.insert(ch.to_string());
                }
                i += 1;
            }
        }
    }

    let mut result: Vec<String> = phonemes.into_iter().collect();
    result.sort();
    result
}

fn is_ipa_char(c: char) -> bool {
    matches!(c,
        'a'..='z' | 'ɐ'..='ɻ' | 'ʀ'..='ʯ' | 'β' | 'θ' | 'ð' | 'ɸ' | 'χ' | 'ʁ' |
        'ɑ' | 'ɒ' | 'ɔ' | 'ə' | 'ɛ' | 'ɜ' | 'ɪ' | 'ʊ' | 'ʌ' | 'æ' | 'ø' | 'œ' |
        'ɨ' | 'ʉ' | 'ɯ' | 'ɤ' | 'ɵ' | 'ɘ' | 'ɞ' | 'ɶ' |
        'ɲ' | 'ŋ' | 'ɳ' | 'ɱ' | 'ɴ' |
        'ɽ' | 'ɾ' | 'ɹ' | 'ɻ' | 'ɺ' |
        'ɬ' | 'ɮ' | 'ʎ' | 'ʟ' |
        'ɕ' | 'ʑ' | 'ʃ' | 'ʒ' | 'ʂ' | 'ʐ' |
        'ɡ' | 'ɢ' | 'ʔ' | 'ʕ' |
        'ç' | 'ʝ' | 'ɣ' | 'ħ' | 'ʜ' | 'ʢ' |
        'ɥ' | 'ʋ' | 'ɰ'
    )
}

fn is_ipa_phoneme(s: &str) -> bool {
    matches!(s,
        "tʃ" | "dʒ" | "ts" | "dz" | "tɕ" | "dʑ" | "tʂ" | "dʐ" |
        "pf" | "kx" | "bv" | "ɡɣ" |
        "pʰ" | "tʰ" | "kʰ" | "tɕʰ" | "tsʰ" | "tʂʰ" |
        "ai" | "ei" | "au" | "ou" | "ao" | "oi" | "eu" |
        "aɪ" | "eɪ" | "aʊ" | "oʊ" | "ɔɪ" |
        "an" | "en" | "ɑ̃" | "ɛ̃" | "ɔ̃" | "œ̃" |
        "pʲ" | "bʲ" | "tʲ" | "dʲ" | "kʲ" | "gʲ" | "fʲ" | "vʲ" |
        "sʲ" | "zʲ" | "mʲ" | "nʲ" | "lʲ" | "rʲ"
    )
}
