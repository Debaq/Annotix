mod browser_automation;
mod commands;
mod export;
mod import;
mod inference;
mod p2p;
mod serve;
mod store;
mod training;
mod utils;

#[cfg(test)]
mod tests;

use tauri::Manager;

#[cfg(target_os = "linux")]
fn install_desktop_entry() {
    use std::fs;

    let Some(base) = directories::BaseDirs::new() else { return; };
    let data_home = base.data_local_dir();
    let apps_dir = data_home.join("applications");
    let icons_dir = data_home.join("icons/hicolor/512x512/apps");
    let desktop_path = apps_dir.join("annotix.desktop");
    let icon_path = icons_dir.join("annotix.png");

    let icon_bytes = include_bytes!("../icons/icon.png");
    if fs::create_dir_all(&icons_dir).is_ok() {
        let needs_write = fs::metadata(&icon_path)
            .map(|m| m.len() as usize != icon_bytes.len())
            .unwrap_or(true);
        if needs_write {
            let _ = fs::write(&icon_path, icon_bytes);
        }
    }

    let exec = std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(String::from))
        .unwrap_or_else(|| "annotix".to_string());

    let content = format!(
        "[Desktop Entry]\n\
         Name=Annotix\n\
         Comment=ML Dataset Annotation Tool\n\
         Exec=\"{exec}\" %U\n\
         Icon=annotix\n\
         Type=Application\n\
         Categories=Development;Graphics;Science;\n\
         StartupNotify=true\n\
         StartupWMClass=annotix\n"
    );

    if fs::create_dir_all(&apps_dir).is_ok() {
        let needs_write = fs::read_to_string(&desktop_path)
            .map(|s| s != content)
            .unwrap_or(true);
        if needs_write {
            let _ = fs::write(&desktop_path, &content);
            let _ = std::process::Command::new("update-desktop-database")
                .arg(&apps_dir)
                .status();
            let _ = std::process::Command::new("gtk-update-icon-cache")
                .arg("-f").arg("-t").arg(data_home.join("icons/hicolor"))
                .status();
        }
    }
}

