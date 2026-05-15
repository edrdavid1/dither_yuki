// .dyproj project manifest types — shared between save/load/protocol layers

use crate::video_runtime::types::LayerTrack as VideoLayerTrack;
use serde::{Deserialize, Serialize};

/// Top-level project manifest stored as `manifest.json` inside the .dyproj ZIP.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DyprojManifest {
    /// Format version, e.g. "1.0". Required.
    pub version: String,
    /// UUID v4 project identifier.
    pub id: String,
    pub created_at: String,
    pub modified_at: String,
    pub name: String,
    pub description: Option<String>,
    pub layers: Vec<Layer>,
    pub palettes: Vec<Palette>,
    pub assets: Vec<AssetRecord>,
    pub animation: Option<AnimationData>,
    #[serde(default)]
    pub video_layer_tracks: Vec<VideoLayerTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub algorithm: String,
    pub intensity: f32,
    pub params: serde_json::Value,
    pub palette_id: Option<String>,
    pub order: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Palette {
    pub id: String,
    pub name: String,
    pub colors: Vec<[u8; 3]>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
    pub id: String,
    pub name: String,
    pub asset_type: String,
    pub storage: StorageMode,
    pub original_path: Option<String>,
    pub hash: Option<String>,
    pub size_bytes: u64,
    #[serde(default)]
    pub offline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum StorageMode {
    Embedded,
    External,
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationData {
    pub duration_frames: u32,
    pub fps: f32,
    pub tracks: Vec<AnimationTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnimationTrack {
    pub id: String,
    pub layer_id: String,
    pub parameter: String,
    pub keyframes: Vec<Keyframe>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Keyframe {
    pub frame: u32,
    pub value: serde_json::Value,
    pub easing: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_manifest_roundtrip() {
        let json = r#"{
            "version": "1.0",
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "createdAt": "2026-05-05T00:00:00Z",
            "modifiedAt": "2026-05-05T00:00:00Z",
            "name": "Test Project",
            "description": null,
            "layers": [
                {
                    "id": "layer-1",
                    "name": "Floyd-Steinberg",
                    "enabled": true,
                    "algorithm": "floyd_steinberg",
                    "intensity": 1.0,
                    "params": {},
                    "paletteId": null,
                    "order": 0
                }
            ],
            "palettes": [],
            "assets": [],
            "animation": {
                "durationFrames": 60,
                "fps": 24.0,
                "tracks": [
                    {
                        "id": "track-1",
                        "layerId": "layer-1",
                        "parameter": "intensity",
                        "keyframes": [
                            { "frame": 0, "value": 0.0, "easing": "linear" },
                            { "frame": 60, "value": 1.0, "easing": "ease_in_out" }
                        ]
                    }
                ]
            }
        }"#;
        let manifest: DyprojManifest = serde_json::from_str(json).expect("failed to deserialize");
        assert_eq!(manifest.version, "1.0");
        assert_eq!(manifest.layers.len(), 1);
        let anim = manifest.animation.as_ref().unwrap();
        assert_eq!(anim.tracks.len(), 1);
        assert_eq!(anim.tracks[0].keyframes.len(), 2);

        // Roundtrip: serialize then deserialize again
        let re_json = serde_json::to_string(&manifest).expect("failed to serialize");
        let re_manifest: DyprojManifest = serde_json::from_str(&re_json).expect("roundtrip failed");
        assert_eq!(re_manifest.name, "Test Project");
    }
}
