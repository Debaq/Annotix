use tauri::{AppHandle, Emitter, State};

use crate::p2p::node::P2pState;
use crate::p2p::P2pPermission;
use crate::store::AppState;

// ─── Helpers ────────────────────────────────────────────────────────────────

fn ms_to_secs(ms: i64) -> String {
    format!("{:.3}", ms as f64 / 1000.0)
}

fn probe_duration_ms(path: &str) -> Result<i64, String> {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ])
        .output()
        .map_err(|e| format!("Error ejecutando ffprobe: {}. Verifica que FFmpeg esté instalado.", e))?;

    if !output.status.success() {
        return Err(format!(
            "ffprobe error: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let secs: f64 = s
        .parse()
        .map_err(|_| format!("Duración inválida: {}", s))?;
    Ok((secs * 1000.0) as i64)
}

fn probe_sample_rate(path: &str) -> i32 {
    let output = std::process::Command::new("ffprobe")
        .args([
            "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=sample_rate",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ])
        .output();

    match output {
        Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout)
            .trim()
            .parse()
            .unwrap_or(44100),
        _ => 44100,
    }
}

fn run_ffmpeg(args: &[&str]) -> Result<(), String> {
    let output = std::process::Command::new("ffmpeg")
        .args(args)
        .output()
        .map_err(|e| {
            format!(
                "Error ejecutando ffmpeg: {}. Verifica que FFmpeg esté instalado.",
                e
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let err_lines: Vec<&str> = stderr.lines().rev().take(5).collect();
        let err_msg: String = err_lines.into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!("ffmpeg error: {}", err_msg));
    }

    Ok(())
}

/// Genera ruta de salida y nombre para un archivo editado
fn prepare_output(
    state: &AppState,
    project_id: &str,
    audio_id: &str,
    prefix: &str,
) -> Result<(String, String, String, std::path::PathBuf), String> {
    let src_path = state.get_audio_file_path(project_id, audio_id)?;
    let src_name = state
        .with_project(project_id, |pf| {
            pf.audio
                .iter()
                .find(|a| a.id == audio_id)
                .map(|a| a.name.clone())
        })?
        .ok_or("Audio no encontrado")?;

    let project_dir = state.project_dir(project_id)?;
    let audio_dir = project_dir.join("audio");
    let out_id = uuid::Uuid::new_v4().to_string();
    let new_name = format!("{}_{}", prefix, &src_name);
    let out_filename = format!("{}_{}", &out_id[..8], &new_name);
    let out_path = audio_dir.join(&out_filename);

    Ok((src_path, new_name, out_filename, out_path))
}

/// Registra el archivo de salida y emite eventos
fn register_output(
    state: &AppState,
    app: &AppHandle,
    project_id: &str,
    audio_id: &str,
    operation: &str,
    out_filename: &str,
    new_name: &str,
    out_path: &std::path::Path,
) -> Result<String, String> {
    let out_str = out_path.to_string_lossy().to_string();
    let duration = probe_duration_ms(&out_str)?;
    let sr = probe_sample_rate(&out_str);

    let new_id = state.add_audio_from_file(project_id, out_filename, new_name, duration, sr)?;

    let _ = app.emit(
        "audio:edit-progress",
        serde_json::json!({
            "audioId": audio_id,
            "operation": operation,
            "status": "done",
            "newAudioId": &new_id,
        }),
    );
    let _ = app.emit("db:audio-changed", project_id);

    Ok(new_id)
}

// ─── Commands ───────────────────────────────────────────────────────────────

/// Recortar: extraer el rango [start_ms, end_ms] como nuevo archivo
#[tauri::command]
pub async fn audio_trim(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    audio_id: String,
    start_ms: i64,
    end_ms: i64,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData)
        .await?;

    let (src_path, new_name, out_filename, out_path) =
        prepare_output(&state, &project_id, &audio_id, "trim")?;
    let out_str = out_path.to_string_lossy().to_string();

    let _ = app.emit(
        "audio:edit-progress",
        serde_json::json!({
            "audioId": &audio_id, "operation": "trim", "status": "processing"
        }),
    );

    let ss = ms_to_secs(start_ms);
    let to = ms_to_secs(end_ms);

    tauri::async_runtime::spawn_blocking(move || {
        run_ffmpeg(&["-i", &src_path, "-ss", &ss, "-to", &to, "-y", &out_str])
    })
    .await
    .map_err(|e| format!("Error en thread: {}", e))??;

    register_output(
        &state,
        &app,
        &project_id,
        &audio_id,
        "trim",
        &out_filename,
        &new_name,
        &out_path,
    )
}

/// Cortar: extraer un rango como archivo independiente
#[tauri::command]
pub async fn audio_cut(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    audio_id: String,
    start_ms: i64,
    end_ms: i64,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData)
        .await?;

    let (src_path, new_name, out_filename, out_path) =
        prepare_output(&state, &project_id, &audio_id, "cut")?;
    let out_str = out_path.to_string_lossy().to_string();

    let _ = app.emit(
        "audio:edit-progress",
        serde_json::json!({
            "audioId": &audio_id, "operation": "cut", "status": "processing"
        }),
    );

    let ss = ms_to_secs(start_ms);
    let to = ms_to_secs(end_ms);

    tauri::async_runtime::spawn_blocking(move || {
        run_ffmpeg(&["-i", &src_path, "-ss", &ss, "-to", &to, "-y", &out_str])
    })
    .await
    .map_err(|e| format!("Error en thread: {}", e))??;

    register_output(
        &state,
        &app,
        &project_id,
        &audio_id,
        "cut",
        &out_filename,
        &new_name,
        &out_path,
    )
}

