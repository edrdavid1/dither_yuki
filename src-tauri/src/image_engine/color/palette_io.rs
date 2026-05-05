use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PaletteFormat {
    Gpl,
    Txt,
    Pal,
    Act,
    Ase,
}

impl PaletteFormat {
    pub fn from_str(value: &str) -> Result<Self, String> {
        match value.to_ascii_lowercase().as_str() {
            "gpl" => Ok(Self::Gpl),
            "txt" => Ok(Self::Txt),
            "pal" => Ok(Self::Pal),
            "act" => Ok(Self::Act),
            "ase" => Ok(Self::Ase),
            _ => Err(format!("Unsupported palette format: {value}")),
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            Self::Gpl => "gpl",
            Self::Txt => "txt",
            Self::Pal => "pal",
            Self::Act => "act",
            Self::Ase => "ase",
        }
    }
}

pub fn export_palette(
    palette: &[[u8; 3]],
    name: Option<&str>,
    format: PaletteFormat,
) -> Result<Vec<u8>, String> {
    if palette.is_empty() {
        return Err("Palette cannot be empty".to_string());
    }

    let normalized_name = name
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .unwrap_or("Dither Yuki Palette");

    match format {
        PaletteFormat::Gpl => Ok(export_gpl(palette, normalized_name).into_bytes()),
        PaletteFormat::Txt => Ok(export_txt(palette).into_bytes()),
        PaletteFormat::Pal => Ok(export_pal_jasc(palette).into_bytes()),
        PaletteFormat::Act => Ok(export_act(palette)),
        PaletteFormat::Ase => export_ase(palette, normalized_name),
    }
}

pub fn import_palette(bytes: &[u8], format: PaletteFormat) -> Result<Vec<[u8; 3]>, String> {
    if bytes.is_empty() {
        return Err("Palette bytes are empty".to_string());
    }

    let palette = match format {
        PaletteFormat::Gpl => import_gpl(bytes)?,
        PaletteFormat::Txt => import_txt(bytes)?,
        PaletteFormat::Pal => import_pal_jasc(bytes)?,
        PaletteFormat::Act => import_act(bytes)?,
        PaletteFormat::Ase => import_ase(bytes)?,
    };

    if palette.is_empty() {
        Err("Parsed palette is empty".to_string())
    } else {
        Ok(palette)
    }
}

fn export_gpl(palette: &[[u8; 3]], name: &str) -> String {
    let mut out = String::new();
    out.push_str("GIMP Palette\n");
    out.push_str(&format!("Name: {name}\n"));
    out.push_str("Columns: 8\n");
    out.push_str("#\n");
    for (i, c) in palette.iter().enumerate() {
        out.push_str(&format!("{:>3} {:>3} {:>3} Color {}\n", c[0], c[1], c[2], i + 1));
    }
    out
}

fn import_gpl(bytes: &[u8]) -> Result<Vec<[u8; 3]>, String> {
    let text = std::str::from_utf8(bytes).map_err(|e| format!("Invalid GPL UTF-8: {e}"))?;
    if !text.lines().next().unwrap_or_default().starts_with("GIMP Palette") {
        return Err("Invalid GPL header".to_string());
    }

    let mut palette = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty()
            || line.starts_with('#')
            || line.starts_with("Name:")
            || line.starts_with("Columns:")
            || line.starts_with("GIMP Palette")
        {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }

        if let (Ok(r), Ok(g), Ok(b)) = (
            parts[0].parse::<u16>(),
            parts[1].parse::<u16>(),
            parts[2].parse::<u16>(),
        ) {
            if r <= 255 && g <= 255 && b <= 255 {
                palette.push([r as u8, g as u8, b as u8]);
            }
        }
    }

    Ok(dedup_palette(palette))
}

fn export_txt(palette: &[[u8; 3]]) -> String {
    let mut out = String::new();
    for c in palette {
        out.push_str(&format!("{} {} {}\n", c[0], c[1], c[2]));
    }
    out
}

fn import_txt(bytes: &[u8]) -> Result<Vec<[u8; 3]>, String> {
    let text = std::str::from_utf8(bytes).map_err(|e| format!("Invalid TXT UTF-8: {e}"))?;
    let mut palette = Vec::new();

    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Some(hex) = line.strip_prefix('#') {
            if hex.len() == 6 {
                if let (Ok(r), Ok(g), Ok(b)) = (
                    u8::from_str_radix(&hex[0..2], 16),
                    u8::from_str_radix(&hex[2..4], 16),
                    u8::from_str_radix(&hex[4..6], 16),
                ) {
                    palette.push([r, g, b]);
                    continue;
                }
            }

            // Any other #... line is treated as a comment.
            continue;
        }

        let normalized = line.replace(',', " ");
        let parts: Vec<&str> = normalized.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }

        if let (Ok(r), Ok(g), Ok(b)) = (
            parts[0].parse::<u16>(),
            parts[1].parse::<u16>(),
            parts[2].parse::<u16>(),
        ) {
            if r <= 255 && g <= 255 && b <= 255 {
                palette.push([r as u8, g as u8, b as u8]);
            }
        }
    }

    Ok(dedup_palette(palette))
}

