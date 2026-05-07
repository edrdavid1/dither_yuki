// Tauri command: load_project — open a .dyproj ZIP and relink external assets.
//
// Relink cascade:
//  1. Check original_path — if the file exists, all good.
//  2. Look for a file with the same name in the directory that contains the .dyproj.
//  3. (Future) Hash-cache lookup.
//  4. Mark as offline: true if all checks fail.

use crate::project::types::{DyprojManifest, StorageMode};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadProjectResult {
    pub manifest: DyprojManifest,
    pub timeline_data: Option<Vec<u8>>,
    /// Asset IDs that could not be relinked and are marked offline.
    pub offline_assets: Vec<String>,
}

#[tauri::command]
pub async fn load_project(
    path: String,
    state: tauri::State<'_, crate::project::state::SharedProjectState>,
) -> Result<LoadProjectResult, String> {
    let file = fs::File::open(&path).map_err(|e| format!("open project: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("read zip: {e}"))?;

    // ── manifest.json ──────────────────────────────────────────────────────
    let mut manifest: DyprojManifest = {
        let mut entry = archive
            .by_name("manifest.json")
            .map_err(|e| format!("manifest.json missing: {e}"))?;
        let mut buf = String::new();
        entry
            .read_to_string(&mut buf)
            .map_err(|e| format!("read manifest: {e}"))?;
        serde_json::from_str(&buf).map_err(|e| format!("parse manifest: {e}"))?
    };

    // ── timeline.bin (optional) ────────────────────────────────────────────
    let timeline_data = match archive.by_name("timeline.bin") {
        Ok(mut entry) => {
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("read timeline: {e}"))?;
            Some(buf)
        }
        Err(_) => None,
    };

    // ── Relink external assets ─────────────────────────────────────────────
    let project_dir = Path::new(&path)
        .parent()
        .unwrap_or(Path::new("."))
        .to_path_buf();

    let mut offline_assets = Vec::new();
    let mut asset_map: HashMap<String, std::path::PathBuf> = HashMap::new();

    // Embedded assets are extracted to a temp cache dir and then served via dyproj://
    let extracted_assets_dir = std::env::temp_dir()
        .join("dither-yuki")
        .join("dyproj-assets")
        .join(&manifest.id);
    fs::create_dir_all(&extracted_assets_dir)
        .map_err(|e| format!("mkdir extracted assets: {e}"))?;

    for asset in manifest.assets.iter_mut() {
        if asset.storage == StorageMode::Embedded {
            let zip_entry = format!("assets/{}", asset.id);
            let mut entry = match archive.by_name(&zip_entry) {
                Ok(e) => e,
                Err(_) => {
                    asset.offline = true;
                    offline_assets.push(asset.id.clone());
                    continue;
                }
            };

            let ext = asset
                .name
                .rsplit('.')
                .next()
                .filter(|s| !s.is_empty() && *s != asset.name)
                .unwrap_or("bin");
            let out_path = extracted_assets_dir.join(format!("{}.{}", asset.id, ext));

            let mut data = Vec::new();
            entry
                .read_to_end(&mut data)
                .map_err(|e| format!("read embedded asset {}: {e}", asset.id))?;
            fs::write(&out_path, data)
                .map_err(|e| format!("write embedded asset {}: {e}", asset.id))?;

            asset.offline = false;
            asset.original_path = Some(out_path.to_string_lossy().into_owned());
            asset_map.insert(asset.id.clone(), out_path);
            continue;
        }

        if asset.storage != StorageMode::External {
            continue;
        }

        // Check 1: original path still valid
        if let Some(orig) = &asset.original_path {
            if Path::new(orig).exists() {
                asset.offline = false;
                asset_map.insert(asset.id.clone(), std::path::PathBuf::from(orig));
                continue;
            }
        }

        // Check 2: same filename in the project directory
        let relocated = asset.original_path.as_deref().and_then(|orig| {
            Path::new(orig).file_name().map(|n| project_dir.join(n))
        });
        if let Some(local) = relocated {
            if local.exists() {
                asset.original_path = Some(local.to_string_lossy().into_owned());
                asset.offline = false;
                asset_map.insert(asset.id.clone(), local);
                continue;
            }
        }

        // Check 3: TODO — hash-cache lookup (Phase B)

        // All checks failed — mark offline
        asset.offline = true;
        offline_assets.push(asset.id.clone());
    }

    {
        let mut guard = state
            .lock()
            .map_err(|_| "project state lock poisoned".to_string())?;
        guard.current_project_path = Some(std::path::PathBuf::from(&path));
        guard.asset_map = asset_map;
    }

    Ok(LoadProjectResult {
        manifest,
        timeline_data,
        offline_assets,
    })
}
