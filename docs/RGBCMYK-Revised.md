# Реалистичный план: RGBA каналы и CMYK Halftone

> Переработан под актуальную архитектуру проекта (Tauri + Rust/ImageEngine + React/TypeScript)

## Текущая архитектура (контекст)

- **Бэкенд**: `ImageData` (RGBA буфер) + трейт `Effect` + `AlgorithmRegistry` для маппинга имя→реализация
- **Фронтенд**: Слои (`Layer`) с `FrameSettings` (42 параметра), передаются в `BackendEffectLayerPayload`
- **Пайплайн**: Слои применяются последовательно через `PipelineWithCache`
- **Сериализация**: Проект сохраняется в `.dyproj` (ZIP + manifest.json)

---

## Этап 1: Панель видимости каналов (Channel Mask)

**Цель**: Включать/отключать отдельные RGBA каналы для просмотра.

**Почему это работает**: Уже есть `ChannelMask` в `video.rs` — логика частично готова.

**Что делать**:

**Фронтенд** (`@/Users/dave/Prahramavannie/dith/classic-canvas-forge/src/types/frameSettings.ts`):
```typescript
export interface FrameSettings {
  // ... существующие поля
  channelMaskR: boolean;  // true = канал виден
  channelMaskG: boolean;
  channelMaskB: boolean;
  channelMaskA: boolean;
}
```

**Бэкенд** (`@/Users/dave/Prahramavannie/dith/classic-canvas-forge/src-tauri/src/image_engine/`):
- Новый модуль `channel_mask.rs` с эффектом `ChannelMask`
- Добавить в `AlgorithmRegistry` как алгоритм "Channel Mask"

**UI**:
- 4 кнопки-тоггла (R, G, B, A) в панели слоя или глобальной панели
- Альфа-канал: при отключении показывать как 255 (непрозрачный)

**Оценка**: 1-2 дня

---

## Этап 2: Инструменты работы с каналами

**Цель**: Инверсия, яркость, копирование каналов.

**Почему это работает**: Это трансформации RGBA — просто меняем байты в буфере.

**Что делать**:

**Бэкенд** (новый модуль `channel_ops.rs`):
```rust
pub struct ChannelInvert { pub channel: u8 }  // 0=R,1=G,2=B,3=A
pub struct ChannelScale { pub channel: u8, pub factor: f32 }
pub struct ChannelCopy { pub src: u8, pub dst: u8 }

impl Effect for ChannelInvert { ... }
```

**Интеграция**: Добавить в `AlgorithmRegistry`:
- "Invert Red", "Invert Green", "Invert Blue", "Invert Alpha"
- "Scale Red/Green/Blue/Alpha" (с параметром `intensity` как множитель)
- "Copy Channel" (src→dst с параметром)

**Фронтенд**:
- Добавить в `FrameSettings`: `invertChannel`, `scaleChannel`, `scaleFactor`
- UI: выпадающие списки + слайдеры в панели слоя

**Оценка**: 2-3 дня

---

## Этап 3: CMYK симуляция (режим просмотра)

**Цель**: Переключатель RGB ↔ CMYK preview (ограниченный охват цветов).

**Почему это работает**: RGB→CMYK→RGB конвертация даёт "приглушённые" цвета без растра.

**Что делать**:

**Бэкенд** (модуль `cmyk.rs`):
```rust
fn rgb_to_cmyk(r: u8, g: u8, b: u8) -> (f32, f32, f32, f32);
fn cmyk_to_rgb(c: f32, m: f32, y: f32, k: f32) -> (u8, u8, u8);

pub struct CmykSimulation;
impl Effect for CmykSimulation {
    // Для каждого пикселя: RGB→CMYK→RGB
}
```

**Интеграция**: Добавить в `AlgorithmRegistry` как "CMYK Simulation"

**Фронтенд**:
- Добавить алгоритм в список дизеринга
- Можно комбинировать с другими эффектами через слои

**Оценка**: 1-2 дня

---

## Этап 4: CMYK Halftone с растром

**Цель**: Настоящий печатный растр с точками и углами сетки.