fn export_pal_jasc(palette: &[[u8; 3]]) -> String {
    let mut out = String::new();
    out.push_str("JASC-PAL\n");
    out.push_str("0100\n");
    out.push_str(&format!("{}\n", palette.len()));
    for c in palette {
        out.push_str(&format!("{} {} {}\n", c[0], c[1], c[2]));
    }
    out
}

fn import_pal_jasc(bytes: &[u8]) -> Result<Vec<[u8; 3]>, String> {
    let text = std::str::from_utf8(bytes).map_err(|e| format!("Invalid PAL UTF-8: {e}"))?;
    let mut lines = text.lines();

    let header = lines.next().unwrap_or_default().trim();
    if header != "JASC-PAL" {
        return Err("Only JASC-PAL format is supported for .pal".to_string());
    }
    let _version = lines.next().unwrap_or_default();
    let count_line = lines.next().unwrap_or_default().trim();
    let declared_count = count_line.parse::<usize>().unwrap_or(0);

    let mut palette = Vec::new();
    for line in lines {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }
        if let (Ok(r), Ok(g), Ok(b)) = (
            parts[0].parse::<u16>(),
            parts[1].parse::<u16>(),
            parts[2].parse::<u16>(),
        ) {
            if r <= 255 && g <= 255 && b <= 255 {
                palette.push([r as u8, g as u8, b as u8]);
            }
        }
    }

    if declared_count > 0 {
        palette.truncate(declared_count);
    }

    Ok(dedup_palette(palette))
}

fn export_act(palette: &[[u8; 3]]) -> Vec<u8> {
    let mut out = vec![0u8; 768];
    for (i, c) in palette.iter().take(256).enumerate() {
        let base = i * 3;
        out[base] = c[0];
        out[base + 1] = c[1];
        out[base + 2] = c[2];
    }
    out
}

fn import_act(bytes: &[u8]) -> Result<Vec<[u8; 3]>, String> {
    if bytes.len() < 3 {
        return Err("ACT file too short".to_string());
    }

    let usable = bytes.len().min(768);
    let mut palette = Vec::new();
    for chunk in bytes[..usable].chunks_exact(3) {
        palette.push([chunk[0], chunk[1], chunk[2]]);
    }

    while let Some(last) = palette.last() {
        if *last == [0, 0, 0] {
            palette.pop();
        } else {
            break;
        }
    }

    Ok(dedup_palette(palette))
}

fn export_ase(palette: &[[u8; 3]], _name: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();

    out.extend_from_slice(b"ASEF");
    out.extend_from_slice(&1u16.to_be_bytes());
    out.extend_from_slice(&0u16.to_be_bytes());
    out.extend_from_slice(&(palette.len() as u32).to_be_bytes());

    for (i, c) in palette.iter().enumerate() {
        let color_name = format!("Color {}", i + 1);
        let mut payload = Vec::new();

        let mut utf16: Vec<u16> = color_name.encode_utf16().collect();
        utf16.push(0);
        payload.extend_from_slice(&(utf16.len() as u16).to_be_bytes());
        for ch in utf16 {
            payload.extend_from_slice(&ch.to_be_bytes());
        }

        payload.extend_from_slice(b"RGB ");
        payload.extend_from_slice(&(c[0] as f32 / 255.0).to_be_bytes());
        payload.extend_from_slice(&(c[1] as f32 / 255.0).to_be_bytes());
        payload.extend_from_slice(&(c[2] as f32 / 255.0).to_be_bytes());
        payload.extend_from_slice(&0u16.to_be_bytes());

        out.extend_from_slice(&0x0001u16.to_be_bytes());
        out.extend_from_slice(&(payload.len() as u32).to_be_bytes());
        out.extend_from_slice(&payload);
    }

    Ok(out)
}

