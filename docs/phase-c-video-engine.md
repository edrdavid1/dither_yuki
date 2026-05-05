# Phase C: Video Engine & Batch Processing

**Duration**: Weeks 1–3 (after Phase A + Phase B UI)  
**Objective**: FFmpeg integration + parallel frame processing + streaming preview

---

## Week 1: FFmpeg Setup + Frame Extraction

### Day 1–2: FFmpeg-Next Integration

**Add to `Cargo.toml`:**
```toml
ffmpeg-next = "7.0"
tempfile = "3.8"      # For temp frame extraction
```

**Create `src-tauri/src/video/mod.rs`:**
```rust
pub mod decoder;
pub mod encoder;
pub mod frame_processor;

pub use decoder::VideoDecoder;
pub use encoder::VideoEncoder;
pub use frame_processor::BatchFrameProcessor;

pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    pub fps: f32,
    pub duration_seconds: f32,
    pub frame_count: u32,
    pub codec: String,
    pub pixel_format: String,
}
```

**Create `src-tauri/src/video/decoder.rs`:**
```rust
use ffmpeg_next as ffmpeg;

pub struct VideoDecoder {
    input: ffmpeg::format::context::Input,
    video_stream_index: usize,
}

impl VideoDecoder {
    pub fn open(path: &str) -> Result<Self, String> {
        ffmpeg::init().map_err(|e| e.to_string())?;
        
        let input = ffmpeg::format::input(&path)
            .map_err(|e| format!("Failed to open video: {}", e))?;
        
        let video_stream_index = input
            .streams()
            .best(ffmpeg::media::Type::Video)
            .ok_or("No video stream found")?
            .index();
        
        Ok(Self { input, video_stream_index })
    }
    
    pub fn get_info(&self) -> Result<VideoInfo, String> {
        let stream = self.input
            .stream(self.video_stream_index)
            .ok_or("Stream not found")?;
        
        let codec = stream.codec();
        let width = codec.width();
        let height = codec.height();
        let fps = (stream.rate().numerator as f32) / (stream.rate().denominator as f32);
        let duration_seconds = (stream.duration() as f32) / (stream.time_base().denominator as f32);
        let frame_count = stream.frames();
        
        Ok(VideoInfo {
            width,
            height,
            fps,
            duration_seconds,
            frame_count: frame_count as u32,
            codec: codec.id().to_string(),
            pixel_format: codec.format().to_string(),
        })
    }
    
    pub fn extract_frame(&mut self, frame_index: u32) -> Result<ImageData, String> {
        // Seek to frame
        let stream = self.input
            .stream(self.video_stream_index)
            .ok_or("Stream not found")?;
        
        let timestamp = (frame_index as i64 * stream.time_base().denominator as i64)
            / stream.rate().numerator as i64;
        
        self.input.seek(timestamp, i64::MIN..=i64::MAX)
            .map_err(|e| format!("Seek failed: {}", e))?;
        
        // Read frame
        for (stream, packet) in self.input.packets() {
            if stream.index() != self.video_stream_index {
                continue;
            }
            
            // Decode packet to frame
            let mut decoder = stream.codec().decoder()
                .map_err(|e| format!("Decoder init failed: {}", e))?;
            
            decoder.send_packet(&packet)
                .map_err(|e| format!("Packet send failed: {}", e))?;
            
            let mut frame = ffmpeg::frame::Video::empty();
            if decoder.receive_frame(&mut frame).is_ok() {
                return Ok(frame_to_imagedata(&frame));
            }
        }
        
        Err("Frame extraction failed".to_string())
    }
    
    pub fn extract_all_frames(&mut self, output_dir: &std::path::Path) -> Result<u32, String> {
        let info = self.get_info()?;
        
        for frame_idx in 0..info.frame_count {
            let image = self.extract_frame(frame_idx)?;
            let path = output_dir.join(format!("frame_{:06}.rgba", frame_idx));
            std::fs::write(&path, &image.data)
                .map_err(|e| format!("Write failed: {}", e))?;
        }
        
        Ok(info.frame_count)
    }
}

fn frame_to_imagedata(frame: &ffmpeg::frame::Video) -> ImageData {
    let width = frame.width();
    let height = frame.height();
    let data = frame.data(0).to_vec(); // Assuming RGBA
    
    ImageData { width, height, data }
}
```

**Output**: FFmpeg decoder ready, frame extraction working

---

### Day 3–5: Batch Frame Processor

