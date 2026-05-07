// Shared state for the dyproj:// custom URI protocol.
// Populated by load_project / save_project so the protocol handler can map
// asset IDs to on-disk file paths.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

/// Globally shared asset registry: asset_id → absolute file path.
#[derive(Debug, Default, Clone)]
pub struct ProjectState {
    /// Path of the currently open .dyproj file.
    pub current_project_path: Option<PathBuf>,
    /// Map of asset_id → resolved file path for External assets.
    pub asset_map: HashMap<String, PathBuf>,
}

pub type SharedProjectState = Arc<Mutex<ProjectState>>;

pub fn new_shared_state() -> SharedProjectState {
    Arc::new(Mutex::new(ProjectState::default()))
}
