use crate::image_engine::EffectLayer;
use super::types::{LayerTrack, LayerRange, LayerKeyframe};

/// Maps a timeline frame index to the corresponding source (file) frame index
/// for a given layer range.
///
/// When both `source_in_frame` and `source_out_frame` are set on the range,
/// the formula is: `min(source_in + (timeline_frame - start_frame), source_out)`.
/// This clamps the source frame so it never exceeds `source_out_frame`.
///
/// When either field is absent the timeline frame is returned unchanged.
pub fn resolve_source_frame(range: &LayerRange, timeline_frame: usize) -> usize {
    match (range.source_in_frame, range.source_out_frame) {
        (Some(src_in), Some(src_out)) => {
            let offset = timeline_frame.saturating_sub(range.start_frame);
            (src_in + offset).min(src_out)
        }
        _ => timeline_frame,
    }
}

/// Returns the source frame index that should be passed to the video decoder
/// for the given timeline `frame_index`.
///
/// Iterates over all tracks and finds the first active range that has both
/// `source_in_frame` and `source_out_frame` set. If no such range exists the
/// original `frame_index` is returned unchanged.
pub fn resolve_decode_frame(tracks: &[LayerTrack], frame_index: usize) -> usize {
    for track in tracks {
        if let Some(range) = find_active_range(&track.ranges, frame_index) {
            if range.source_in_frame.is_some() && range.source_out_frame.is_some() {
                return resolve_source_frame(range, frame_index);
            }
        }
    }
    frame_index
}

pub fn apply_layer_tracks(
    layers: &[EffectLayer],
    tracks: &[LayerTrack],
    frame_index: usize,
) -> Vec<EffectLayer> {
    if tracks.is_empty() {
        return layers.to_vec();
    }

    layers.iter().map(|layer| {
        let mut modified_layer = layer.clone();
        
        // Find track for this layer
        if let Some(track) = tracks.iter().find(|t| t.layer_id == layer.id) {
            let active_range = find_active_range(&track.ranges, frame_index);
            let disable_outside = track.disable_outside_ranges.unwrap_or(true);

            if active_range.is_none() && disable_outside {
                modified_layer.enabled = false;
                return modified_layer;
            }

            // Apply range overrides
            if let Some(range) = active_range {
                if let Some(enabled) = range.enabled {
                    modified_layer.enabled = enabled;
                }
                if let Some(opacity) = range.opacity01 {
                    modified_layer.opacity = Some(opacity);
                }
                if let Some(intensity) = range.intensity {
                    modified_layer.intensity = intensity;
                }
            }

            // Apply keyframe interpolation
            let interpolated = interpolate_keyframes(&track.keyframes, frame_index);
            if let Some(opacity) = interpolated.opacity01 {
                modified_layer.opacity = Some(opacity);
            }
            if let Some(intensity) = interpolated.intensity {
                modified_layer.intensity = intensity;
            }
        }
        
        modified_layer
    }).collect()
}

fn find_active_range(ranges: &[LayerRange], frame: usize) -> Option<&LayerRange> {
    ranges.iter().find(|r| frame >= r.start_frame && frame <= r.end_frame)
}

struct InterpolatedValues {
    opacity01: Option<f32>,
    intensity: Option<f32>,
}

fn interpolate_keyframes(keyframes: &[LayerKeyframe], frame: usize) -> InterpolatedValues {
    if keyframes.is_empty() {
        return InterpolatedValues { opacity01: None, intensity: None };
    }

    let (prev, next) = find_keyframe_bounds(keyframes, frame);
    
    match (prev, next) {
        (None, None) => InterpolatedValues { opacity01: None, intensity: None },
        (Some(p), None) => InterpolatedValues {
            opacity01: p.opacity01,
            intensity: p.intensity,
        },
        (None, Some(n)) => InterpolatedValues {
            opacity01: n.opacity01,
            intensity: n.intensity,
        },
        (Some(p), Some(n)) => {
            if p.frame == n.frame {
                return InterpolatedValues {
                    opacity01: p.opacity01,
                    intensity: p.intensity,
                };
            }

            let span = (n.frame - p.frame) as f32;
            let t = (frame - p.frame) as f32 / span;
            
            let opacity01 = if let (Some(p_op), Some(n_op)) = (p.opacity01, n.opacity01) {
                Some(lerp(p_op, n_op, t).clamp(0.0, 1.0))
            } else {
                None
            };

            let intensity = if let (Some(p_int), Some(n_int)) = (p.intensity, n.intensity) {
                Some(lerp(p_int, n_int, t))
            } else {
                None
            };

            InterpolatedValues { opacity01, intensity }
        }
    }
}

fn find_keyframe_bounds(keyframes: &[LayerKeyframe], frame: usize) -> (Option<&LayerKeyframe>, Option<&LayerKeyframe>) {
    let mut prev: Option<&LayerKeyframe> = None;
    let mut next: Option<&LayerKeyframe> = None;

    for k in keyframes {
        if k.frame <= frame {
            if prev.is_none() || k.frame > prev.unwrap().frame {
                prev = Some(k);
            }
        }
        if k.frame >= frame {
            if next.is_none() || k.frame < next.unwrap().frame {
                next = Some(k);
            }
        }
    }

    (prev, next)
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}