**Create `src-tauri/src/video/frame_processor.rs`:**
```rust
use rayon::prelude::*;

pub struct BatchFrameProcessor {
    pipeline: Arc<PipelineWithCache>,
    frame_dir: PathBuf,
    output_dir: PathBuf,
    frame_count: u32,
    workers: usize, // Thread pool size
}

impl BatchFrameProcessor {
    pub fn new(
        pipeline: PipelineWithCache,
        frame_dir: PathBuf,
        output_dir: PathBuf,
        frame_count: u32,
    ) -> Self {
        let workers = num_cpus::get();
        Self {
            pipeline: Arc::new(pipeline),
            frame_dir,
            output_dir,
            frame_count,
            workers,
        }
    }
    
    pub fn process_all<F>(&self, mut on_progress: F) -> Result<(), String>
    where
        F: FnMut(u32, u32), // (current_frame, total)
    {
        // Read all frame paths
        let frame_paths: Vec<_> = (0..self.frame_count)
            .map(|i| self.frame_dir.join(format!("frame_{:06}.rgba", i)))
            .collect();
        
        // Process in parallel
        frame_paths
            .par_iter()
            .enumerate()
            .try_for_each(|(idx, path)| {
                let image_data = load_imagedata_from_file(path)?;
                let ctx = FrameContext::new(idx as u32, self.frame_count);
                
                let processed = self.pipeline.execute(image_data, &ctx)?;
                
                let output_path = self.output_dir.join(format!("frame_{:06}.rgba", idx));
                std::fs::write(&output_path, &processed.data)
                    .map_err(|e| format!(\"Write failed: {}\", e))?;
                
                // Callback for progress
                on_progress(idx as u32, self.frame_count);
                
                Ok::<_, String>(())
            })?;
        
        Ok(())
    }
    
    pub fn process_range(&self, start: u32, end: u32) -> Result<(), String> {
        // For partial re-rendering (UI preview mode)
        for frame_idx in start..end {
            let path = self.frame_dir.join(format!(\"frame_{:06}.rgba\", frame_idx));
            let image_data = load_imagedata_from_file(&path)?;
            let ctx = FrameContext::new(frame_idx, self.frame_count);
            
            let processed = self.pipeline.execute(image_data, &ctx)?;
            
            let output_path = self.output_dir.join(format!(\"frame_{:06}.rgba\", frame_idx));
            std::fs::write(&output_path, &processed.data)
                .map_err(|e| format!(\"Write failed: {}\", e))?;
        }
        Ok(())
    }
}
```

**Output**: Parallel batch processing with per-frame caching

---

## Week 2: Encoder + Video Assembly

### Day 1–3: FFmpeg Video Encoder

**Create `src-tauri/src/video/encoder.rs`:**
```rust
pub struct VideoEncoder {
    output_path: PathBuf,
    fps: f32,
    codec: String, // \"h264\", \"h265\", \"vp9\"
    bitrate: String, // \"5M\", \"10M\", etc.
}

impl VideoEncoder {
    pub fn new(output_path: PathBuf, fps: f32) -> Self {
        Self {
            output_path,
            fps,
            codec: \"h264\".to_string(),
            bitrate: \"5M\".to_string(),
        }
    }
    
    pub fn encode_from_frames(
        &self,
        frame_dir: &PathBuf,
        frame_count: u32,
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        let pattern = frame_dir.join(\"frame_%06d.rgba\");
        
        // ffmpeg -framerate 30 -i frame_%06d.rgba -c:v libx264 -pix_fmt yuv420p output.mp4
        std::process::Command::new(\"ffmpeg\")
            .arg(\"-framerate\")
            .arg(self.fps.to_string())
            .arg(\"-i\")
            .arg(pattern.to_string_lossy().to_string())
            .arg(\"-vf\")
            .arg(format!(\"format=yuv420p,scale={}:{}\", width, height))
            .arg(\"-c:v\")
            .arg(&self.codec)
            .arg(\"-b:v\")
            .arg(&self.bitrate)
            .arg(&self.output_path)
            .output()
            .map_err(|e| format!(\"ffmpeg failed: {}\", e))?;
        
        Ok(())
    }
    
    pub fn create_gif(&self, frame_dir: &PathBuf, frame_count: u32) -> Result<(), String> {
        // ffmpeg -framerate 30 -i frame_%06d.rgba output.gif
        std::process::Command::new(\"ffmpeg\")
            .arg(\"-framerate\")
            .arg(self.fps.to_string())
            .arg(\"-i\")
            .arg(frame_dir.join(\"frame_%06d.rgba\").to_string_lossy().to_string())
            .arg(&self.output_path)
            .output()
            .map_err(|e| format!(\"gif creation failed: {}\", e))?;
        
        Ok(())
    }
}
```

**Output**: MP4 + GIF video export

---

### Day 4–5: Tauri Video Commands