/// Eliminar: remover un rango del audio (concatenar antes + después)
#[tauri::command]
pub async fn audio_delete_range(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    audio_id: String,
    start_ms: i64,
    end_ms: i64,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData)
        .await?;

    let (src_path, new_name, out_filename, out_path) =
        prepare_output(&state, &project_id, &audio_id, "del")?;
    let out_str = out_path.to_string_lossy().to_string();
    let start_sec = ms_to_secs(start_ms);
    let end_sec = ms_to_secs(end_ms);

    let _ = app.emit(
        "audio:edit-progress",
        serde_json::json!({
            "audioId": &audio_id, "operation": "delete", "status": "processing"
        }),
    );

    tauri::async_runtime::spawn_blocking(move || {
        if start_ms <= 0 {
            // Rango comienza al inicio: simplemente recortar desde end
            run_ffmpeg(&["-i", &src_path, "-ss", &end_sec, "-y", &out_str])
        } else {
            let filter = format!(
                "[0]atrim=0:{start},asetpts=PTS-STARTPTS[a];\
                 [0]atrim={end},asetpts=PTS-STARTPTS[b];\
                 [a][b]concat=n=2:v=0:a=1[out]",
                start = start_sec,
                end = end_sec,
            );
            run_ffmpeg(&[
                "-i",
                &src_path,
                "-filter_complex",
                &filter,
                "-map",
                "[out]",
                "-y",
                &out_str,
            ])
        }
    })
    .await
    .map_err(|e| format!("Error en thread: {}", e))??;

    register_output(
        &state,
        &app,
        &project_id,
        &audio_id,
        "delete",
        &out_filename,
        &new_name,
        &out_path,
    )
}

/// Dividir: partir el audio en dos archivos en el punto dado
#[tauri::command]
pub async fn audio_split(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    audio_id: String,
    split_ms: i64,
) -> Result<Vec<String>, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData)
        .await?;

    let src_path = state.get_audio_file_path(&project_id, &audio_id)?;
    let src_name = state
        .with_project(&project_id, |pf| {
            pf.audio
                .iter()
                .find(|a| a.id == audio_id)
                .map(|a| a.name.clone())
        })?
        .ok_or("Audio no encontrado")?;

    let project_dir = state.project_dir(&project_id)?;
    let audio_dir = project_dir.join("audio");

    let id_a = uuid::Uuid::new_v4().to_string();
    let id_b = uuid::Uuid::new_v4().to_string();
    let name_a = format!("split-A_{}", &src_name);
    let name_b = format!("split-B_{}", &src_name);
    let filename_a = format!("{}_{}", &id_a[..8], &name_a);
    let filename_b = format!("{}_{}", &id_b[..8], &name_b);
    let path_a = audio_dir.join(&filename_a);
    let path_b = audio_dir.join(&filename_b);
    let str_a = path_a.to_string_lossy().to_string();
    let str_b = path_b.to_string_lossy().to_string();

    let _ = app.emit(
        "audio:edit-progress",
        serde_json::json!({
            "audioId": &audio_id, "operation": "split", "status": "processing"
        }),
    );

    let split_sec = ms_to_secs(split_ms);

    tauri::async_runtime::spawn_blocking(move || {
        run_ffmpeg(&["-i", &src_path, "-to", &split_sec, "-y", &str_a])?;
        run_ffmpeg(&["-i", &src_path, "-ss", &split_sec, "-y", &str_b])?;
        Ok::<_, String>(())
    })
    .await
    .map_err(|e| format!("Error en thread: {}", e))??;

    let dur_a = probe_duration_ms(&path_a.to_string_lossy())?;
    let sr_a = probe_sample_rate(&path_a.to_string_lossy());
    let dur_b = probe_duration_ms(&path_b.to_string_lossy())?;
    let sr_b = probe_sample_rate(&path_b.to_string_lossy());

    let new_id_a =
        state.add_audio_from_file(&project_id, &filename_a, &name_a, dur_a, sr_a)?;
    let new_id_b =
        state.add_audio_from_file(&project_id, &filename_b, &name_b, dur_b, sr_b)?;

    let _ = app.emit(
        "audio:edit-progress",
        serde_json::json!({
            "audioId": &audio_id, "operation": "split", "status": "done",
            "newAudioIds": [&new_id_a, &new_id_b],
        }),
    );
    let _ = app.emit("db:audio-changed", &project_id);

    Ok(vec![new_id_a, new_id_b])
}

