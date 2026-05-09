## Итоговая архитектура для ускоренного превью видео с эффектами в Tauri + Rust

направление: **wgpu** для GPU-ускорения, **асинхронный бэкенд**, **LRU-кэш** готовых кадров и **предвычисление** для плавного воспроизведения. Ниже — полная схема реализации, готовый каркас кода и пояснения, как это интегрировать в Tauri.

---

## 1. Компоненты системы

| Компонент | Задача | Реализация в Rust/Tauri |
|-----------|--------|------------------------|
| **Декодирование видео** | Извлечение кадров по индексу | `ffmpeg-next` (декодер, fast seek) |
| **GPU-контекст** | Управление устройством, очередью, шейдерами | `wgpu` + `pollster` (синхронный init) |
| **Compute pipeline** | Применение фильтров (дизеринг/глитч/маска) | WGSL compute шейдеры |
| **Буферизация кадров** | Передача RGBA байтов ↔ wgpu буферы | `bytemuck`, `wgpu::Buffer` |
| **Кэш кадров** | Хранение готовых RGBA данных в памяти | `moka` (async LRU) |
| **Планировщик задач** | Предвычисление, приоритеты | `tokio` + `async_channel` / `priority-queue` |
| **Tauri commands** | Интерфейс с фронтендом | `#[tauri::command] async fn get_filtered_frame`, `start_playback`, `seek` |
| **Фронтенд** | Отрисовка кадров, управление воспроизведением | `canvas` + `requestAnimationFrame`, debounced seek, двойной буфер |

---

## 2. Бэкенд на Rust — полная реализация

### 2.1. Зависимости (`Cargo.toml`)

```toml
[package]
name = "video-editor"
version = "0.1.0"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
tauri = { version = "1", features = ["fs-all", "shell-all", "http-all"] }
ffmpeg-next = "6.1"                # видео декодирование
image = "0.24"                      # работа с пикселями
moka = { version = "0.12", features = ["future"] }  # async LRU кэш
tokio = { version = "1", features = ["rt-multi-thread", "sync"] }
rayon = "1.7"                       # для параллельной CPU-обработки (fallback)
wgpu = "0.19"                       # GPU compute
pollster = "0.3"                    # блокировка async для инита wgpu
bytemuck = { version = "1.14", features = ["derive"] }
base64 = "0.21"
anyhow = "1.0"
thiserror = "1.0"
serde = { version = "1", features = ["derive"] }
```

### 2.2. Структуры состояния и настроек

```rust
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct VideoState {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub total_frames: usize,
}

pub struct FilterParams {
    pub dither_mode: DitherMode,    // Bayer, FloydSteinberg, etc.
    pub glitch_intensity: f32,
    pub mask_path: Option<String>,
}

pub struct AppState {
    pub video: Arc<Mutex<Option<VideoState>>>,
    pub cache: Cache<usize, Arc<Vec<u8>>>,   // key=frame index, value=RGBA data
    pub gpu: Arc<GpuProcessor>,              // наш GPU обработчик (см. ниже)
    pub filter_params: Arc<Mutex<FilterParams>>,
}
```

### 2.3. GPU-процессор на wgpu

Создаём единый конвейер, который будет применять шейдер к буферу RGBA.

