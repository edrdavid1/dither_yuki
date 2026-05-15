use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

use super::types::VideoProcessingBackend;

#[derive(Debug, Clone)]
pub struct CacheEntry {
    pub rgba: Vec<u8>,
    pub backend_used: VideoProcessingBackend,
    pub fallback_used: bool,
    pub produced_index: usize,
}

#[derive(Debug)]
struct CacheState {
    order: VecDeque<String>,
    entries: HashMap<String, CacheEntry>,
}

pub struct VideoCacheService {
    max_entries: usize,
    state: Mutex<CacheState>,
}

pub fn cache_key(video_id: &str, frame_index: usize, quality: &str, scale: f32, layer_snapshot_hash: &str) -> String {
    format!("{video_id}:{frame_index}:{quality}:{scale:.3}:{layer_snapshot_hash}")
}

impl VideoCacheService {
    pub fn new(max_entries: usize) -> Self {
        Self {
            max_entries: max_entries.max(1),
            state: Mutex::new(CacheState {
                order: VecDeque::new(),
                entries: HashMap::new(),
            }),
        }
    }

    pub fn get(&self, key: &str) -> Option<CacheEntry> {
        let mut guard = self.state.lock().ok()?;
        if let Some(value) = guard.entries.get(key).cloned() {
            if let Some(pos) = guard.order.iter().position(|k| k == key) {
                let _ = guard.order.remove(pos);
            }
            guard.order.push_back(key.to_string());
            return Some(value);
        }
        None
    }

    pub fn put(&self, key: String, value: CacheEntry) {
        if let Ok(mut guard) = self.state.lock() {
            if guard.entries.contains_key(&key) {
                guard.entries.insert(key.clone(), value);
                if let Some(pos) = guard.order.iter().position(|k| k == &key) {
                    let _ = guard.order.remove(pos);
                }
                guard.order.push_back(key);
                return;
            }

            guard.entries.insert(key.clone(), value);
            guard.order.push_back(key);

            while guard.entries.len() > self.max_entries {
                if let Some(oldest) = guard.order.pop_front() {
                    let _ = guard.entries.remove(&oldest);
                } else {
                    break;
                }
            }
        }
    }

    pub fn clear(&self) {
        if let Ok(mut guard) = self.state.lock() {
            guard.order.clear();
            guard.entries.clear();
        }
    }
}

