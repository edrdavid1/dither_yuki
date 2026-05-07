// Tauri command: save_project — serialises manifest + timeline into a .dyproj ZIP.
//
// Atomicity: write to a .tmp file first, then rename to the target path so a crash
// mid-write never leaves a corrupt .dyproj on disk.

use crate::project::types::{DyprojManifest, StorageMode};
use std::fs;
use std::io::Write;
use std::path::Path;
use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

#[tauri::command]
pub async fn save_project(
    path: String,
    manifest: DyprojManifest,
    timeline_data: Option<Vec<u8>>,
) -> Result<(), String> {
    // Stage embedded assets in a temp directory so we can copy them into the ZIP
    let tmp_dir = tempfile::tempdir().map_err(|e| format!("tempdir: {e}"))?;
    let assets_dir = tmp_dir.path().join("assets");
    fs::create_dir_all(&assets_dir).map_err(|e| format!("mkdir assets: {e}"))?;

    for asset in &manifest.assets {
        if asset.storage == StorageMode::Embedded {
            if let Some(orig) = &asset.original_path {
                let orig_path = Path::new(orig);
                if orig_path.exists() {
                    fs::copy(orig_path, assets_dir.join(&asset.id))
                        .map_err(|e| format!("copy asset {}: {e}", asset.id))?;
                }
            }
        }
    }

    let manifest_json =
        serde_json::to_vec_pretty(&manifest).map_err(|e| format!("serialize manifest: {e}"))?;

    let target_path = Path::new(&path);
    // Use a sibling .tmp file for atomic write
    let tmp_output = target_path.with_extension("dyproj.tmp");

    {
        let file =
            fs::File::create(&tmp_output).map_err(|e| format!("create tmp file: {e}"))?;
        let mut zip = zip::ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(CompressionMethod::Stored);

        zip.start_file("manifest.json", options)
            .map_err(|e| format!("zip start manifest: {e}"))?;
        zip.write_all(&manifest_json)
            .map_err(|e| format!("zip write manifest: {e}"))?;

        if let Some(tl) = &timeline_data {
            zip.start_file("timeline.bin", options)
                .map_err(|e| format!("zip start timeline: {e}"))?;
            zip.write_all(tl)
                .map_err(|e| format!("zip write timeline: {e}"))?;
        }

        for asset in &manifest.assets {
            if asset.storage == StorageMode::Embedded {
                let staged = assets_dir.join(&asset.id);
                if staged.exists() {
                    let data = fs::read(&staged)
                        .map_err(|e| format!("read staged asset {}: {e}", asset.id))?;
                    let entry = format!("assets/{}", asset.id);
                    zip.start_file(&entry, options)
                        .map_err(|e| format!("zip start asset {}: {e}", asset.id))?;
                    zip.write_all(&data)
                        .map_err(|e| format!("zip write asset {}: {e}", asset.id))?;
                }
            }
        }

        zip.finish().map_err(|e| format!("zip finish: {e}"))?;
    } // file handle dropped — ZIP is flushed

    // Atomic rename
    fs::rename(&tmp_output, target_path)
        .map_err(|e| format!("atomic rename: {e}"))?;

    Ok(())
}
