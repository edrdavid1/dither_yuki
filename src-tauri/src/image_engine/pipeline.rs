// Effect pipeline with layer caching

use std::collections::HashMap;

use super::context::FrameContext;
use super::types::{Effect, ImageData};

pub struct PipelineWithCache {
    effects: Vec<Box<dyn Effect>>,
    cache: HashMap<usize, ImageData>,
}

#[cfg(test)]
mod tests {
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    use super::*;

    struct AddRedEffect {
        amount: u8,
        calls: Arc<AtomicUsize>,
        label: &'static str,
    }

    impl Effect for AddRedEffect {
        fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            for idx in (0..image.data.len()).step_by(4) {
                image.data[idx] = image.data[idx].saturating_add(self.amount);
            }
            Ok(())
        }

        fn name(&self) -> &str {
            self.label
        }
    }

    #[test]
    fn execute_caches_all_layers() {
        let calls1 = Arc::new(AtomicUsize::new(0));
        let calls2 = Arc::new(AtomicUsize::new(0));

        let effects: Vec<Box<dyn Effect>> = vec![
            Box::new(AddRedEffect {
                amount: 10,
                calls: calls1.clone(),
                label: "e1",
            }),
            Box::new(AddRedEffect {
                amount: 20,
                calls: calls2.clone(),
                label: "e2",
            }),
        ];

        let mut pipeline = PipelineWithCache::new(effects);
        let image = ImageData::from_rgba(1, 1, vec![0, 0, 0, 255]);
        let ctx = FrameContext::static_frame();

        let out = pipeline.execute(image, &ctx).expect("pipeline execute should succeed");

        assert_eq!(out.data[0], 30);
        assert_eq!(calls1.load(Ordering::SeqCst), 1);
        assert_eq!(calls2.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn execute_from_layer_reuses_previous_cache() {
        let calls1 = Arc::new(AtomicUsize::new(0));
        let calls2 = Arc::new(AtomicUsize::new(0));

        let effects: Vec<Box<dyn Effect>> = vec![
            Box::new(AddRedEffect {
                amount: 10,
                calls: calls1.clone(),
                label: "e1",
            }),
            Box::new(AddRedEffect {
                amount: 20,
                calls: calls2.clone(),
                label: "e2",
            }),
        ];

        let mut pipeline = PipelineWithCache::new(effects);
        let image = ImageData::from_rgba(1, 1, vec![0, 0, 0, 255]);
        let ctx = FrameContext::new(0, 1);

        pipeline
            .execute(image.clone(), &ctx)
            .expect("initial execute should succeed");
        let out = pipeline
            .execute_from_layer(image, 1, &ctx)
            .expect("execute from layer should succeed");

        assert_eq!(out.data[0], 30);
        assert_eq!(calls1.load(Ordering::SeqCst), 1, "layer 0 should be reused from cache");
        assert_eq!(calls2.load(Ordering::SeqCst), 2, "layer 1 should re-run once");
    }
}

impl PipelineWithCache {
    pub fn new(effects: Vec<Box<dyn Effect>>) -> Self {
        Self {
            effects,
            cache: HashMap::new(),
        }
    }

    pub fn execute(&mut self, image: ImageData, ctx: &FrameContext) -> Result<ImageData, String> {
        self.cache.clear();

        let mut result = image;
        for (idx, effect) in self.effects.iter().enumerate() {
            effect.apply(&mut result, ctx)?;
            self.cache.insert(idx, result.clone());
        }

        Ok(result)
    }

    pub fn execute_from_layer(
        &mut self,
        image: ImageData,
        start_layer: usize,
        ctx: &FrameContext,
    ) -> Result<ImageData, String> {
        if self.effects.is_empty() {
            return Ok(image);
        }

        if start_layer >= self.effects.len() {
            return Err(format!(
                "start_layer {} out of bounds for {} effects",
                start_layer,
                self.effects.len()
            ));
        }

        let effective_start = if start_layer == 0 {
            0
        } else if self.cache.contains_key(&(start_layer - 1)) {
            start_layer
        } else {
            0
        };

        let mut current = if effective_start == 0 {
            image
        } else {
            self.cache
                .get(&(effective_start - 1))
                .cloned()
                .unwrap_or(image)
        };

        for idx in effective_start..self.effects.len() {
            self.effects[idx].apply(&mut current, ctx)?;
            self.cache.insert(idx, current.clone());
        }

        Ok(current)
    }

    pub fn clear_cache_from(&mut self, start_layer: usize) {
        self.cache.retain(|idx, _| *idx < start_layer);
    }

    pub fn effects_len(&self) -> usize {
        self.effects.len()
    }
}
