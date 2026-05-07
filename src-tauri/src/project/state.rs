// Shared state for the dyproj:// custom URI protocol.
// Populated by load_project / save_project so the protocol handler can map
// asset IDs to on-disk file paths.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

/// Globally shared asset registry: asset_id → absolute file path.
#[derive(Debug, Default, Clone)]
pub struct ProjectState {
    /// Path of the currently open .dyproj file.
    pub current_project_path: Option<PathBuf>,
    /// Map of asset_id → resolved file path for External assets.
    pub asset_map: HashMap<String, PathBuf>,
}

pub type SharedProjectState = Arc<Mutex<ProjectState>>;

#[derive(Debug, Default)]
pub struct DirtyState(pub AtomicBool);

impl DirtyState {
    pub fn set(&self, dirty: bool) {
        self.0.store(dirty, Ordering::SeqCst);
    }

    pub fn is_dirty(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

pub fn new_shared_state() -> SharedProjectState {
    Arc::new(Mutex::new(ProjectState::default()))
}
