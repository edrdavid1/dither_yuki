mod image_engine;
mod commands;
mod video_processing;
mod project;

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
  read_bytes_from_path,
};
use project::{save_project, load_project};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

struct ExitGuard(AtomicBool);

impl Default for ExitGuard {
  fn default() -> Self {
    Self(AtomicBool::new(false))
  }
}

impl ExitGuard {
  fn allow_once(&self) {
    self.0.store(true, Ordering::SeqCst);
  }

  fn consume_allowance(&self) -> bool {
    self.0.swap(false, Ordering::SeqCst)
  }
}

const MENU_NEW_PROJECT: &str = "menu-new-project";
const MENU_OPEN_FILE: &str = "menu-open-file";
const MENU_OPEN_PROJECT: &str = "menu-open-project";
const MENU_SAVE_PROJECT: &str = "menu-save-project";
const MENU_EXPORT_IMAGE: &str = "menu-export-image";
const MENU_EXPORT_IMAGE_ALT: &str = "menu-export-image-alt";
const MENU_EXPORT_SVG: &str = "menu-export-svg";
const MENU_SAVE_PRESET: &str = "menu-save-preset";
const MENU_LOAD_PRESET: &str = "menu-load-preset";
const MENU_EXPORT_PRESET: &str = "menu-export-preset";
const MENU_IMPORT_PRESET: &str = "menu-import-preset";
const MENU_MANAGE_PRESETS: &str = "menu-manage-presets";
const MENU_QUIT: &str = "menu-quit";
const MENU_UNDO: &str = "menu-undo";
const MENU_REDO: &str = "menu-redo";
const MENU_RESET: &str = "menu-reset";
const MENU_SHORTCUTS: &str = "menu-shortcuts";

fn build_native_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
  use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

  let pkg_info = app.package_info();
  let app_config = app.config();
  let about_metadata = tauri::menu::AboutMetadata {
    name: Some(pkg_info.name.clone()),
    version: Some(pkg_info.version.to_string()),
    copyright: app_config.bundle.copyright.clone(),
    authors: app_config.bundle.publisher.clone().map(|publisher| vec![publisher]),
    ..Default::default()
  };

  let app_menu = Submenu::with_items(
    app,
    pkg_info.name.clone(),
    true,
    &[
      &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::services(app, None)?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::hide(app, None)?,
      &PredefinedMenuItem::hide_others(app, None)?,
      &PredefinedMenuItem::separator(app)?,
      &MenuItem::with_id(app, MENU_QUIT, "Quit", true, Some("CmdOrCtrl+Q"))?,
    ],
  )?;

  let file_menu = Submenu::with_items(
    app,
    "File",
    true,
    &[
      &MenuItem::with_id(app, MENU_NEW_PROJECT, "New Project", true, Some("CmdOrCtrl+N"))?,
      &MenuItem::with_id(app, MENU_OPEN_FILE, "Open File", true, Some("CmdOrCtrl+O"))?,
      &MenuItem::with_id(app, MENU_OPEN_PROJECT, "Open Project", true, Some("CmdOrCtrl+Shift+O"))?,
      &MenuItem::with_id(app, MENU_SAVE_PROJECT, "Save Project", true, Some("CmdOrCtrl+S"))?,
      &MenuItem::with_id(app, MENU_EXPORT_IMAGE, "Export Image", true, Some("CmdOrCtrl+Shift+S"))?,
      &MenuItem::with_id(app, MENU_EXPORT_IMAGE_ALT, "Export", true, Some("CmdOrCtrl+E"))?,
      &MenuItem::with_id(app, MENU_EXPORT_SVG, "Export SVG", true, None::<&str>)?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::close_window(app, None)?,
    ],
  )?;

  let edit_menu = Submenu::with_items(
    app,
    "Edit",
    true,
    &[
      &MenuItem::with_id(app, MENU_UNDO, "Undo", true, Some("CmdOrCtrl+Z"))?,
      &MenuItem::with_id(app, MENU_REDO, "Redo", true, Some("CmdOrCtrl+Shift+Z"))?,
      &MenuItem::with_id(app, MENU_RESET, "Reset", true, Some("CmdOrCtrl+R"))?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::cut(app, None)?,
      &PredefinedMenuItem::copy(app, None)?,
      &PredefinedMenuItem::paste(app, None)?,
      &PredefinedMenuItem::select_all(app, None)?,
    ],
  )?;

  let presets_menu = Submenu::with_items(
    app,
    "Presets",
    true,
    &[
      &MenuItem::with_id(app, MENU_SAVE_PRESET, "Save Preset", true, None::<&str>)?,
      &MenuItem::with_id(app, MENU_LOAD_PRESET, "Load Preset", true, None::<&str>)?,
      &MenuItem::with_id(app, MENU_EXPORT_PRESET, "Export Preset", true, None::<&str>)?,
      &MenuItem::with_id(app, MENU_IMPORT_PRESET, "Import Preset", true, None::<&str>)?,
      &MenuItem::with_id(app, MENU_MANAGE_PRESETS, "Manage Presets", true, None::<&str>)?,
    ],
  )?;

  let window_menu = Submenu::with_items(
    app,
    "Window",
    true,
    &[
      &PredefinedMenuItem::minimize(app, None)?,
      &PredefinedMenuItem::maximize(app, None)?,
      &PredefinedMenuItem::fullscreen(app, None)?,
      &PredefinedMenuItem::separator(app)?,
      &PredefinedMenuItem::close_window(app, None)?,
    ],
  )?;

  let help_menu = Submenu::with_items(
    app,
    "Help",
    true,
    &[
      &MenuItem::with_id(app, MENU_SHORTCUTS, "Shortcuts", true, None::<&str>)?,
    ],
  )?;

  Menu::with_items(
    app,
    &[
      &app_menu,
      &file_menu,
      &edit_menu,
      &presets_menu,
      &window_menu,
      &help_menu,
    ],
  )
}