/// Silenciar: reemplazar un rango con silencio
#[tauri::command]
pub async fn audio_silence_range(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    audio_id: String,
    start_ms: i64,
    end_ms: i64,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData)
        .await?;

    let (src_path, new_name, out_filename, out_path) =
        prepare_output(&state, &project_id, &audio_id, "silence")?;
    let out_str = out_path.to_string_lossy().to_string();
    let start_sec = ms_to_secs(start_ms);
    let end_sec = ms_to_secs(end_ms);

    let _ = app.emit(
        "audio:edit-progress",
        serde_json::json!({
            "audioId": &audio_id, "operation": "silence", "status": "processing"
        }),
    );

    tauri::async_runtime::spawn_blocking(move || {
        let filter = format!(
            "volume=enable='between(t,{},{})':volume=0",
            start_sec, end_sec,
        );
        run_ffmpeg(&["-i", &src_path, "-af", &filter, "-y", &out_str])
    })
    .await
    .map_err(|e| format!("Error en thread: {}", e))??;

    register_output(
        &state,
        &app,
        &project_id,
        &audio_id,
        "silence",
        &out_filename,
        &new_name,
        &out_path,
    )
}

/// Normalizar volumen con loudnorm
#[tauri::command]
pub async fn audio_normalize(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    audio_id: String,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData)
        .await?;

    let (src_path, new_name, out_filename, out_path) =
        prepare_output(&state, &project_id, &audio_id, "norm")?;
    let out_str = out_path.to_string_lossy().to_string();

    let _ = app.emit(
        "audio:edit-progress",
        serde_json::json!({
            "audioId": &audio_id, "operation": "normalize", "status": "processing"
        }),
    );

    tauri::async_runtime::spawn_blocking(move || {
        run_ffmpeg(&[
            "-i",
            &src_path,
            "-af",
            "loudnorm=I=-16:LRA=11:TP=-1.5",
            "-y",
            &out_str,
        ])
    })
    .await
    .map_err(|e| format!("Error en thread: {}", e))??;

    register_output(
        &state,
        &app,
        &project_id,
        &audio_id,
        "normalize",
        &out_filename,
        &new_name,
        &out_path,
    )
}

/// Aplicar ecualizador con preset
#[tauri::command]
pub async fn audio_equalize(
    state: State<'_, AppState>,
    p2p: State<'_, P2pState>,
    app: AppHandle,
    project_id: String,
    audio_id: String,
    preset: String,
) -> Result<String, String> {
    p2p.check_permission(&project_id, P2pPermission::UploadData)
        .await?;

    let filter = match preset.as_str() {
        "voice-clean" => {
            "highpass=f=80,lowpass=f=8000,equalizer=f=300:t=q:w=1:g=-3,equalizer=f=2500:t=q:w=1.5:g=4"
        }
        "voice-telephone" => "highpass=f=300,lowpass=f=3400",
        "room-reverb" => "highpass=f=100,lowpass=f=6000,equalizer=f=400:t=q:w=2:g=-2",
        "noise-reduce" => "highpass=f=200,lowpass=f=3000,equalizer=f=1000:t=q:w=2:g=2",
        "flat" => "anull",
        _ => return Err(format!("Preset desconocido: {}", preset)),
    }
    .to_string();

    let prefix = format!("eq-{}", &preset);
    let (src_path, new_name, out_filename, out_path) =
        prepare_output(&state, &project_id, &audio_id, &prefix)?;
    let out_str = out_path.to_string_lossy().to_string();

    let _ = app.emit(
        "audio:edit-progress",
        serde_json::json!({
            "audioId": &audio_id, "operation": "equalize", "status": "processing"
        }),
    );

    tauri::async_runtime::spawn_blocking(move || {
        run_ffmpeg(&["-i", &src_path, "-af", &filter, "-y", &out_str])
    })
    .await
    .map_err(|e| format!("Error en thread: {}", e))??;

    register_output(
        &state,
        &app,
        &project_id,
        &audio_id,
        "equalize",
        &out_filename,
        &new_name,
        &out_path,
    )
}
