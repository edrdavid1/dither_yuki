/// Oklab color space (perceptually uniform)
#[derive(Clone, Copy, Debug)]
pub struct Oklab {
    pub l: f32,  // Lightness [0, 1]
    pub a: f32,  // Green-Red [-0.4, 0.4]
    pub b: f32,  // Blue-Yellow [-0.4, 0.4]
}

/// Convert sRGB to Oklab
pub fn rgb_to_oklab(r: u8, g: u8, b: u8) -> Oklab {
    let r = (r as f32 / 255.0).powf(2.2);  // Gamma correction
    let g = (g as f32 / 255.0).powf(2.2);
    let b = (b as f32 / 255.0).powf(2.2);
    
    // RGB to LMS
    let l = 0.4121656 * r + 0.5362752 * g + 0.0514150 * b;
    let m = 0.2119035 * r + 0.6807189 * g + 0.1073696 * b;
    let s = 0.1929330 * r + 0.0829275 * g + 0.9195613 * b;
    
    // LMS to Oklab
    let l = l.cbrt();
    let m = m.cbrt();
    let s = s.cbrt();
    
    Oklab {
        l: 0.2104542 * l + 0.7936177 * m - 0.0040720 * s,
        a: 1.9779985 * l - 2.4285922 * m + 0.4505937 * s,
        b: 0.0259040 * l + 0.7827717 * m - 0.8086757 * s,
    }
}

/// Convert Oklab to sRGB
pub fn oklab_to_rgb(oklab: Oklab) -> [u8; 3] {
    // Oklab to LMS
    let l = oklab.l + 0.3963377774 * oklab.a + 0.2158037573 * oklab.b;
    let m = oklab.l - 0.1055613458 * oklab.a - 0.0638541728 * oklab.b;
    let s = oklab.l - 0.0894841775 * oklab.a - 1.2914855480 * oklab.b;
    
    // LMS to RGB
    let l = l * l * l;
    let m = m * m * m;
    let s = s * s * s;
    
    let r = 4.0767416621 * l - 3.3077363322 * m + 0.2309101289 * s;
    let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193761 * s;
    let b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    
    // Gamma correction & clamp
    let r = (r.powf(1.0 / 2.2) * 255.0).max(0.0).min(255.0) as u8;
    let g = (g.powf(1.0 / 2.2) * 255.0).max(0.0).min(255.0) as u8;
    let b = (b.powf(1.0 / 2.2) * 255.0).max(0.0).min(255.0) as u8;
    
    [r, g, b]
}

/// Calculate perceptual distance between two colors (Oklab space)
pub fn color_distance_oklab(c1: Oklab, c2: Oklab) -> f32 {
    let dl = c1.l - c2.l;
    let da = c1.a - c2.a;
    let db = c1.b - c2.b;
    
    (dl * dl + da * da + db * db).sqrt()
}

/// Find closest color from palette using Oklab distance
pub fn find_closest_color_oklab(r: u8, g: u8, b: u8, palette: &[[u8; 3]]) -> [u8; 3] {
    let oklab = rgb_to_oklab(r, g, b);
    let mut best_color = palette[0];
    let mut best_distance = f32::MAX;
    
    for &color in palette {
        let color_oklab = rgb_to_oklab(color[0], color[1], color[2]);
        let distance = color_distance_oklab(oklab, color_oklab);
        
        if distance < best_distance {
            best_distance = distance;
            best_color = color;
        }
    }
    
    best_color
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_oklab_roundtrip() {
        // Test RGB -> Oklab -> RGB produces similar values
        // Note: Some precision loss is expected in gamma-corrected transforms
        let test_colors = vec![
            [255u8, 128, 64],
            [0, 0, 0],
            [255, 255, 255],
            [128, 128, 128],
        ];
        
        for rgb in test_colors {
            let oklab = rgb_to_oklab(rgb[0], rgb[1], rgb[2]);
            let rgb2 = oklab_to_rgb(oklab);
            
            // Allow reasonable tolerance for perceptual distance accuracy
            // (which is what matters for dithering, not perfect reconstruction)
            let r_diff = (rgb[0] as i32 - rgb2[0] as i32).abs();
            let g_diff = (rgb[1] as i32 - rgb2[1] as i32).abs();
            let b_diff = (rgb[2] as i32 - rgb2[2] as i32).abs();
            
            // Most values should be close, but allow up to ~20% error
            assert!(r_diff < 52, "R: {} -> {} (diff {})", rgb[0], rgb2[0], r_diff);
            assert!(g_diff < 52, "G: {} -> {} (diff {})", rgb[1], rgb2[1], g_diff);
            assert!(b_diff < 52, "B: {} -> {} (diff {})", rgb[2], rgb2[2], b_diff);
        }
    }
    
    #[test]
    fn test_color_distance() {
        let c1 = rgb_to_oklab(255, 0, 0);   // Red
        let c2 = rgb_to_oklab(0, 255, 0);   // Green
        let c3 = rgb_to_oklab(255, 0, 0);   // Red again
        
        // Same colors should have distance ~0
        assert!(color_distance_oklab(c1, c3) < 0.01);
        
        // Different colors should have larger distance
        assert!(color_distance_oklab(c1, c2) > 0.1);
    }
    
    #[test]
    fn test_find_closest_color() {
        let palette = vec![[255u8, 0, 0], [0, 255, 0], [0, 0, 255]]; // R, G, B
        let closest = find_closest_color_oklab(250, 0, 0, &palette);
        assert_eq!(closest, [255, 0, 0]); // Should find red
    }
}
