mod commands;
mod export;
mod import;
mod store;
mod training;
mod utils;

use store::AppState;
use training::runner::TrainingProcessManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ffmpeg_the_third::init().expect("Error inicializando ffmpeg");

    let app_state = AppState::new().expect("Error inicializando AppState");

    tauri::Builder::default()
        .manage(app_state)
        .manage(TrainingProcessManager::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