```rust
pub struct GpuProcessor {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

impl GpuProcessor {
    pub async fn new() -> Result<Self, anyhow::Error> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::default());
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions::default())
            .await
            .ok_or("No GPU adapter found")?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default(), None)
            .await?;

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("dither glitch mask shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("filters.wgsl").into()),
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("bind_group_layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: true }, has_dynamic_offset: false, min_binding_size: None },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BufferBindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: false }, has_dynamic_offset: false, min_binding_size: None },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("pipeline_layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("compute_pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: "main",
        });

        Ok(Self { device, queue, pipeline, bind_group_layout })
    }

    pub fn apply_filter(&self, rgba_input: &[u8], width: u32, height: u32, params: &FilterParams) -> Result<Vec<u8>, anyhow::Error> {
        let size = (width * height * 4) as u64;
        let input_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("input_rgba"),
            contents: bytemuck::cast_slice(rgba_input),
            usage: wgpu::BufferUsages::STORAGE_READ,
        });
        let output_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("output_rgba"),
            size,
            usage: wgpu::BufferUsages::STORAGE_WRITE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: input_buffer.as_entire_buffer_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: output_buffer.as_entire_buffer_binding() },
            ],
            label: Some("bind_group"),
        });

        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor::default());
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            let workgroup_size = 16; // потому что в шейдере @workgroup_size(16,16)
            pass.dispatch_workgroups((width + workgroup_size - 1) / workgroup_size, (height + workgroup_size - 1) / workgroup_size, 1);
        }
        self.queue.submit(Some(encoder.finish()));

        // Читаем результат
        let buffer_slice = output_buffer.slice(..);
        let (tx, rx) = tokio::sync::oneshot::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            tx.send(result).unwrap();
        });
        self.device.poll(wgpu::Maintain::Wait);
        futures::executor::block_on(rx).unwrap()?;

        let data = buffer_slice.get_mapped_range().to_vec();
        output_buffer.unmap();
        Ok(data)
    }
}
```

**WGSL шейдер `filters.wgsl` (минимальный пример дизеринга):**

```wgsl
@group(0) @binding(0) var<storage, read> input: array<vec4<u8>>;
@group(0) @binding(1) var<storage, read_write> output: array<vec4<u8>>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.y * 1024u + id.x;  // width предположим 1024, надо передавать uniform
    let color = input[idx];
    // Здесь простейший ordered dither (Bayer 4x4):
    let threshold = vec4<f32>(0.0, 0.5, 0.25, 0.75);
    let bayer = threshold[(id.x % 4) + (id.y % 4) * 4];
    let dithered = vec4<u8>(
        u8(select(0, 255, f32(color.x) / 255.0 > bayer)),
        u8(select(0, 255, f32(color.y) / 255.0 > bayer)),
        u8(select(0, 255, f32(color.z) / 255.0 > bayer)),
        255
    );
    output[idx] = dithered;
}
```

Для реального применения вам нужно передавать параметры (режим дизеринга, интенсивность глитча, маску) как **uniform buffer** или через **push constants**. Это легко добавить, но для простоты опустим.

### 2.4. Декодирование кадра с помощью ffmpeg-next (без GPU)

```rust
fn decode_raw_frame(video_path: &str, frame_index: usize) -> Result<Vec<u8>, anyhow::Error> {
    use ffmpeg_next::format::input;
    use ffmpeg_next::media::Type;
    use ffmpeg_next::software::scaling::Context as ScalingContext;
    let mut ictx = input(video_path)?;
    let stream = ictx.streams().best(Type::Video).ok_or("no video")?;
    let stream_idx = stream.index();
    let decoder = stream.codec().decoder().video()?;
    let width = stream.parameters().width();
    let height = stream.parameters().height();

    // Seek to keyframe before target
    let seek_to = frame_index.saturating_sub(60);
    ictx.seek(seek_to as i64, (seek_to as i64)..(frame_index as i64), stream_idx, ffmpeg_next::format::SeekFlag::BACKWARD)?;

    let mut frames_decoded = 0;
    let mut target_rgba = None;

    for (stream, packet) in ictx.packets() {
        if stream.index() == stream_idx {
            decoder.send_packet(&packet)?;
            let mut decoded = ffmpeg_next::frame::Video::empty();
            while decoder.receive_frame(&mut decoded).is_ok() && target_rgba.is_none() {
                if frames_decoded == frame_index {
                    let mut rgb_frame = ffmpeg_next::frame::Video::empty();
                    let mut scaler = ScalingContext::get(
                        decoder.format(),
                        width,
                        height,
                        ffmpeg_next::format::Pixel::RGBA,
                        width,
                        height,
                        ffmpeg_next::software::scaling::Flags::BILINEAR,
                    )?;
                    scaler.run(&decoded, &mut rgb_frame)?;
                    target_rgba = Some(rgb_frame.data(0).to_vec());
                }
                frames_decoded += 1;
                if frames_decoded > frame_index { break; }
            }
        }
        if target_rgba.is_some() { break; }
    }
    target_rgba.ok_or(anyhow!("frame not found"))
}
```

