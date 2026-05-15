use crate::image_engine::{self, TemporalVariationConfig};
use super::layer_tracks::apply_layer_tracks;
use super::types::LayerTrack;

pub fn process_with_cpu(
    width: u32,
    height: u32,
    frame_rgba: &[u8],
    layers: &[image_engine::EffectLayer],
    tracks: &[LayerTrack],
    frame_index: usize,
) -> Result<Vec<u8>, String> {
    let input_all_zero = frame_rgba.iter().all(|&b| b == 0);
    if input_all_zero {
        log::warn!(
            "[process_with_cpu] input frame is all-zero at frame_index={}, size={}x{}, len={}, first4=[{}, {}, {}, {}]",
            frame_index,
            width,
            height,
            frame_rgba.len(),
            frame_rgba.get(0).copied().unwrap_or(0),
            frame_rgba.get(1).copied().unwrap_or(0),
            frame_rgba.get(2).copied().unwrap_or(0),
            frame_rgba.get(3).copied().unwrap_or(0),
        );
    }

    if layers.is_empty() {
        return Ok(frame_rgba.to_vec());
    }

    let frame_layers = apply_layer_tracks(layers, tracks, frame_index);
    let prepared = image_engine::prepare_video_layers(&frame_layers)?;
    let output = image_engine::process_single_video_frame(
        width,
        height,
        frame_rgba,
        &prepared,
        &TemporalVariationConfig::default(),
        frame_index as u32,
        0, // total_frames = 0 means don't use it for temporal if not provided
    )?;

    let output_all_zero = output.iter().all(|&b| b == 0);
    if !input_all_zero && output_all_zero {
        log::warn!(
            "[process_with_cpu] non-zero input became all-zero output at frame_index={}, size={}x{}, in_first4=[{}, {}, {}, {}], out_first4=[{}, {}, {}, {}], layers_len={}, tracks_len={}",
            frame_index,
            width,
            height,
            frame_rgba.get(0).copied().unwrap_or(0),
            frame_rgba.get(1).copied().unwrap_or(0),
            frame_rgba.get(2).copied().unwrap_or(0),
            frame_rgba.get(3).copied().unwrap_or(0),
            output.get(0).copied().unwrap_or(0),
            output.get(1).copied().unwrap_or(0),
            output.get(2).copied().unwrap_or(0),
            output.get(3).copied().unwrap_or(0),
            layers.len(),
            tracks.len(),
        );
    }

    Ok(output)
}

