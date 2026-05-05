mod image_engine;
mod commands;
mod video_processing;

use commands::{
  extract_palette,
  export_palette,
  export_pattern_preset, export_svg, export_video_frames, import_pattern_preset, list_algorithms,
  list_palettes, list_shareable_pattern_algorithms, list_temporal_variation_modes,
  list_animation_easing_modes, list_animation_parameter_modes,
  import_palette, process_image, process_video_file, probe_video_file_metadata,
  check_dependencies,
  process_video_file_bytes,
  get_video_processing_progress,
  process_still_animation_file,
  cancel_video_processing_job, export_video_frames_pack_from_dir,
  render_still_animation,
  process_video_frames, process_video_frames_packed, reorder_effect_layers,
  get_default_output_path,
  save_bytes_to_default_location,
  save_bytes_to_path,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
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
      process_image,
      list_algorithms,
      list_palettes,
      list_shareable_pattern_algorithms,
      extract_palette,
      export_palette,
      import_palette,
      reorder_effect_layers,
      process_video_frames,
      process_video_frames_packed,
      export_video_frames,
      export_svg,
      list_temporal_variation_modes,
      list_animation_easing_modes,
      list_animation_parameter_modes,
      render_still_animation,
      process_video_file,
      process_video_file_bytes,
      probe_video_file_metadata,
      check_dependencies,
      process_still_animation_file,
      get_video_processing_progress,
      cancel_video_processing_job,
      export_video_frames_pack_from_dir,
      get_default_output_path,
      save_bytes_to_default_location,
      save_bytes_to_path,
      export_pattern_preset,
      import_pattern_preset
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