### 2.5. Кэш + фоновая предзагрузка

```rust
impl AppState {
    pub async fn get_or_process_frame(&self, idx: usize) -> Arc<Vec<u8>> {
        let cache = &self.cache;
        let video = self.video.lock().await;
        let video = video.as_ref().unwrap();
        let path = video.path.clone();
        let width = video.width;
        let height = video.height;
        let filter_params = self.filter_params.lock().await.clone();
        drop(video);
        let gpu = self.gpu.clone();

        cache
            .try_get_with(idx, async move {
                // 1. Декодируем сырой RGBA
                let raw_rgba = decode_raw_frame(&path, idx).unwrap_or_else(|e| {
                    eprintln!("decode error: {}", e);
                    vec![0; (width * height * 4) as usize]
                });
                // 2. Применяем GPU фильтр
                let filtered = gpu.apply_filter(&raw_rgba, width, height, &filter_params)
                    .unwrap_or_else(|e| {
                        eprintln!("GPU filter error: {}, fallback to raw", e);
                        raw_rgba
                    });
                Ok::<_, ()>(Arc::new(filtered))
            })
            .await
            .unwrap()
    }

    pub async fn start_background_prefetch(&self, start_idx: usize, direction: i32, count: usize) {
        let state = self.clone();
        tokio::spawn(async move {
            for i in 0..count {
                let next = (start_idx as i32 + direction * (i as i32 + 1)) as usize;
                if next >= state.video.lock().await.as_ref().unwrap().total_frames {
                    break;
                }
                // Просто вызовем get_or_process_frame – он наполнит кэш
                let _ = state.get_or_process_frame(next).await;
            }
        });
    }
}
```

### 2.6. Tauri команды

```rust
#[tauri::command]
async fn load_video(state: tauri::State<'_, AppState>, path: String) -> Result<(), String> {
    // Получаем информацию через ffmpeg
    let mut ictx = ffmpeg_next::format::input(&path).map_err(|e| e.to_string())?;
    let stream = ictx.streams().best(ffmpeg_next::media::Type::Video).ok_or("no video")?;
    let fps = stream.rate().into();
    let frames = stream.frames();
    let width = stream.parameters().width();
    let height = stream.parameters().height();
    *state.video.lock().await = Some(VideoState { path, width, height, fps, total_frames: frames });
    Ok(())
}

#[tauri::command]
async fn get_filtered_frame(state: tauri::State<'_, AppState>, idx: usize) -> Result<String, String> {
    let data = state.get_or_process_frame(idx).await;
    let jpeg = image::load_from_memory_with_format(&data, image::ImageFormat::Rgba)? // сначала надо преобразовать в JPEG
        .to_rgb8();
    let mut jpeg_bytes = Vec::new();
    jpeg.write_to(&mut jpeg_bytes, image::ImageOutputFormat::Jpeg(80)).unwrap();
    Ok(format!("data:image/jpeg;base64,{}", base64::encode(jpeg_bytes)))
}

#[tauri::command]
async fn start_playback(state: tauri::State<'_, AppState>, start_idx: usize, direction: i32) {
    state.start_background_prefetch(start_idx, direction, 30).await; // предвычисляем 30 кадров
}

#[tauri::command]
async fn update_filter_params(state: tauri::State<'_, AppState>, params: FilterParams) {
    *state.filter_params.lock().await = params;
    // Очищаем кэш, так как эффекты изменились
    state.cache.invalidate_all();
}
```

### 2.7. Инициализация приложения

