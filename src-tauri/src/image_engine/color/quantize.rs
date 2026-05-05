use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::color_space::{color_distance_oklab, oklab_to_rgb, rgb_to_oklab, Oklab};
use crate::image_engine::types::ImageData;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum QuantizationMethod {
    MedianCut,
    KMeans,
    Octree,
}

impl QuantizationMethod {
    pub fn from_str(value: &str) -> Result<Self, String> {
        match value {
            "median-cut" | "mediancut" => Ok(Self::MedianCut),
            "kmeans" | "k-means" => Ok(Self::KMeans),
            "octree" => Ok(Self::Octree),
            _ => Err(format!("Unknown quantization method: {value}")),
        }
    }
}

pub fn extract_palette(
    image: &ImageData,
    color_count: u32,
    method: QuantizationMethod,
) -> Result<Vec<[u8; 3]>, String> {
    if image.data.len() < 4 {
        return Err("Image data is empty".to_string());
    }

    let color_count = color_count.clamp(1, 256) as usize;
    let pixels = collect_pixels(image);

    if pixels.is_empty() {
        return Err("No RGB pixels found".to_string());
    }

    let mut palette = match method {
        QuantizationMethod::MedianCut => median_cut_palette(&pixels, color_count),
        QuantizationMethod::KMeans => kmeans_palette(&pixels, color_count),
        QuantizationMethod::Octree => octree_palette(&pixels, color_count),
    };

    if palette.is_empty() {
        return Err("Failed to extract palette".to_string());
    }

    palette.truncate(color_count);
    Ok(palette)
}

fn collect_pixels(image: &ImageData) -> Vec<[u8; 3]> {
    image
        .data
        .chunks_exact(4)
        .map(|p| [p[0], p[1], p[2]])
        .collect()
}

fn median_cut_palette(pixels: &[[u8; 3]], color_count: usize) -> Vec<[u8; 3]> {
    let mut boxes: Vec<Vec<[u8; 3]>> = vec![pixels.to_vec()];

    while boxes.len() < color_count {
        let Some((idx, channel)) = boxes
            .iter()
            .enumerate()
            .filter(|(_, b)| b.len() > 1)
            .map(|(i, b)| (i, dominant_channel(b)))
            .max_by_key(|(i, c)| {
                let b = &boxes[*i];
                channel_range(b, *c)
            })
        else {
            break;
        };

        let mut selected = boxes.remove(idx);
        selected.sort_unstable_by_key(|c| c[channel]);
        let mid = selected.len() / 2;
        let right = selected.split_off(mid);
        let left = selected;

        if !left.is_empty() {
            boxes.push(left);
        }
        if !right.is_empty() {
            boxes.push(right);
        }
    }

    boxes
        .into_iter()
        .map(|b| average_color(&b))
        .collect::<Vec<_>>()
}

fn dominant_channel(colors: &[[u8; 3]]) -> usize {
    let mut best = 0usize;
    let mut best_range = 0u8;
    for channel in 0..3 {
        let r = channel_range(colors, channel);
        if r > best_range {
            best_range = r;
            best = channel;
        }
    }
    best
}

fn channel_range(colors: &[[u8; 3]], channel: usize) -> u8 {
    let min = colors.iter().map(|c| c[channel]).min().unwrap_or(0);
    let max = colors.iter().map(|c| c[channel]).max().unwrap_or(0);
    max.saturating_sub(min)
}

fn average_color(colors: &[[u8; 3]]) -> [u8; 3] {
    if colors.is_empty() {
        return [0, 0, 0];
    }
    let len = colors.len() as u32;
    let mut r = 0u32;
    let mut g = 0u32;
    let mut b = 0u32;
    for c in colors {
        r += c[0] as u32;
        g += c[1] as u32;
        b += c[2] as u32;
    }
    [(r / len) as u8, (g / len) as u8, (b / len) as u8]
}

fn kmeans_palette(pixels: &[[u8; 3]], color_count: usize) -> Vec<[u8; 3]> {
    let k = color_count.min(pixels.len()).max(1);
    let mut centers: Vec<Oklab> = (0..k)
        .map(|i| {
            let pos = i * pixels.len() / k;
            let c = pixels[pos.min(pixels.len() - 1)];
            rgb_to_oklab(c[0], c[1], c[2])
        })
        .collect();

    for _ in 0..8 {
        let mut sums = vec![(0.0f32, 0.0f32, 0.0f32, 0u32); k];

        for p in pixels {
            let po = rgb_to_oklab(p[0], p[1], p[2]);
            let (best_idx, _) = centers
                .iter()
                .enumerate()
                .map(|(i, c)| (i, color_distance_oklab(*c, po)))
                .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
                .unwrap();

            let (l, a, b, count) = &mut sums[best_idx];
            *l += po.l;
            *a += po.a;
            *b += po.b;
            *count += 1;
        }

        for (i, (l, a, b, count)) in sums.into_iter().enumerate() {
            if count > 0 {
                centers[i] = Oklab {
                    l: l / count as f32,
                    a: a / count as f32,
                    b: b / count as f32,
                };
            }
        }
    }

    centers.into_iter().map(oklab_to_rgb).collect()
}

fn octree_palette(pixels: &[[u8; 3]], color_count: usize) -> Vec<[u8; 3]> {
    let depth = if color_count <= 8 {
        2
    } else if color_count <= 32 {
        3
    } else {
        4
    };

    let shift = 8 - depth;
    let mut buckets: HashMap<u32, (u64, u64, u64, u64)> = HashMap::new();

    for p in pixels {
        let r = (p[0] >> shift) as u32;
        let g = (p[1] >> shift) as u32;
        let b = (p[2] >> shift) as u32;
        let key = (r << 16) | (g << 8) | b;
        let entry = buckets.entry(key).or_insert((0, 0, 0, 0));
        entry.0 += p[0] as u64;
        entry.1 += p[1] as u64;
        entry.2 += p[2] as u64;
        entry.3 += 1;
    }

    let mut grouped = buckets
        .into_iter()
        .map(|(_, (sr, sg, sb, count))| {
            (
                count,
                [
                    (sr / count.max(1)) as u8,
                    (sg / count.max(1)) as u8,
                    (sb / count.max(1)) as u8,
                ],
            )
        })
        .collect::<Vec<_>>();

    grouped.sort_by(|a, b| b.0.cmp(&a.0));
    grouped
        .into_iter()
        .take(color_count)
        .map(|(_, color)| color)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn demo_image() -> ImageData {
        ImageData::from_rgba(
            4,
            2,
            vec![
                255, 0, 0, 255, 250, 10, 10, 255, 0, 255, 0, 255, 10, 250, 10, 255,
                0, 0, 255, 255, 10, 10, 250, 255, 240, 240, 0, 255, 250, 250, 10, 255,
            ],
        )
    }

    #[test]
    fn median_cut_returns_requested_count() {
        let img = demo_image();
        let palette = extract_palette(&img, 4, QuantizationMethod::MedianCut).unwrap();
        assert_eq!(palette.len(), 4);
    }

    #[test]
    fn kmeans_returns_requested_count() {
        let img = demo_image();
        let palette = extract_palette(&img, 3, QuantizationMethod::KMeans).unwrap();
        assert_eq!(palette.len(), 3);
    }

    #[test]
    fn octree_returns_requested_count_or_less() {
        let img = demo_image();
        let palette = extract_palette(&img, 5, QuantizationMethod::Octree).unwrap();
        assert!(palette.len() <= 5 && !palette.is_empty());
    }
}
