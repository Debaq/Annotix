mod browser_automation;
mod commands;
mod export;
mod import;
mod inference;
mod p2p;
mod store;
mod training;
mod utils;

use tauri::Manager;

use store::AppState;
use training::runner::TrainingProcessManager;
use training::cloud::CloudTrainingManager;
use training::TrainingEnvCache;
use inference::runner::InferenceProcessManager;
use browser_automation::BrowserAutomationManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ffmpeg_the_third::init().expect("Error inicializando ffmpeg");

    let app_state = AppState::new().expect("Error inicializando AppState");

    tauri::Builder::default()
        .manage(app_state)
        .manage(TrainingProcessManager::new())
        .manage(CloudTrainingManager::new())
        .manage(TrainingEnvCache::new())
        .manage(InferenceProcessManager::new())
        .manage(BrowserAutomationManager::new())
        .manage(p2p::node::P2pState::new())
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

            // Icono de ventana (taskbar/dock en Linux)
            if let Some(window) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/icon.png");
                if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                    let _ = window.set_icon(icon);
                }

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

            // Reanudar extracciones de video interrumpidas
            commands::video_commands::resume_pending_extractions(app.handle().clone());

            // Reanudar sesión P2P si hay proyecto con p2p activa
            resume_p2p_session(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Proyectos
            commands::project_commands::create_project,
            commands::project_commands::get_project,
            commands::project_commands::list_projects,
            commands::project_commands::update_project,
            commands::project_commands::delete_project,
            commands::project_commands::set_project_folder,
            commands::project_commands::reveal_project_folder,
            commands::project_commands::zip_project,
            // Imágenes
            commands::image_commands::upload_images,
            commands::image_commands::upload_image_bytes,
            commands::image_commands::get_image,
            commands::image_commands::list_images_by_project,
            commands::image_commands::get_image_data,
            commands::image_commands::get_image_file_path,
            commands::image_commands::save_annotations,
            commands::image_commands::delete_image,
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
            // Training
            commands::training_commands::check_python_env,
            commands::training_commands::setup_python_env,
            commands::training_commands::detect_gpu,
            commands::training_commands::get_training_presets,
            commands::training_commands::get_yolo_models,
            commands::training_commands::start_training,
            commands::training_commands::cancel_training,
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
