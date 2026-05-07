// Asset hashing and storage-mode classification

use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

use crate::project::types::StorageMode;

const FULL_HASH_THRESHOLD: u64 = 100 * 1024 * 1024; // 100 MB
const EMBED_THRESHOLD: u64 = 10 * 1024 * 1024;      // 10 MB
const PARTIAL_CHUNK: usize = 10 * 1024 * 1024;       // 10 MB chunks for large-file hashing

/// Compute a SHA-256 hash for a file.
/// - Files ≤ 100 MB: full content hash.
/// - Files > 100 MB: hash of (first 10 MB + last 10 MB + file-size string) for speed.
pub fn compute_asset_hash(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|e| format!("metadata error: {e}"))?;
    let size = metadata.len();

    let hash_input: Vec<u8> = if size <= FULL_HASH_THRESHOLD {
        fs::read(path).map_err(|e| format!("read error: {e}"))?
    } else {
        let mut file = fs::File::open(path).map_err(|e| format!("open error: {e}"))?;

        let mut head = vec![0u8; PARTIAL_CHUNK];
        let head_read = file.read(&mut head).map_err(|e| format!("read head: {e}"))?;
        head.truncate(head_read);

        let tail_start = if size > PARTIAL_CHUNK as u64 {
            size - PARTIAL_CHUNK as u64
        } else {
            0
        };
        file.seek(SeekFrom::Start(tail_start))
            .map_err(|e| format!("seek error: {e}"))?;
        let mut tail = vec![0u8; PARTIAL_CHUNK];
        let tail_read = file.read(&mut tail).map_err(|e| format!("read tail: {e}"))?;
        tail.truncate(tail_read);

        let mut combined = head;
        combined.extend_from_slice(&tail);
        combined.extend_from_slice(size.to_string().as_bytes());
        combined
    };

    let mut hasher = Sha256::new();
    hasher.update(&hash_input);
    Ok(hex::encode(hasher.finalize()))
}

/// Determine how an asset should be stored based on its size.
/// Returns `Embedded` for files < 10 MB, `External` otherwise.
pub fn determine_storage_mode(size_bytes: u64) -> StorageMode {
    if size_bytes < EMBED_THRESHOLD {
        StorageMode::Embedded
    } else {
        StorageMode::External
    }
}
