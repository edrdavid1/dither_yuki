use std::sync::{Arc, Mutex};
use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;

#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
struct Params {
    width: u32,
    height: u32,
    intensity: f32,
    _padding: u32,
}

pub struct GpuProcessor {
    device: wgpu::Device,
    queue: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    // Cached buffers to avoid re-allocation every frame
    cached_input: Mutex<Option<(u64, Arc<wgpu::Buffer>)>>,
    cached_output: Mutex<Option<(u64, Arc<wgpu::Buffer>)>>,
    cached_staging: Mutex<Option<(u64, Arc<wgpu::Buffer>)>>,
}

impl GpuProcessor {
    pub async fn new() -> Result<Self, String> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: None,
                force_fallback_adapter: false,
            })
            .await
            .or_else(|| {
                pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
                    power_preference: wgpu::PowerPreference::LowPower,
                    compatible_surface: None,
                    force_fallback_adapter: false,
                }))
            })
            .ok_or_else(|| "Failed to find any suitable GPU adapter".to_string())?;

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: Some("Dither Yuki GPU Device"),
                    required_features: wgpu::Features::empty(),
                    required_limits: wgpu::Limits::default(),
                },
                None,
            )
            .await
            .map_err(|e| format!("Failed to create GPU device: {}", e))?;

        let shader_source = "
            struct Params {
                width: u32,
                height: u32,
                intensity: f32,
                _padding: u32,
            }

            @group(0) @binding(0) var<uniform> params: Params;
            @group(0) @binding(1) var<storage, read> input_data: array<u32>;
            @group(0) @binding(2) var<storage, read_write> output_data: array<u32>;

            @compute @workgroup_size(16, 16)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                if (global_id.x >= params.width || global_id.y >= params.height) {
                    return;
                }
                let idx = global_id.y * params.width + global_id.x;
                let pixel = input_data[idx];
                
                let r = (pixel >> 0u) & 0xffu;
                let g = (pixel >> 8u) & 0xffu;
                let b = (pixel >> 16u) & 0xffu;
                let a = (pixel >> 24u) & 0xffu;
                
                let luma = (f32(r) * 0.299 + f32(g) * 0.587 + f32(b) * 0.114) / 255.0;
                let final_val = u32(clamp(luma, 0.0, 1.0) * 255.0);
                
                output_data[idx] = (a << 24u) | (final_val << 16u) | (final_val << 8u) | final_val;
            }
        ";

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("GPU Filter Shader"),
            source: wgpu::ShaderSource::Wgsl(shader_source.into()),
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("bind_group_layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
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

        Ok(Self {
            device,
            queue,
            pipeline,
            bind_group_layout,
            cached_input: Mutex::new(None),
            cached_output: Mutex::new(None),
            cached_staging: Mutex::new(None),
        })
    }

    fn get_or_create_buffer(&self, cache: &Mutex<Option<(u64, Arc<wgpu::Buffer>)>>, size: u64, usage: wgpu::BufferUsages) -> Arc<wgpu::Buffer> {
        let mut guard = cache.lock().unwrap();
        if let Some((old_size, buffer)) = guard.as_ref() {
            if *old_size >= size {
                return buffer.clone();
            }
        }
        let buffer = Arc::new(self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("GPU Buffer"),
            size,
            usage,
            mapped_at_creation: false,
        }));
        *guard = Some((size, buffer.clone()));
        buffer
    }

    pub fn process_frame(
        &self,
        width: u32,
        height: u32,
        rgba_input: &[u8],
    ) -> Result<Vec<u8>, String> {
        let size = (width * height * 4) as u64;
        
        let params = Params { width, height, intensity: 1.0, _padding: 0 };
        let params_buffer = self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Params Buffer"),
            contents: bytemuck::cast_slice(&[params]),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let input_buffer = self.get_or_create_buffer(&self.cached_input, size, wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST);
        self.queue.write_buffer(&input_buffer, 0, rgba_input);

        let output_buffer = self.get_or_create_buffer(&self.cached_output, size, wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC);
        let staging_buffer = self.get_or_create_buffer(&self.cached_staging, size, wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST);

        let bind_group = self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("bind_group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry { binding: 0, resource: params_buffer.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 1, resource: input_buffer.as_entire_binding() },
                wgpu::BindGroupEntry { binding: 2, resource: output_buffer.as_entire_binding() },
            ],
        });

        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: Some("Compute Encoder") });
        {
            let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor { label: Some("Compute Pass"), timestamp_writes: None });
            compute_pass.set_pipeline(&self.pipeline);
            compute_pass.set_bind_group(0, &bind_group, &[]);
            compute_pass.dispatch_workgroups((width + 15) / 16, (height + 15) / 16, 1);
        }
        encoder.copy_buffer_to_buffer(&output_buffer, 0, &staging_buffer, 0, size);
        self.queue.submit(Some(encoder.finish()));

        let buffer_slice = staging_buffer.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |v| sender.send(v).unwrap());

        self.device.poll(wgpu::Maintain::Wait);

        if let Ok(Ok(())) = receiver.recv() {
            let data = buffer_slice.get_mapped_range();
            let result = data.to_vec();
            drop(data);
            staging_buffer.unmap();
            Ok(result)
        } else {
            Err("Failed to map staging buffer".to_string())
        }
    }
}