use store::AppState;
use training::runner::TrainingProcessManager;
use training::cloud::CloudTrainingManager;
use training::TrainingEnvCache;
use inference::runner::InferenceProcessManager;
use inference::sam::state::SamState;
use browser_automation::BrowserAutomationManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ffmpeg_the_third::init().expect("Error inicializando ffmpeg");

    #[cfg(target_os = "linux")]
    install_desktop_entry();

    let app_state = AppState::new().expect("Error inicializando AppState");

    tauri::Builder::default()
        .manage(app_state)
        .manage(TrainingProcessManager::new())
        .manage(CloudTrainingManager::new())
        .manage(TrainingEnvCache::new())
        .manage(InferenceProcessManager::new())
        .manage(SamState::new())
        .manage(BrowserAutomationManager::new())
        .manage(p2p::node::P2pState::new())
        .manage(serve::ServeState::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if let Some(window) = app.get_webview_window("main") {
                // Permitir acceso al micrófono en WebKitGTK (Linux)
                #[cfg(target_os = "linux")]
                {
                    window.with_webview(|wv| {
                        use webkit2gtk::{WebViewExt, PermissionRequestExt};
                        let wv = wv.inner();
                        wv.connect_permission_request(|_wv, req: &webkit2gtk::PermissionRequest| {
                            req.allow();
                            true
                        });
                    }).ok();
                }
            }

            // Migrar entrenamientos legacy a carpeta del proyecto
            {
                let state = app.state::<store::AppState>();
                training::migrate::migrate_legacy_training_dirs(&state);
            }

            // Reanudar extracciones de video interrumpidas
            commands::video_commands::resume_pending_extractions(app.handle().clone());

            // Reanudar sesión P2P si hay proyecto con p2p activa (respetando config)
            {
                let config = app.state::<store::AppState>().get_app_config().unwrap_or_default();
                if !config.p2p_disabled {
                    resume_p2p_session(app.handle().clone());
                } else {
                    log::info!("P2P deshabilitado en configuración, no se reanuda");
                }
            }

            // Auto-iniciar servidor de red si está configurado
            auto_start_serve(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Proyectos
            commands::project_commands::create_project,
            commands::project_commands::get_project,
            commands::project_commands::list_projects,
            commands::project_commands::update_project,
            commands::project_commands::save_classes,
            commands::project_commands::delete_project,
            commands::project_commands::set_project_folder,
            commands::project_commands::reveal_project_folder,
            commands::project_commands::zip_project,
            commands::project_commands::update_project_image_format,
            // Imágenes
            commands::image_commands::upload_images,
            commands::image_commands::upload_image_bytes,
            commands::image_commands::get_image,
            commands::image_commands::list_images_by_project,
            commands::image_commands::get_image_data,
            commands::image_commands::get_image_file_path,
            commands::image_commands::save_annotations,
            commands::image_commands::delete_image,
            commands::image_commands::convert_project_images,
            // Series temporales
            commands::timeseries_commands::create_timeseries,
            commands::timeseries_commands::get_timeseries,
            commands::timeseries_commands::list_timeseries_by_project,
            commands::timeseries_commands::save_ts_annotations,
            commands::timeseries_commands::delete_timeseries,
            // Storage
            commands::storage_commands::get_storage_info,
            // File System
            commands::fs_commands::read_text_file,
            commands::fs_commands::read_binary_file,
            commands::fs_commands::write_binary_file,
            // Export
            commands::export_commands::export_dataset,
            // Import
            commands::import_commands::detect_import_format,
            commands::import_commands::import_dataset,
            commands::import_commands::analyze_tix_projects,
            commands::import_commands::merge_tix_projects,
            // CSV
            commands::csv_commands::parse_csv,
            commands::csv_commands::validate_csv,
            // Image processing
            commands::image_processing_commands::generate_thumbnail,
            commands::image_processing_commands::get_thumbnail_path,
            commands::image_processing_commands::generate_thumbnails_batch,
            // Video
            commands::video_commands::get_video_info,
            commands::video_commands::upload_video,
            commands::video_commands::extract_video_frames,
            commands::video_commands::get_video,
            commands::video_commands::list_videos_by_project,
            commands::video_commands::list_frames_by_video,
            commands::video_commands::delete_video,
            commands::video_commands::create_track,
            commands::video_commands::list_tracks_by_video,
            commands::video_commands::update_track,
            commands::video_commands::delete_track,
            commands::video_commands::set_keyframe,
            commands::video_commands::delete_keyframe,
            commands::video_commands::toggle_keyframe_enabled,
            commands::video_commands::bake_video_tracks,
            // Config
            commands::config_commands::is_setup_complete,
            commands::config_commands::get_config,
            commands::config_commands::set_projects_dir,
            commands::config_commands::save_network_config,
            commands::config_commands::check_for_updates,
            // Training
            commands::training_commands::check_python_env,
            commands::training_commands::setup_python_env,
            commands::training_commands::detect_gpu,
            commands::training_commands::get_training_presets,
            commands::training_commands::get_yolo_models,
            commands::training_commands::start_training,
            commands::training_commands::cancel_training,
            commands::training_commands::resume_training,
            commands::training_commands::get_training_job,
            commands::training_commands::list_training_jobs,
            commands::training_commands::delete_training_job,
            commands::training_commands::export_trained_model,
            commands::training_commands::get_available_backends,
            commands::training_commands::install_backend_packages,
            commands::training_commands::start_training_v2,
            commands::training_commands::generate_training_package,
            commands::training_commands::get_cloud_providers_config,
            commands::training_commands::save_cloud_provider_config,
            commands::training_commands::validate_cloud_credentials,
            commands::training_commands::download_cloud_model,
            // Tabular
            commands::tabular_commands::upload_tabular_file,
            commands::tabular_commands::create_tabular_data,
            commands::tabular_commands::update_tabular_rows,
            commands::tabular_commands::list_tabular_data,
            commands::tabular_commands::get_tabular_preview,
            commands::tabular_commands::update_tabular_config,
            commands::tabular_commands::delete_tabular_data,
            // Audio
            commands::audio_commands::upload_audio,
            commands::audio_commands::get_audio,
            commands::audio_commands::list_audio_by_project,
            commands::audio_commands::save_transcription,
            commands::audio_commands::delete_audio,
            commands::audio_commands::get_audio_file_path,
            commands::audio_commands::get_audio_data,
            commands::audio_commands::save_audio_annotation,
            // Audio Edit
            commands::audio_edit_commands::audio_trim,
            commands::audio_edit_commands::audio_cut,
            commands::audio_edit_commands::audio_delete_range,
            commands::audio_edit_commands::audio_split,
            commands::audio_edit_commands::audio_silence_range,
            commands::audio_edit_commands::audio_normalize,
            commands::audio_edit_commands::audio_equalize,
            // TTS Guided Recording
            commands::tts_commands::get_tts_sentences,
            commands::tts_commands::save_tts_sentences,
            commands::tts_commands::save_tts_recording,
            commands::tts_commands::link_tts_upload,
            commands::tts_commands::get_llm_config,
            commands::tts_commands::save_llm_config,
            commands::tts_commands::generate_tts_with_llm,
            commands::tts_commands::analyze_phonetic_coverage,
            // Settings
            commands::settings_commands::get_venv_info,
            commands::settings_commands::list_installed_packages,
            commands::settings_commands::update_packages,
            commands::settings_commands::install_pytorch,
            commands::settings_commands::install_onnx,
            commands::settings_commands::remove_venv,
            commands::settings_commands::detect_system_gpu,
            // P2P
            commands::p2p_commands::p2p_create_session,
            commands::p2p_commands::p2p_join_session,
            commands::p2p_commands::p2p_leave_session,
            commands::p2p_commands::p2p_pause_session,
            commands::p2p_commands::p2p_resume_session,
            commands::p2p_commands::p2p_get_session_info,
            commands::p2p_commands::p2p_get_all_sessions,
            commands::p2p_commands::p2p_lock_image,
            commands::p2p_commands::p2p_unlock_image,
            commands::p2p_commands::p2p_get_image_lock,
            commands::p2p_commands::p2p_assign_batch,
            commands::p2p_commands::p2p_sync_annotations,
            commands::p2p_commands::p2p_list_peers,
            commands::p2p_commands::p2p_update_rules,
            commands::p2p_commands::p2p_get_rules,
            commands::p2p_commands::p2p_resume_download,
            commands::p2p_commands::p2p_distribute_work,
            commands::p2p_commands::p2p_adjust_assignment,
            commands::p2p_commands::p2p_get_distribution,
            commands::p2p_commands::p2p_get_work_stats,
            commands::p2p_commands::p2p_update_peer_role,
            commands::p2p_commands::p2p_submit_data,
            commands::p2p_commands::p2p_approve_data,
            commands::p2p_commands::p2p_reject_data,
            commands::p2p_commands::p2p_list_pending_approvals,
            // Browser Automation
            commands::automation_commands::detect_browsers,
            commands::automation_commands::start_browser_automation,
            commands::automation_commands::pause_automation,
            commands::automation_commands::resume_automation,
            commands::automation_commands::cancel_automation,
            commands::automation_commands::get_automation_session,
            commands::automation_commands::get_browser_automation_config,
            commands::automation_commands::save_browser_automation_config,
            commands::automation_commands::test_launch_browser,
            commands::automation_commands::list_provider_selectors,
            commands::automation_commands::get_provider_selectors,
            commands::automation_commands::save_provider_selectors,
            // Inference
            commands::inference_commands::upload_inference_model,
            commands::inference_commands::delete_inference_model,
            commands::inference_commands::list_inference_models,
            commands::inference_commands::update_model_config,
            commands::inference_commands::detect_model_metadata,
            commands::inference_commands::parse_class_names,
            commands::inference_commands::parse_model_config,
            commands::inference_commands::start_batch_inference,
            commands::inference_commands::cancel_inference,
            commands::inference_commands::run_single_inference,
            commands::inference_commands::get_predictions,
            commands::inference_commands::clear_predictions,
            commands::inference_commands::accept_prediction,
            commands::inference_commands::reject_prediction,
            commands::inference_commands::convert_predictions,
            // Serve (red local)
            commands::serve_commands::start_serve,
            commands::serve_commands::stop_serve,
            commands::serve_commands::get_serve_status,
            commands::serve_commands::set_serve_auto_save,
            // Pixel processing (CLAHE, sharpness, flood-fill, audio peaks)
            commands::pixel_commands::process_image_filters,
            commands::pixel_commands::reclassify_mask_island,
            commands::pixel_commands::compute_audio_peaks,
            // PDF extraction
            commands::pdf_commands::extract_pdf_pages,
            // SAM (Segment Anything)
            commands::sam_commands::sam_load_model,
            commands::sam_commands::sam_encode_image,
            commands::sam_commands::sam_predict,
            commands::sam_commands::sam_auto_generate_masks,
            commands::sam_commands::sam_get_candidates,
            commands::sam_commands::sam_refilter_candidates,
            commands::sam_commands::sam_accept_mask,
            commands::sam_commands::sam_accept_refine,
            commands::sam_commands::sam_clear_refine,
            commands::sam_commands::sam_clear_cache,
            commands::sam_commands::sam_list_app_models,
            commands::sam_commands::sam_upload_app_model,
            commands::sam_commands::sam_delete_app_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Busca un proyecto con sesión P2P persistida y la reanuda en background
fn resume_p2p_session(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let app_state = app.state::<store::AppState>();
        let projects_dir = match app_state.projects_dir() {
            Ok(d) => d,
            Err(_) => return,
        };

        if !projects_dir.exists() {
            return;
        }

        let entries = match std::fs::read_dir(&projects_dir) {
            Ok(e) => e,
            Err(_) => return,
        };

        // Buscar el primer proyecto con p2p: Some(...)
        let mut found: Option<(String, store::project_file::P2pProjectConfig)> = None;
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() || !path.join("project.json").exists() {
                continue;
            }
            if let Ok(pf) = store::io::read_project(&path) {
                if let Some(p2p_config) = pf.p2p {
                    found = Some((pf.id, p2p_config));
                    break;
                }
            }
        }

        let (project_id, config) = match found {
            Some(f) => f,
            None => return,
        };

        log::info!("Reanudando sesión P2P para proyecto: {}", project_id);

        let p2p = app.state::<p2p::node::P2pState>();
        match p2p.resume_session(&app_state, &app, &project_id, config).await {
            Ok(info) => {
                log::info!(
                    "Sesión P2P restaurada: {} (share_code: {})",
                    info.project_name,
                    info.share_code
                );
            }
            Err(e) => {
                log::warn!("No se pudo restaurar sesión P2P: {}", e);
                // Limpiar config p2p del proyecto si falló
                let _ = app_state.with_project_mut(&project_id, |pf| {
                    pf.p2p = None;
                });
            }
        }
    });
}

/// Auto-inicia el servidor de red si está configurado en config.json
fn auto_start_serve(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let app_state = app.state::<store::AppState>();
        let config = match app_state.get_app_config() {
            Ok(c) => c,
            Err(_) => return,
        };

        if !config.serve.auto_start {
            return;
        }

        let serve_state = app.state::<serve::ServeState>();
        let mut project_ids = config.serve.project_ids.clone();

        // Si no hay IDs específicos, compartir todos los proyectos
        if project_ids.is_empty() {
            if let Ok(summaries) = app_state.list_projects() {
                project_ids = summaries.into_iter().map(|s| s.id).collect();
            }
        }

        if project_ids.is_empty() {
            log::info!("Auto-serve: no hay proyectos para compartir");
            return;
        }

        let port = config.serve.port;
        let auto_save = config.serve.auto_save;

        match serve_state.start(app.clone(), project_ids, port, auto_save).await {
            Ok(info) => {
                log::info!("Auto-serve: servidor iniciado en {:?}", info.urls);
            }
            Err(e) => {
                log::warn!("Auto-serve: no se pudo iniciar: {}", e);
            }
        }
    });
}
