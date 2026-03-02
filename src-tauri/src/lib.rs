mod commands;
mod export;
mod import;
mod p2p;
mod store;
mod training;
mod utils;

use tauri::Manager;

use store::AppState;
use training::runner::TrainingProcessManager;
use training::cloud::CloudTrainingManager;
use training::TrainingEnvCache;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ffmpeg_the_third::init().expect("Error inicializando ffmpeg");

    let app_state = AppState::new().expect("Error inicializando AppState");

    tauri::Builder::default()
        .manage(app_state)
        .manage(TrainingProcessManager::new())
        .manage(CloudTrainingManager::new())
        .manage(TrainingEnvCache::new())
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
            }

            // Reanudar extracciones de video interrumpidas
            commands::video_commands::resume_pending_extractions(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Proyectos
            commands::project_commands::create_project,
            commands::project_commands::get_project,
            commands::project_commands::list_projects,
            commands::project_commands::update_project,
            commands::project_commands::delete_project,
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
            commands::p2p_commands::p2p_get_session_info,
            commands::p2p_commands::p2p_lock_image,
            commands::p2p_commands::p2p_unlock_image,
            commands::p2p_commands::p2p_get_image_lock,
            commands::p2p_commands::p2p_assign_batch,
            commands::p2p_commands::p2p_sync_annotations,
            commands::p2p_commands::p2p_list_peers,
            commands::p2p_commands::p2p_update_rules,
            commands::p2p_commands::p2p_get_rules,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