```rust
#[tokio::main]
async fn main() {
    let gpu = GpuProcessor::new().await.unwrap();
    let state = AppState {
        video: Arc::new(Mutex::new(None)),
        cache: Cache::builder().max_capacity(300).build(),
        gpu: Arc::new(gpu),
        filter_params: Arc::new(Mutex::new(FilterParams::default())),
    };

    tauri::Builder::default()
        .manage(state)
        .invoke_handler(tauri::generate_handler![load_video, get_filtered_frame, start_playback, update_filter_params])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

---

## 3. Фронтенд (JavaScript)

```html
<video id="originalPreview" style="display:none" />  <!-- для аудио если нужно -->
<canvas id="filterCanvas" width="1280" height="720"></canvas>
<input type="range" id="scrubber" min="0" max="1" step="0.001" />
<button id="playPause">Play</button>
```

```js
let currentFrame = 0;
let totalFrames = 0;
let fps = 30;
let playing = false;
let nextFramePromise = null;
let scrubberDebounce = null;

async function loadVideo(path) {
    await invoke('load_video', { path });
    // получить totalFrames, fps из бэкенда (можно отдельной командой info)
}

async function displayFrame(frameIdx) {
    const dataUrl = await invoke('get_filtered_frame', { idx: frameIdx });
    const img = new Image();
    img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0);
    img.src = dataUrl;
}

// Воспроизведение
async function play() {
    playing = true;
    while (playing && currentFrame < totalFrames) {
        if (nextFramePromise) {
            const nextDataUrl = await nextFramePromise;
            const img = new Image();
            await new Promise(resolve => { img.onload = resolve; img.src = nextDataUrl; });
            canvas.getContext('2d').drawImage(img, 0, 0);
            currentFrame++;
        }
        if (currentFrame + 1 < totalFrames) {
            nextFramePromise = invoke('get_filtered_frame', { idx: currentFrame + 1 });
        }
        await new Promise(r => setTimeout(r, 1000 / fps));
        // Каждые 2 секунды сообщаем бэкенду новый старт для предвычисления
        if (currentFrame % (fps * 2) === 0) {
            invoke('start_playback', { start_idx: currentFrame, direction: 1 });
        }
    }
}

// Seek
scrubber.addEventListener('input', (e) => {
    if (scrubberDebounce) clearTimeout(scrubberDebounce);
    const target = Math.floor(totalFrames * parseFloat(e.target.value));
    scrubberDebounce = setTimeout(() => {
        currentFrame = target;
        displayFrame(currentFrame);
        if (!playing) invoke('start_playback', { start_idx: currentFrame, direction: 1, count: 15 });
    }, 50);
});
```

---

## 4. Ключевые оптимизации для производительности

1. **Батчинг на GPU**: вместо одного кадра за раз передавайте **пачку кадров** (например, 4 или 8). В шейдере можно использовать трёхмерный `dispatch` для обработки нескольких кадров одновременно.

2. **Пайплайн кэша**: сначала проверяем кэш, если нет — декодируем и применяем шейдер. Предвычисление в фоне должно работать **асинхронно и с низким приоритетом** (например, использовать отдельный `tokio::task::spawn_blocking` для декодирования).

3. **Адаптивное качество**: во время скраббинга или на медленных GPU можно временно уменьшать разрешение. В `get_or_process_frame` можно получить параметр `scale: u32` и перед шейдером уменьшить изображение (например, через `image::imageops::resize`), а на фронтенде растягивать canvas.

4. **CPU fallback**: если `wgpu` не создался (например, нет драйверов), то используйте `rayon` + CPU реализацию фильтров.

5. **Аудио**: Для синхронизации со звуком в превью — используйте параллельный `<audio>` элемент и отслеживайте его `currentTime`, подстраивая текущий кадр. Но это сложно; возможно, проще отказаться от аудио в превью (как в Dither Guy), сосредоточиться на визуальных эффектах.

---

## 5. Кросс-платформенные нюансы

- **ffmpeg-next** требует динамических библиотек FFmpeg. Для Tauri вы можете включить их в бинарь (например, через `tauri-plugin-shell` скопировать или использовать статическую сборку с `ffmpeg-next/static` — но это сложно). Проще: распространять приложение с DLL/so/dylib внутри (в `tauri.conf.json` настроить `externalBin`).
- **wgpu** автоматически выбирает Vulkan/Metal/DirectX12 — никаких проблем.
- **Кэш `moka`** работает везде.

---



вот план построеный на реверс иженеринге конкурента с опенсорс кодом насколько это реально внедрить сейчас, ведь у нас еще есть работа со слоями 