fn import_ase(bytes: &[u8]) -> Result<Vec<[u8; 3]>, String> {
    if bytes.len() < 12 {
        return Err("ASE file too short".to_string());
    }
    if &bytes[0..4] != b"ASEF" {
        return Err("Invalid ASE signature".to_string());
    }

    let block_count = u32::from_be_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]) as usize;
    let mut offset = 12usize;
    let mut palette = Vec::new();

    for _ in 0..block_count {
        if offset + 6 > bytes.len() {
            break;
        }

        let block_type = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]);
        let block_len = u32::from_be_bytes([
            bytes[offset + 2],
            bytes[offset + 3],
            bytes[offset + 4],
            bytes[offset + 5],
        ]) as usize;
        offset += 6;

        if offset + block_len > bytes.len() {
            return Err("ASE block length is out of bounds".to_string());
        }

        if block_type == 0x0001 {
            let block = &bytes[offset..offset + block_len];
            if let Some(color) = parse_ase_color_block(block) {
                palette.push(color);
            }
        }

        offset += block_len;
    }

    Ok(dedup_palette(palette))
}

fn parse_ase_color_block(block: &[u8]) -> Option<[u8; 3]> {
    if block.len() < 2 {
        return None;
    }

    let name_len = u16::from_be_bytes([block[0], block[1]]) as usize;
    let name_bytes_len = name_len.checked_mul(2)?;
    let model_start = 2usize.checked_add(name_bytes_len)?;
    if model_start + 4 > block.len() {
        return None;
    }

    let model = &block[model_start..model_start + 4];
    let mut cursor = model_start + 4;

    if model == b"RGB " {
        if cursor + 12 > block.len() {
            return None;
        }
        let r = f32::from_be_bytes([
            block[cursor],
            block[cursor + 1],
            block[cursor + 2],
            block[cursor + 3],
        ]);
        cursor += 4;
        let g = f32::from_be_bytes([
            block[cursor],
            block[cursor + 1],
            block[cursor + 2],
            block[cursor + 3],
        ]);
        cursor += 4;
        let b = f32::from_be_bytes([
            block[cursor],
            block[cursor + 1],
            block[cursor + 2],
            block[cursor + 3],
        ]);

        Some([
            float01_to_u8(r),
            float01_to_u8(g),
            float01_to_u8(b),
        ])
    } else {
        None
    }
}

fn float01_to_u8(v: f32) -> u8 {
    (v.clamp(0.0, 1.0) * 255.0).round() as u8
}

fn dedup_palette(palette: Vec<[u8; 3]>) -> Vec<[u8; 3]> {
    let mut out = Vec::new();
    for c in palette {
        if !out.contains(&c) {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_palette() -> Vec<[u8; 3]> {
        vec![[0, 0, 0], [255, 255, 255], [255, 0, 128], [12, 34, 56]]
    }

    #[test]
    fn gpl_roundtrip() {
        let palette = sample_palette();
        let bytes = export_palette(&palette, Some("Test"), PaletteFormat::Gpl).unwrap();
        let parsed = import_palette(&bytes, PaletteFormat::Gpl).unwrap();
        assert_eq!(parsed, palette);
    }

    #[test]
    fn txt_roundtrip() {
        let palette = sample_palette();
        let bytes = export_palette(&palette, None, PaletteFormat::Txt).unwrap();
        let parsed = import_palette(&bytes, PaletteFormat::Txt).unwrap();
        assert_eq!(parsed, palette);
    }

    #[test]
    fn pal_roundtrip() {
        let palette = sample_palette();
        let bytes = export_palette(&palette, None, PaletteFormat::Pal).unwrap();
        let parsed = import_palette(&bytes, PaletteFormat::Pal).unwrap();
        assert_eq!(parsed, palette);
    }

    #[test]
    fn act_roundtrip_prefix() {
        let palette = sample_palette();
        let bytes = export_palette(&palette, None, PaletteFormat::Act).unwrap();
        let parsed = import_palette(&bytes, PaletteFormat::Act).unwrap();
        assert_eq!(&parsed[..palette.len()], &palette[..]);
    }

    #[test]
    fn ase_roundtrip() {
        let palette = sample_palette();
        let bytes = export_palette(&palette, Some("ASE"), PaletteFormat::Ase).unwrap();
        let parsed = import_palette(&bytes, PaletteFormat::Ase).unwrap();
        assert_eq!(parsed, palette);
    }

    #[test]
    fn txt_accepts_hex_colors() {
        let bytes = b"#FF00AA\n#00CC11\n";
        let parsed = import_palette(bytes, PaletteFormat::Txt).unwrap();
        assert_eq!(parsed, vec![[255, 0, 170], [0, 204, 17]]);
    }

    #[test]
    fn invalid_gpl_header_is_rejected() {
        let bytes = b"Not A GPL\n255 0 0\n";
        let err = import_palette(bytes, PaletteFormat::Gpl).unwrap_err();
        assert!(err.contains("Invalid GPL header"));
    }

    #[test]
    fn invalid_pal_header_is_rejected() {
        let bytes = b"RIFFxxxx";
        let err = import_palette(bytes, PaletteFormat::Pal).unwrap_err();
        assert!(err.contains("JASC-PAL"));
    }
}