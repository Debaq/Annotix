use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::store::project_file::{ProjectFile, AudioEntry};

/// Agrega archivo de audio al ZIP, leyendo los bytes desde disco.
fn add_audio_to_zip<W: Write + std::io::Seek>(
    zip: &mut ZipWriter<W>,
    folder: &str,
    audio: &AudioEntry,
    audio_dir: &Path,
) -> Result<(), String> {
    let file_path = audio_dir.join(&audio.file);
    let data = std::fs::read(&file_path)
        .map_err(|e| format!("Error leyendo audio {}: {}", audio.name, e))?;

    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let path = format!("{}/{}", folder, audio.name);

    zip.start_file(&path, options)
        .map_err(|e| format!("Error creando archivo en ZIP: {}", e))?;
    zip.write_all(&data)
        .map_err(|e| format!("Error escribiendo audio en ZIP: {}", e))?;

    Ok(())
}

/// Exportar en formato HuggingFace CSV (file_name, transcription)
pub fn export_huggingface<F: Fn(f64)>(
    _project: &ProjectFile,
    audio_entries: &[AudioEntry],
    audio_dir: &Path,
    file: std::fs::File,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let total = audio_entries.len() as f64;

    // Agregar archivos de audio
    for (i, audio) in audio_entries.iter().enumerate() {
        add_audio_to_zip(&mut zip, "audio", audio, audio_dir)?;
        emit_progress(((i + 1) as f64 / total) * 80.0);
    }

    // Generar metadata.csv con formato HuggingFace
    let mut csv = "file_name,transcription\n".to_string();
    for audio in audio_entries {
        let escaped = audio.transcription.replace('"', "\"\"");
        csv.push_str(&format!("audio/{},\"{}\"\n", audio.name, escaped));
    }

    zip.start_file("metadata.csv", options).map_err(|e| e.to_string())?;
    zip.write_all(csv.as_bytes()).map_err(|e| e.to_string())?;

    emit_progress(100.0);
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Exportar en formato LJSpeech (wavs/ + metadata.csv con formato name|transcription)
pub fn export_ljspeech<F: Fn(f64)>(
    _project: &ProjectFile,
    audio_entries: &[AudioEntry],
    audio_dir: &Path,
    file: std::fs::File,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let total = audio_entries.len() as f64;

    // Agregar archivos de audio en carpeta wavs/
    for (i, audio) in audio_entries.iter().enumerate() {
        add_audio_to_zip(&mut zip, "wavs", audio, audio_dir)?;
        emit_progress(((i + 1) as f64 / total) * 80.0);
    }

    // Generar metadata.csv con formato LJSpeech: name|transcription|normalized_transcription
    let mut csv = String::new();
    for audio in audio_entries {
        // LJSpeech usa el nombre sin extensión como ID
        let stem = std::path::Path::new(&audio.name)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| audio.name.clone());
        csv.push_str(&format!("{}|{}|{}\n", stem, audio.transcription, audio.transcription));
    }

    zip.start_file("metadata.csv", options).map_err(|e| e.to_string())?;
    zip.write_all(csv.as_bytes()).map_err(|e| e.to_string())?;

    emit_progress(100.0);
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Exportar clasificación de audio: CSV con columnas file_name, label
pub fn export_audio_classification_csv<F: Fn(f64)>(
    project: &ProjectFile,
    audio_entries: &[AudioEntry],
    audio_dir: &Path,
    file: std::fs::File,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let total = audio_entries.len() as f64;

    let class_map: std::collections::HashMap<i64, &str> = project.classes.iter()
        .map(|c| (c.id, c.name.as_str()))
        .collect();

    for (i, audio) in audio_entries.iter().enumerate() {
        add_audio_to_zip(&mut zip, "audio", audio, audio_dir)?;
        emit_progress(((i + 1) as f64 / total) * 80.0);
    }

    let mut csv = "file_name,label\n".to_string();
    for audio in audio_entries {
        let label = audio.class_id
            .and_then(|cid| class_map.get(&cid).copied())
            .unwrap_or("");
        let escaped = label.replace('"', "\"\"");
        csv.push_str(&format!("audio/{},\"{}\"\n", audio.name, escaped));
    }

    zip.start_file("metadata.csv", options).map_err(|e| e.to_string())?;
    zip.write_all(csv.as_bytes()).map_err(|e| e.to_string())?;

    emit_progress(100.0);
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Exportar detección de eventos: CSV con columnas file_name, start_ms, end_ms, label
pub fn export_sound_events_csv<F: Fn(f64)>(
    project: &ProjectFile,
    audio_entries: &[AudioEntry],
    audio_dir: &Path,
    file: std::fs::File,
    emit_progress: F,
) -> Result<(), String> {
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let total = audio_entries.len() as f64;

    let class_map: std::collections::HashMap<i64, &str> = project.classes.iter()
        .map(|c| (c.id, c.name.as_str()))
        .collect();

    for (i, audio) in audio_entries.iter().enumerate() {
        add_audio_to_zip(&mut zip, "audio", audio, audio_dir)?;
        emit_progress(((i + 1) as f64 / total) * 80.0);
    }

    let mut csv = "file_name,start_ms,end_ms,label\n".to_string();
    for audio in audio_entries {
        for event in &audio.events {
            let label = class_map.get(&event.class_id).copied().unwrap_or("");
            let escaped = label.replace('"', "\"\"");
            csv.push_str(&format!("audio/{},{},{},\"{}\"\n", audio.name, event.start_ms, event.end_ms, escaped));
        }
    }

    zip.start_file("metadata.csv", options).map_err(|e| e.to_string())?;
    zip.write_all(csv.as_bytes()).map_err(|e| e.to_string())?;

    emit_progress(100.0);
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}