fn emit_menu_action<R: tauri::Runtime>(app: &tauri::AppHandle<R>, action: &str) {
  let _ = app.emit("menu-action", action);
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle, guard: tauri::State<ExitGuard>) {
  guard.allow_once();
  app.exit(0);
}

#[tauri::command]
fn set_project_dirty(dirty: bool, state: tauri::State<'_, project::state::DirtyState>) {
  println!("[exit-debug] set_project_dirty({dirty})");
  state.set(dirty);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let project_state = project::new_shared_state();
  let state_for_protocol = project_state.clone();
  let exit_guard = ExitGuard::default();
  let dirty_state = project::state::DirtyState::default();

  tauri::Builder::default()
    .manage(project_state)
    .manage(exit_guard)
    .manage(dirty_state)
    .enable_macos_default_menu(false)
    .menu(build_native_menu)
    .on_menu_event(|app, event| {
      if event.id() == MENU_NEW_PROJECT {
        emit_menu_action(app, "new-project");
      } else if event.id() == MENU_OPEN_FILE {
        emit_menu_action(app, "open-file");
      } else if event.id() == MENU_OPEN_PROJECT {
        emit_menu_action(app, "open-project");
      } else if event.id() == MENU_SAVE_PROJECT {
        emit_menu_action(app, "save-project");
      } else if event.id() == MENU_EXPORT_IMAGE {
        emit_menu_action(app, "export-image");
      } else if event.id() == MENU_EXPORT_IMAGE_ALT {
        emit_menu_action(app, "export");
      } else if event.id() == MENU_EXPORT_SVG {
        emit_menu_action(app, "export-svg");
      } else if event.id() == MENU_UNDO {
        emit_menu_action(app, "undo");
      } else if event.id() == MENU_REDO {
        emit_menu_action(app, "redo");
      } else if event.id() == MENU_RESET {
        emit_menu_action(app, "reset");
      } else if event.id() == MENU_SAVE_PRESET {
        emit_menu_action(app, "save-preset");
      } else if event.id() == MENU_LOAD_PRESET {
        emit_menu_action(app, "load-preset");
      } else if event.id() == MENU_EXPORT_PRESET {
        emit_menu_action(app, "export-preset");
      } else if event.id() == MENU_IMPORT_PRESET {
        emit_menu_action(app, "import-preset");
      } else if event.id() == MENU_MANAGE_PRESETS {
        emit_menu_action(app, "manage-presets");
      } else if event.id() == MENU_QUIT {
        emit_menu_action(app, "quit");
      } else if event.id() == MENU_SHORTCUTS {
        emit_menu_action(app, "shortcuts");
      }
    })
    .register_asynchronous_uri_scheme_protocol("dyproj", move |_ctx, request, responder| {
      project::protocol::handle_dyproj_request(request, state_for_protocol.clone(), responder);
    })
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
      read_bytes_from_path,
      export_pattern_preset,
      import_pattern_preset,
      save_project,
      load_project,
      exit_app,
      set_project_dirty,
    ])
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      match event {
        tauri::RunEvent::WindowEvent { event: tauri::WindowEvent::CloseRequested { api, .. }, .. } => {
          let dirty = app.state::<project::state::DirtyState>().is_dirty();
          println!("[exit-debug] CloseRequested dirty={dirty}");
          if app.state::<project::state::DirtyState>().is_dirty() {
            api.prevent_close();
            println!("[exit-debug] close prevented; asking frontend to show warning");
            let _ = app.emit("app-exit-requested", ());
          }
        }
        tauri::RunEvent::ExitRequested { api, .. } => {
          let dirty = app.state::<project::state::DirtyState>().is_dirty();
          println!("[exit-debug] ExitRequested dirty={dirty}");
          if app.state::<ExitGuard>().consume_allowance() {
            println!("[exit-debug] exit allowed by ExitGuard");
            return;
          }

          if app.state::<project::state::DirtyState>().is_dirty() {
            api.prevent_exit();
            println!("[exit-debug] exit prevented; asking frontend to show warning");
            let _ = app.emit("app-exit-requested", ());
          }
        }
        _ => {}
      }
    });
}
