#[cfg(test)]
mod tests {
    use crate::image_engine::{EffectLayer, TemporalVariationConfig};
    use crate::video_runtime::layer_tracks::{apply_layer_tracks};
    use crate::video_runtime::process::process_with_cpu;
    use crate::video_runtime::types::{LayerTrack, LayerRange};

    #[test]
    fn test_cpu_parity_basic() {
        // Test that process_with_cpu produces consistent results for a known input
        let width = 4;
        let height = 4;
        let rgba = vec![255; (width * height * 4) as usize];
        
        let layers = vec![EffectLayer {
            id: "l1".to_string(),
            algorithm: "Floyd-Steinberg".to_string(),
            enabled: true,
            intensity: 100.0,
            palette: Some(vec![[0, 0, 0], [255, 255, 255]]),
            ..Default::default()
        }];

        let result1 = process_with_cpu(
            width,
            height,
            &rgba,
            &layers,
            &[],
            0
        ).expect("Process failed");

        let result2 = process_with_cpu(
            width,
            height,
            &rgba,
            &layers,
            &[],
            0
        ).expect("Process failed");

        assert_eq!(result1, result2, "Deterministic processing should produce identical results");
    }

    #[test]
    fn test_layer_track_parity() {
        // Test that layer tracks correctly modify the payload and result in different images
        let width = 4;
        let height = 4;
        let rgba = vec![128; (width * height * 4) as usize];
        
        let layers = vec![EffectLayer {
            id: "l1".to_string(),
            algorithm: "Floyd-Steinberg".to_string(),
            enabled: true,
            intensity: 100.0,
            palette: Some(vec![[0, 0, 0], [255, 255, 255]]),
            ..Default::default()
        }];

        // Track that disables the layer at frame 10
        let tracks = vec![LayerTrack {
            layer_id: "l1".to_string(),
            disable_outside_ranges: Some(true),
            ranges: vec![LayerRange {
                start_frame: 0,
                end_frame: 5,
                enabled: Some(true),
                opacity01: None,
                intensity: None,
                source_in_frame: None,
                source_out_frame: None,
            }],
            keyframes: vec![],
        }];

        // Frame 0: layer should be enabled
        let res_enabled = process_with_cpu(
            width, height, &rgba, &layers, &tracks, 0
        ).expect("f0 failed");

        // Frame 10: layer should be disabled (returns original rgba)
        let res_disabled = process_with_cpu(
            width, height, &rgba, &layers, &tracks, 10
        ).expect("f10 failed");

        assert_ne!(res_enabled, res_disabled, "Layer should be disabled at frame 10");
        assert_eq!(res_disabled, rgba, "Disabled layer should return original image");
    }

    #[test]
    #[ignore = "manual benchmark"]
    fn benchmark_v2_pipeline_speed() {
        use std::time::Instant;

        let width = 1920;
        let height = 1080;
        let rgba = vec![128; (width * height * 4) as usize];
        
        let layers = vec![EffectLayer {
            id: "l1".to_string(),
            algorithm: "Floyd-Steinberg".to_string(),
            enabled: true,
            intensity: 100.0,
            palette: Some(vec![[0, 0, 0], [255, 255, 255]]),
            ..Default::default()
        }];

        let iterations = 10;
        let start = Instant::now();

        for i in 0..iterations {
            let _ = process_with_cpu(
                width, height, &rgba, &layers, &[], i
            ).expect("Process failed");
        }

        let elapsed = start.elapsed();
        let per_frame = elapsed.as_millis() as f64 / iterations as f64;
        
        println!(
            "\nBENCHMARK_V2_RESULT: total_time={:?}, frames={}, ms_per_frame={:.2}ms, fps={:.2}",
            elapsed,
            iterations,
            per_frame,
            1000.0 / per_frame
        );
    }
}