**Почему это работает**: Можно использовать `rotated-grid` или кастомную реализацию как эффект слоя.

**Что делать**:

**Бэкенд** (расширить `cmyk.rs`):
```rust
pub struct CmykHalftone {
    pub dot_size: u32,
    pub angles: [f32; 4],  // C, M, Y, K angles
    pub shape: HalftoneShape, // Circle, Square, Ellipse
}

impl Effect for CmykHalftone {
    fn apply(&self, image: &mut ImageData, _ctx: &FrameContext) -> Result<(), String> {
        // 1. RGB→CMYK (4 плоскости)
        // 2. Для каждой плоскости генерировать растр
        // 3. Сложить 4 растра в RGB
        Ok(())
    }
}
```

**Параметры в `FrameSettings`**:
```typescript
export interface FrameSettings {
  // ... существующие
  halftoneDotSize: number;
  halftoneAngleC: number;
  halftoneAngleM: number;
  halftoneAngleY: number;
  halftoneAngleK: number;
  halftoneShape: 'circle' | 'square' | 'ellipse';
}
```

**Стандартные углы** (пресеты): C=15°, M=75°, Y=0°, K=45°

**Интеграция**: Добавить в `AlgorithmRegistry` как "CMYK Halftone"

**UI**:
- Панель "Halftone Settings" (показывается только для этого алгоритма)
- Слайдеры: размер точки, 4 угла
- Кнопки пресетов: "Classic", "Round", "Square"

**Оценка**: 1-2 недели (растр — сложная графика)

---

## Этап 5: Сохранение в проекте

**Цель**: Настройки каналов и CMYK сохраняются в `.dyproj`.

**Почему это работает**: Новые поля `FrameSettings` автоматически сериализуются в `manifest.json` через `serde_json::Value` в `Layer.params`.

**Что делать**:

**Бэкенд** (`@/Users/dave/Prahramavannie/dith/classic-canvas-forge/src-tauri/src/project/types.rs`):
- Поля `params: serde_json::Value` в `Layer` уже поддерживают любые параметры
- Дополнительных изменений не требуется

**Фронтенд**:
- Убедиться что новые поля `FrameSettings` попадают в `buildBackendLayersPayload()`

**Оценка**: 0.5 дня (проверка интеграции)

---

## Этап 6: Экспорт CMYK (ограниченный)

**Цель**: Сохранить результат с CMYK halftone.

**Проблема**: Rust-крейт `image` не поддерживает CMYK JPEG/TIFF.

**Решения**:
1. **PNG/TIFF с метаданными** — сохранить как RGB, в комментарии указать "это CMYK-рендер"
2. **4 отдельных grayscale PNG** — C.png, M.png, Y.png, K.png (для профессиональной печати)
3. **Вызов ImageMagick** (если установлен) — `convert c.png m.png y.png k.png -set colorspace CMYK output.jpg`
4. **Отложить** — CMYK экспорт — edge case, большинству пользователей не нужен

**Рекомендация**: Реализовать вариант 2 (4 grayscale PNG) как экспорт-опцию. Это честный CMYK разделённый.

**Оценка**: 1-2 дня

---

## Сводка по срокам

| Этап | Время | Приоритет |
|------|-------|-----------|
| 1. Channel Mask | 1-2 дня | Высокий (просто, полезно) |
| 2. Channel Ops | 2-3 дня | Средний |
| 3. CMYK Simulation | 1-2 дня | Средний |
| 4. CMYK Halftone | 1-2 недели | Высокий (фича-запрос) |
| 5. Сериализация | 0.5 дня | Автоматически |
| 6. Экспорт | 1-2 дня | Низкий |

**Итого**: ~2-3 недели для полной реализации.

---

## Архитектурные принципы

1. **Каналы = свойства слоя**, не глобальное состояние — вписывается в существующую систему слоёв
2. **CMYK = эффект слоя**, не режим просмотра — можно комбинировать с дизерингом, глитчами
3. **Параметры в `FrameSettings`** — автоматическая сериализация, keyframe-анимация работает из коробки
4. **Реестр алгоритмов** — добавляем новые строки в `AlgorithmRegistry::create()` и `list_all()`
