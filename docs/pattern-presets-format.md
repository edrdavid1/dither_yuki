# Pattern Presets Format (`.dyuki`)

This project now supports community-shareable pattern presets via a custom file format.

## File Format

- Extension: `.dyuki`
- Encoding: UTF-8 JSON
- Root fields:
  - `magic`: must be `DYUKI-PATTERN-PRESET`
  - `version`: current version is `1`
  - `preset`: preset payload

## Preset Payload

The `preset` object contains:

- `name`: preset display name
- `description`: optional description
- `author`: optional author handle/name
- `algorithm`: pattern/ordered algorithm name
- `palette`: explicit RGB palette array, e.g. `[[0,0,0],[255,255,255]]`
- `intensity`: `0..100`
- `params`: algorithm-specific JSON object for future compatibility
- `tags`: string array for discovery/filtering

## Validation Rules

On import, files are rejected when:

- `magic` is invalid
- `version` is unsupported
- `name` is empty
- `palette` is empty
- `intensity` is out of range
- `algorithm` is not in shareable list

## Shareable Algorithms

Currently supported for export/import:

- `Bayer 2x2`
- `Bayer 4x4`
- `Bayer 8x8`
- `Blue Noise`
- `Void-and-Cluster`
- `Clustered Halftone`
- `Dispersed Halftone`
- `Diagonal Line`
- `Cross Hatch`
- `Circle Halftone`
- `Square Halftone`
- `Triangle Wave`
- `Hexagon Grid`

## Tauri Commands

- `list_shareable_pattern_algorithms` → returns allowed algorithms
- `export_pattern_preset` → returns `{ fileName, fileExtension, bytes }`
- `import_pattern_preset` → validates and returns parsed preset payload

Recommended frontend save behavior:

- Save `bytes` from `export_pattern_preset` as `<name>.dyuki`
- Read `.dyuki` bytes and pass into `import_pattern_preset`
