mod image_engine;
mod commands;

use commands::{process_image, list_algorithms, list_palettes};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
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
      list_palettes
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
