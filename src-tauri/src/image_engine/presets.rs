// Shareable pattern preset file format (.dyuki)

use serde::{Deserialize, Serialize};

const PRESET_MAGIC: &str = "DYUKI-PATTERN-PRESET";
const PRESET_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternPreset {
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub algorithm: String,
    pub palette: Vec<[u8; 3]>,
    pub intensity: f32,
    pub params: serde_json::Value,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternPresetFile {
    pub magic: String,
    pub version: u32,
    pub preset: PatternPreset,
}

impl PatternPresetFile {
    pub fn new(preset: PatternPreset) -> Self {
        Self {
            magic: PRESET_MAGIC.to_string(),
            version: PRESET_VERSION,
            preset,
        }
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>, String> {
        serde_json::to_vec_pretty(self).map_err(|e| format!("Failed to serialize preset: {e}"))
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self, String> {
        let parsed: PatternPresetFile =
            serde_json::from_slice(bytes).map_err(|e| format!("Invalid preset file: {e}"))?;
        parsed.validate()?;
        Ok(parsed)
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.magic != PRESET_MAGIC {
            return Err("Unsupported preset file: invalid magic header".to_string());
        }

        if self.version != PRESET_VERSION {
            return Err(format!(
                "Unsupported preset version: {} (expected {})",
                self.version, PRESET_VERSION
            ));
        }

        if self.preset.name.trim().is_empty() {
            return Err("Preset name cannot be empty".to_string());
        }

        if self.preset.palette.is_empty() {
            return Err("Preset palette cannot be empty".to_string());
        }

        if !is_shareable_pattern_algorithm(&self.preset.algorithm) {
            return Err(format!(
                "Algorithm '{}' is not a shareable pattern algorithm",
                self.preset.algorithm
            ));
        }

        if !(0.0..=100.0).contains(&self.preset.intensity) {
            return Err("Intensity must be in range [0..100]".to_string());
        }

        Ok(())
    }
}

pub fn is_shareable_pattern_algorithm(name: &str) -> bool {
    matches!(
        name,
        "Bayer 2x2"
            | "Bayer 4x4"
            | "Bayer 8x8"
            | "Blue Noise"
            | "Void-and-Cluster"
            | "Clustered Halftone"
            | "Dispersed Halftone"
            | "Diagonal Line"
            | "Cross Hatch"
            | "Circle Halftone"
            | "Square Halftone"
            | "Triangle Wave"
            | "Hexagon Grid"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preset_roundtrip_works() {
        let preset = PatternPreset {
            name: "My Pattern".to_string(),
            description: Some("Shared with community".to_string()),
            author: Some("dave".to_string()),
            algorithm: "Hexagon Grid".to_string(),
            palette: vec![[0, 0, 0], [255, 255, 255]],
            intensity: 82.5,
            params: serde_json::json!({ "cellSize": 8 }),
            tags: vec!["retro".to_string(), "community".to_string()],
        };

        let file = PatternPresetFile::new(preset.clone());
        let bytes = file.to_bytes().expect("must serialize");
        let restored = PatternPresetFile::from_bytes(&bytes).expect("must parse");

        assert_eq!(restored.preset.name, preset.name);
        assert_eq!(restored.preset.algorithm, preset.algorithm);
        assert_eq!(restored.preset.palette, preset.palette);
    }

    #[test]
    fn preset_rejects_unknown_algorithm() {
        let file = PatternPresetFile::new(PatternPreset {
            name: "Bad".to_string(),
            description: None,
            author: None,
            algorithm: "Floyd-Steinberg".to_string(),
            palette: vec![[0, 0, 0], [255, 255, 255]],
            intensity: 50.0,
            params: serde_json::json!({}),
            tags: vec![],
        });

        let err = file.validate().expect_err("should fail validation");
        assert!(err.contains("not a shareable pattern algorithm"));
    }

    #[test]
    fn preset_rejects_bad_magic() {
        let raw = br#"{
            "magic": "WRONG",
            "version": 1,
            "preset": {
                "name": "Test",
                "description": null,
                "author": null,
                "algorithm": "Diagonal Line",
                "palette": [[0,0,0],[255,255,255]],
                "intensity": 50.0,
                "params": {},
                "tags": []
            }
        }"#;

        let err = PatternPresetFile::from_bytes(raw).expect_err("should fail");
        assert!(err.contains("invalid magic"));
    }
}