**Create `src-tauri/src/commands/video.rs`:**
```rust
pub struct VideoJob {
    pub id: String,
    pub status: JobStatus, // \"running\", \"completed\", \"failed\"
    pub current_frame: u32,
    pub total_frames: u32,
    pub start_time: std::time::Instant,
}

static JOBS: Mutex<HashMap<String, VideoJob>> = Mutex::new(HashMap::new());

#[tauri::command]
pub async fn process_video_start(
    video_path: String,
    algorithm: String,
    palette_name: String,
    intensity: f32,
    output_format: String, // \"mp4\", \"gif\", \"png_sequence\"
) -> Result<String, String> {
    let job_id = uuid::Uuid::new_v4().to_string();
    
    // Spawn async task
    tokio::spawn(async move {
        let temp_dir = tempfile::tempdir()
            .map_err(|e| format!(\"Temp dir failed: {}\", e))?;
        
        // Decode video
        let mut decoder = VideoDecoder::open(&video_path)?;
        let info = decoder.get_info()?;
        decoder.extract_all_frames(temp_dir.path())?;
        
        // Build pipeline
        let palette = AlgorithmRegistry::get_palette(&palette_name)?;
        let effect = AlgorithmRegistry::create(&algorithm, palette, intensity)?;
        let pipeline = PipelineWithCache::new(vec![effect]);
        
        // Process frames
        let processor = BatchFrameProcessor::new(
            pipeline,
            temp_dir.path().to_path_buf(),
            temp_dir.path().join(\"output\"),
            info.frame_count,
        );
        
        processor.process_all(|current, total| {
            // Update job progress
            if let Ok(mut jobs) = JOBS.lock() {
                if let Some(job) = jobs.get_mut(&job_id) {
                    job.current_frame = current;
                }
            }
        })?;
        
        // Encode
        let encoder = VideoEncoder::new(
            PathBuf::from(format!(\"/output/result.{}\", output_format)),
            info.fps,
        );
        match output_format.as_str() {
            \"mp4\" => encoder.encode_from_frames(
                &temp_dir.path().join(\"output\"),
                info.frame_count,
                info.width,
                info.height,
            )?,
            \"gif\" => encoder.create_gif(&temp_dir.path().join(\"output\"), info.frame_count)?,
            _ => return Err(\"Unknown format\".to_string()),
        }
        
        Ok(())
    });
    
    Ok(job_id)
}

#[tauri::command]
pub fn get_video_progress(job_id: String) -> Result<VideoJob, String> {
    JOBS.lock()
        .map_err(|_| \"Lock failed\".to_string())?
        .get(&job_id)
        .cloned()
        .ok_or(\"Job not found\".to_string())
}
```

**Output**: Async video processing with progress tracking

---

## Week 3: Preview Streaming + Optimization

### Day 1–3: Live Preview Stream

**Tauri command for real-time preview:**
```rust
#[tauri::command]
pub async fn stream_preview_frames(
    video_path: String,
    algorithm: String,
    palette_name: String,
    sample_rate: u32, // Process every Nth frame for speed
    window: tauri::Window,
) -> Result<(), String> {
    let mut decoder = VideoDecoder::open(&video_path)?;
    let info = decoder.get_info()?;
    
    for frame_idx in (0..info.frame_count).step_by(sample_rate as usize) {
        let image = decoder.extract_frame(frame_idx)?;
        let ctx = FrameContext::new(frame_idx, info.frame_count);
        
        let effect = AlgorithmRegistry::create(&algorithm, palette, intensity)?;
        let mut pipeline = PipelineWithCache::new(vec![effect]);
        let processed = pipeline.execute(image, &ctx)?;
        
        // Encode as JPEG for network efficiency
        let jpeg_bytes = imagedata_to_jpeg(&processed)?;
        
        // Emit to frontend
        window.emit(\"preview_frame\", PreviewFrame {
            frame_index: frame_idx,
            jpeg_data: base64::encode(&jpeg_bytes),
            processing_ms: elapsed,
        }).map_err(|e| format!(\"Emit failed: {}\", e))?;
    }
    
    Ok(())
}
```

### Day 4–5: Performance Optimization

1. **Frame caching between adjustments**: Skip unchanged frames
2. **Downsampling for preview**: Process at 50% resolution, upscale for display
3. **Worker thread tuning**: Benchmark different thread pool sizes
4. **Memory pooling**: Reuse ImageData allocations instead of cloning

**Output**: Streaming video preview, optimized performance

---

## Success Criteria (End of Phase C)

- ✅ Video import (H.264, H.265, VP9)
- ✅ Frame extraction with accuracy
- ✅ Batch parallel processing
- ✅ Real-time progress tracking
- ✅ MP4 export (H.264/H.265)
- ✅ GIF export
- ✅ Live preview streaming
- ✅ Performance: 4K@30fps achievable with 4-core machine
- ✅ Docs: FFmpeg setup, video processing API

---

## Frontend Integration

```javascript
// Start video processing job
const jobId = await invoke('process_video_start', {
    videoPath: '/path/to/video.mp4',
    algorithm: 'Floyd-Steinberg',
    paletteName: 'GameBoy',
    intensity: 100,
    outputFormat: 'mp4',
});

// Poll progress
const progress = await invoke('get_video_progress', { jobId });
console.log(`Processing: ${progress.currentFrame}/${progress.totalFrames}`);

// Listen for preview frames (while processing)
listen('preview_frame', (event) => {
    const { frameIndex, jpegData, processingMs } = event.payload;
    displayPreview(jpegData);
});
```
