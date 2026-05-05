// Dithering algorithms for image processing

export type DitheringAlgorithm = 
  | "None"
  | "Floyd-Steinberg"
  | "Jarvis-Judice-Ninke"
  | "Sierra"
  | "Atkinson"
  | "Ordered"
  | "Bayer 2x2"
  | "Bayer 4x4"
  | "Bayer 8x8"
  | "Random";

export type ColorPalette = 
  | "Grayscale"
  | "CGA"
  | "EGA"
  | "Gameboy"
  | "C64"
  | "ZX Spectrum"
  | "Apple II"
  | "Custom";

const palettes: Record<ColorPalette, number[][]> = {
  "Grayscale": [
    [0, 0, 0],
    [85, 85, 85],
    [170, 170, 170],
    [255, 255, 255]
  ],
  "CGA": [
    [0, 0, 0],
    [0, 170, 170],
    [170, 0, 170],
    [170, 170, 170],
    [170, 85, 0],
    [85, 255, 85],
    [255, 255, 85],
    [255, 255, 255]
  ],
  "EGA": [
    [0, 0, 0],
    [0, 0, 170],
    [0, 170, 0],
    [0, 170, 170],
    [170, 0, 0],
    [170, 0, 170],
    [170, 85, 0],
    [170, 170, 170],
    [85, 85, 85],
    [85, 85, 255],
    [85, 255, 85],
    [85, 255, 255],
    [255, 85, 85],
    [255, 85, 255],
    [255, 255, 85],
    [255, 255, 255]
  ],
  "Gameboy": [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 15],
    [155, 188, 15]
  ],
  "C64": [
    [0, 0, 0],
    [255, 255, 255],
    [136, 0, 0],
    [170, 255, 238],
    [204, 68, 204],
    [0, 204, 85],
    [0, 0, 170],
    [238, 238, 119],
    [221, 136, 85],
    [102, 68, 0],
    [255, 119, 119],
    [51, 51, 51],
    [119, 119, 119],
    [170, 255, 102],
    [0, 136, 255],
    [187, 187, 187]
  ],
  "ZX Spectrum": [
    [0, 0, 0],
    [0, 0, 215],
    [215, 0, 0],
    [215, 0, 215],
    [0, 215, 0],
    [0, 215, 215],
    [215, 215, 0],
    [215, 215, 215]
  ],
  "Apple II": [
    [0, 0, 0],
    [114, 38, 64],
    [64, 51, 127],
    [228, 52, 254],
    [14, 89, 64],
    [128, 128, 128],
    [27, 154, 254],
    [191, 179, 255],
    [64, 76, 0],
    [228, 101, 1],
    [128, 128, 128],
    [241, 166, 191],
    [27, 203, 1],
    [191, 204, 128],
    [141, 217, 191],
    [255, 255, 255]
  ],
  "Custom": [[0, 0, 0], [255, 255, 255]]
};

export function getPaletteColors(palette: ColorPalette): number[][] {
  return (palettes[palette] ?? []).map((color) => [color[0], color[1], color[2]]);
}

export function setCustomPalette(hexColors: string[]) {
  palettes["Custom"] = hexColors.map(hex => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result 
      ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
      : [0, 0, 0];
  });
}

function findClosestColor(r: number, g: number, b: number, palette: number[][]): number[] {
  let minDist = Infinity;
  let closest = palette[0];

  for (const color of palette) {
    const dist = Math.sqrt(
      Math.pow(r - color[0], 2) +
      Math.pow(g - color[1], 2) +
      Math.pow(b - color[2], 2)
    );
    if (dist < minDist) {
      minDist = dist;
      closest = color;
    }
  }

  return closest;
}

export function applyDithering(
  imageData: ImageData,
  algorithm: DitheringAlgorithm,
  paletteType: ColorPalette,
  intensity: number = 100,
  customPalette?: [number, number, number][]
): ImageData {
  const palette = paletteType === "Custom" && customPalette && customPalette.length > 0
    ? customPalette
    : palettes[paletteType];
  const { width, height, data } = imageData;
  const output = new ImageData(width, height);
  
  // Copy original data
  for (let i = 0; i < data.length; i++) {
    output.data[i] = data[i];
  }

  const intensityFactor = intensity / 100;

  if (algorithm === "None") {
    return output;
  }

  if (algorithm === "Floyd-Steinberg") {
    return floydSteinberg(output, palette, intensityFactor);
  } else if (algorithm === "Jarvis-Judice-Ninke") {
    return jarvisJudiceNinke(output, palette, intensityFactor);
  } else if (algorithm === "Sierra") {
    return sierra(output, palette, intensityFactor);
  } else if (algorithm === "Atkinson") {
    return atkinson(output, palette, intensityFactor);
  } else if (algorithm === "Ordered") {
    return orderedDither(output, palette, intensityFactor);
  } else if (algorithm === "Bayer 2x2") {
    return bayerDither(output, palette, intensityFactor, 2);
  } else if (algorithm === "Bayer 4x4") {
    return bayerDither(output, palette, intensityFactor, 4);
  } else if (algorithm === "Bayer 8x8") {
    return bayerDither(output, palette, intensityFactor, 8);
  } else if (algorithm === "Random") {
    return randomDither(output, palette, intensityFactor);
  }

  // Default to Floyd-Steinberg for other algorithms
  return floydSteinberg(output, palette, intensityFactor);
}

function floydSteinberg(imageData: ImageData, palette: number[][], intensity: number): ImageData {
  const { width, height, data } = imageData;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = data[idx];
      const oldG = data[idx + 1];
      const oldB = data[idx + 2];

      const [newR, newG, newB] = findClosestColor(oldR, oldG, oldB, palette);

      data[idx] = newR;
      data[idx + 1] = newG;
      data[idx + 2] = newB;

      const errR = (oldR - newR) * intensity;
      const errG = (oldG - newG) * intensity;
      const errB = (oldB - newB) * intensity;

      distributeError(data, width, height, x + 1, y, errR * 7/16, errG * 7/16, errB * 7/16);
      distributeError(data, width, height, x - 1, y + 1, errR * 3/16, errG * 3/16, errB * 3/16);
      distributeError(data, width, height, x, y + 1, errR * 5/16, errG * 5/16, errB * 5/16);
      distributeError(data, width, height, x + 1, y + 1, errR * 1/16, errG * 1/16, errB * 1/16);
    }
  }

  return imageData;
}

function atkinson(imageData: ImageData, palette: number[][], intensity: number): ImageData {
  const { width, height, data } = imageData;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = data[idx];
      const oldG = data[idx + 1];
      const oldB = data[idx + 2];

      const [newR, newG, newB] = findClosestColor(oldR, oldG, oldB, palette);

      data[idx] = newR;
      data[idx + 1] = newG;
      data[idx + 2] = newB;

      const errR = (oldR - newR) * intensity / 8;
      const errG = (oldG - newG) * intensity / 8;
      const errB = (oldB - newB) * intensity / 8;

      distributeError(data, width, height, x + 1, y, errR, errG, errB);
      distributeError(data, width, height, x + 2, y, errR, errG, errB);
      distributeError(data, width, height, x - 1, y + 1, errR, errG, errB);
      distributeError(data, width, height, x, y + 1, errR, errG, errB);
      distributeError(data, width, height, x + 1, y + 1, errR, errG, errB);
      distributeError(data, width, height, x, y + 2, errR, errG, errB);
    }
  }

  return imageData;
}

function orderedDither(imageData: ImageData, palette: number[][], intensity: number): ImageData {
  const { width, height, data } = imageData;
  
  const bayerMatrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const threshold = (bayerMatrix[y % 4][x % 4] / 16 - 0.5) * intensity;

      const r = Math.max(0, Math.min(255, data[idx] + threshold * 32));
      const g = Math.max(0, Math.min(255, data[idx + 1] + threshold * 32));
      const b = Math.max(0, Math.min(255, data[idx + 2] + threshold * 32));

      const [newR, newG, newB] = findClosestColor(r, g, b, palette);

      data[idx] = newR;
      data[idx + 1] = newG;
      data[idx + 2] = newB;
    }
  }

  return imageData;
}

function randomDither(imageData: ImageData, palette: number[][], intensity: number): ImageData {
  const { width, height, data } = imageData;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const noise = (Math.random() - 0.5) * intensity * 64;

      const r = Math.max(0, Math.min(255, data[idx] + noise));
      const g = Math.max(0, Math.min(255, data[idx + 1] + noise));
      const b = Math.max(0, Math.min(255, data[idx + 2] + noise));

      const [newR, newG, newB] = findClosestColor(r, g, b, palette);

      data[idx] = newR;
      data[idx + 1] = newG;
      data[idx + 2] = newB;
    }
  }

  return imageData;
}

function jarvisJudiceNinke(imageData: ImageData, palette: number[][], intensity: number): ImageData {
  const { width, height, data } = imageData;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = data[idx];
      const oldG = data[idx + 1];
      const oldB = data[idx + 2];

      const [newR, newG, newB] = findClosestColor(oldR, oldG, oldB, palette);

      data[idx] = newR;
      data[idx + 1] = newG;
      data[idx + 2] = newB;

      const errR = (oldR - newR) * intensity;
      const errG = (oldG - newG) * intensity;
      const errB = (oldB - newB) * intensity;

      distributeError(data, width, height, x + 1, y, errR * 7/48, errG * 7/48, errB * 7/48);
      distributeError(data, width, height, x + 2, y, errR * 5/48, errG * 5/48, errB * 5/48);
      distributeError(data, width, height, x - 2, y + 1, errR * 3/48, errG * 3/48, errB * 3/48);
      distributeError(data, width, height, x - 1, y + 1, errR * 5/48, errG * 5/48, errB * 5/48);
      distributeError(data, width, height, x, y + 1, errR * 7/48, errG * 7/48, errB * 7/48);
      distributeError(data, width, height, x + 1, y + 1, errR * 5/48, errG * 5/48, errB * 5/48);
      distributeError(data, width, height, x + 2, y + 1, errR * 3/48, errG * 3/48, errB * 3/48);
      distributeError(data, width, height, x - 2, y + 2, errR * 1/48, errG * 1/48, errB * 1/48);
      distributeError(data, width, height, x - 1, y + 2, errR * 3/48, errG * 3/48, errB * 3/48);
      distributeError(data, width, height, x, y + 2, errR * 5/48, errG * 5/48, errB * 5/48);
      distributeError(data, width, height, x + 1, y + 2, errR * 3/48, errG * 3/48, errB * 3/48);
      distributeError(data, width, height, x + 2, y + 2, errR * 1/48, errG * 1/48, errB * 1/48);
    }
  }

  return imageData;
}

function sierra(imageData: ImageData, palette: number[][], intensity: number): ImageData {
  const { width, height, data } = imageData;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = data[idx];
      const oldG = data[idx + 1];
      const oldB = data[idx + 2];

      const [newR, newG, newB] = findClosestColor(oldR, oldG, oldB, palette);

      data[idx] = newR;
      data[idx + 1] = newG;
      data[idx + 2] = newB;

      const errR = (oldR - newR) * intensity;
      const errG = (oldG - newG) * intensity;
      const errB = (oldB - newB) * intensity;

      distributeError(data, width, height, x + 1, y, errR * 5/32, errG * 5/32, errB * 5/32);
      distributeError(data, width, height, x + 2, y, errR * 3/32, errG * 3/32, errB * 3/32);
      distributeError(data, width, height, x - 2, y + 1, errR * 2/32, errG * 2/32, errB * 2/32);
      distributeError(data, width, height, x - 1, y + 1, errR * 4/32, errG * 4/32, errB * 4/32);
      distributeError(data, width, height, x, y + 1, errR * 5/32, errG * 5/32, errB * 5/32);
      distributeError(data, width, height, x + 1, y + 1, errR * 4/32, errG * 4/32, errB * 4/32);
      distributeError(data, width, height, x + 2, y + 1, errR * 2/32, errG * 2/32, errB * 2/32);
      distributeError(data, width, height, x - 1, y + 2, errR * 2/32, errG * 2/32, errB * 2/32);
      distributeError(data, width, height, x, y + 2, errR * 3/32, errG * 3/32, errB * 3/32);
      distributeError(data, width, height, x + 1, y + 2, errR * 2/32, errG * 2/32, errB * 2/32);
    }
  }

  return imageData;
}

function bayerDither(imageData: ImageData, palette: number[][], intensity: number, size: number): ImageData {
  const { width, height, data } = imageData;
  
  const bayer2x2 = [
    [0, 2],
    [3, 1]
  ];

  const bayer4x4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  const bayer8x8 = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21]
  ];

  const matrix = size === 2 ? bayer2x2 : size === 4 ? bayer4x4 : bayer8x8;
  const maxValue = size * size;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const threshold = (matrix[y % size][x % size] / maxValue - 0.5) * intensity;

      const r = Math.max(0, Math.min(255, data[idx] + threshold * 64));
      const g = Math.max(0, Math.min(255, data[idx + 1] + threshold * 64));
      const b = Math.max(0, Math.min(255, data[idx + 2] + threshold * 64));

      const [newR, newG, newB] = findClosestColor(r, g, b, palette);

      data[idx] = newR;
      data[idx + 1] = newG;
      data[idx + 2] = newB;
    }
  }

  return imageData;
}

function distributeError(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  errR: number,
  errG: number,
  errB: number
) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  const idx = (y * width + x) * 4;
  data[idx] = Math.max(0, Math.min(255, data[idx] + errR));
  data[idx + 1] = Math.max(0, Math.min(255, data[idx + 1] + errG));
  data[idx + 2] = Math.max(0, Math.min(255, data[idx + 2] + errB));
}

export function applyPixelScale(imageData: ImageData, scale: number): ImageData {
  if (scale <= 1) return imageData;
  
  const { width, height, data } = imageData;
  const newWidth = Math.floor(width / scale);
  const newHeight = Math.floor(height / scale);
  const output = new ImageData(newWidth, newHeight);

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = x * scale;
      const srcY = y * scale;
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (y * newWidth + x) * 4;

      output.data[dstIdx] = data[srcIdx];
      output.data[dstIdx + 1] = data[srcIdx + 1];
      output.data[dstIdx + 2] = data[srcIdx + 2];
      output.data[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return output;
}

export function applyBlur(imageData: ImageData, radius: number): ImageData {
  if (radius === 0) return imageData;
  
  const { width, height, data } = imageData;
  const output = new ImageData(width, height);
  const kernel = Math.floor(radius);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0;

      for (let ky = -kernel; ky <= kernel; ky++) {
        for (let kx = -kernel; kx <= kernel; kx++) {
          const px = x + kx;
          const py = y + ky;

          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
      }

      const idx = (y * width + x) * 4;
      output.data[idx] = r / count;
      output.data[idx + 1] = g / count;
      output.data[idx + 2] = b / count;
      output.data[idx + 3] = data[idx + 3];
    }
  }

  return output;
}

export function applySharpness(imageData: ImageData, amount: number): ImageData {
  if (amount === 0) return imageData;
  
  const { width, height, data } = imageData;
  const output = new ImageData(width, height);
  const factor = amount / 100;

  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let r = 0, g = 0, b = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const weight = kernel[(ky + 1) * 3 + (kx + 1)];
          r += data[idx] * weight;
          g += data[idx + 1] * weight;
          b += data[idx + 2] * weight;
        }
      }

      const idx = (y * width + x) * 4;
      const origR = data[idx];
      const origG = data[idx + 1];
      const origB = data[idx + 2];

      output.data[idx] = Math.max(0, Math.min(255, origR + (r - origR) * factor));
      output.data[idx + 1] = Math.max(0, Math.min(255, origG + (g - origG) * factor));
      output.data[idx + 2] = Math.max(0, Math.min(255, origB + (b - origB) * factor));
      output.data[idx + 3] = data[idx + 3];
    }
  }

  // Copy edges
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const idx = (y * width + x) * 4;
      output.data[idx] = data[idx];
      output.data[idx + 1] = data[idx + 1];
      output.data[idx + 2] = data[idx + 2];
      output.data[idx + 3] = data[idx + 3];
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const idx = (y * width + x) * 4;
      output.data[idx] = data[idx];
      output.data[idx + 1] = data[idx + 1];
      output.data[idx + 2] = data[idx + 2];
      output.data[idx + 3] = data[idx + 3];
    }
  }

  return output;
}

export function applyNoise(imageData: ImageData, amount: number): ImageData {
  if (amount === 0) return imageData;
  
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * amount * 2;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }

  return imageData;
}

type FrontendGlitchParams = {
  glitchType: "None" | "Pixel Sort" | "Block Noise" | "RGB Shift" | "Slice" | "Analog";
  pixelSortMetric: "luma" | "saturation" | "hue" | "rgb-sum";
  pixelSortMask: "all" | "dark" | "light";
  thresholdMin: number;
  thresholdMax: number;
  angle: number;
  sortLength: number;
  blockSize: number;
  chaos: number;
  quantization: number;
  redShiftX: number;
  redShiftY: number;
  greenShiftX: number;
  greenShiftY: number;
  blueShiftX: number;
  blueShiftY: number;
  globalRgbShiftIntensity: number;
  sliceCount: number;
  maxOffset: number;
  randomness: number;
  scanlineThickness: number;
  scanlineGap: number;
  flicker: number;
  curvature: number;
  snapGlitchToPalette: boolean;
  paletteMix: number;
  globalSeed: number;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function seededNoise(seed: number, x: number, y: number): number {
  const value = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + seed * 0.000123) * 43758.5453;
  return value - Math.floor(value);
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const nr = r / 255;
  const ng = g / 255;
  const nb = b / 255;
  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === nr) h = ((ng - nb) / d) % 6;
    else if (max === ng) h = (nb - nr) / d + 2;
    else h = (nr - ng) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function pixelMetric(r: number, g: number, b: number, metric: FrontendGlitchParams["pixelSortMetric"]): number {
  if (metric === "rgb-sum") return r + g + b;
  if (metric === "saturation") return rgbToHsv(r, g, b)[1] * 255;
  if (metric === "hue") return rgbToHsv(r, g, b)[0];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function closestPaletteColor(r: number, g: number, b: number, palette: number[][]): [number, number, number] {
  if (!palette.length) return [r, g, b];
  let best = palette[0] as [number, number, number];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const dr = r - (color[0] ?? 0);
    const dg = g - (color[1] ?? 0);
    const db = b - (color[2] ?? 0);
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = [color[0] ?? 0, color[1] ?? 0, color[2] ?? 0];
    }
  }
  return best;
}

export function applyGlitch(imageData: ImageData, params: FrontendGlitchParams, palette: number[][]): ImageData {
  if (params.glitchType === "None") {
    return imageData;
  }

  const original = new Uint8ClampedArray(imageData.data);
  const out = new ImageData(imageData.width, imageData.height);
  out.data.set(imageData.data);
  const { width, height } = out;
  const data = out.data;

  if (params.glitchType === "RGB Shift") {
    const source = new Uint8ClampedArray(data);
    const intensity = Math.max(0, Math.min(100, params.globalRgbShiftIntensity)) / 100;
    const shifts: Array<[number, number]> = [
      [Math.round(params.redShiftX * intensity), Math.round(params.redShiftY * intensity)],
      [Math.round(params.greenShiftX * intensity), Math.round(params.greenShiftY * intensity)],
      [Math.round(params.blueShiftX * intensity), Math.round(params.blueShiftY * intensity)],
    ];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dst = (y * width + x) * 4;
        for (let c = 0; c < 3; c++) {
          const sx = Math.max(0, Math.min(width - 1, x + shifts[c][0]));
          const sy = Math.max(0, Math.min(height - 1, y + shifts[c][1]));
          const src = (sy * width + sx) * 4;
          data[dst + c] = source[src + c];
        }
      }
    }
  }

  if (params.glitchType === "Slice") {
    const source = new Uint8ClampedArray(data);
    const sliceCount = Math.max(1, Math.floor(params.sliceCount));
    const maxOffset = Math.max(0, Math.floor(params.maxOffset));
    for (let i = 0; i < sliceCount; i++) {
      const startY = Math.floor(seededNoise(params.globalSeed + i, i, height) * height);
      const bandHeight = Math.max(1, Math.floor((seededNoise(params.globalSeed + i * 7, i, 1) * height) / 8));
      const offset = Math.floor((seededNoise(params.globalSeed + i * 17, i, 2) * 2 - 1) * maxOffset);
      for (let y = startY; y < Math.min(height, startY + bandHeight); y++) {
        for (let x = 0; x < width; x++) {
          const sx = Math.max(0, Math.min(width - 1, x + offset));
          const dst = (y * width + x) * 4;
          const src = (y * width + sx) * 4;
          data[dst] = source[src];
          data[dst + 1] = source[src + 1];
          data[dst + 2] = source[src + 2];
        }
      }
    }
  }

  if (params.glitchType === "Block Noise") {
    const source = new Uint8ClampedArray(data);
    const block = Math.max(2, Math.floor(params.blockSize));
    const chaos = Math.max(0, Math.min(100, params.chaos)) / 100;
    const quant = Math.max(0, Math.min(100, params.quantization));
    const levels = Math.max(2, Math.round(32 - (quant / 100) * 30));
    const step = 255 / (levels - 1);
    for (let by = 0; by < height; by += block) {
      for (let bx = 0; bx < width; bx += block) {
        const shiftX = Math.round((seededNoise(params.globalSeed, bx, by) * 2 - 1) * chaos * block * 2);
        const shiftY = Math.round((seededNoise(params.globalSeed + 77, bx, by) * 2 - 1) * chaos * block * 2);
        for (let y = by; y < Math.min(height, by + block); y++) {
          for (let x = bx; x < Math.min(width, bx + block); x++) {
            const sx = Math.max(0, Math.min(width - 1, x + shiftX));
            const sy = Math.max(0, Math.min(height - 1, y + shiftY));
            const src = (sy * width + sx) * 4;
            const dst = (y * width + x) * 4;
            data[dst] = Math.round(source[src] / step) * step;
            data[dst + 1] = Math.round(source[src + 1] / step) * step;
            data[dst + 2] = Math.round(source[src + 2] / step) * step;
          }
        }
      }
    }
  }

  if (params.glitchType === "Pixel Sort") {
    const source = new Uint8ClampedArray(data);
    const min = Math.max(0, Math.min(100, params.thresholdMin)) * 2.55;
    const max = Math.max(0, Math.min(100, params.thresholdMax)) * 2.55;
    const length = Math.max(2, Math.floor(params.sortLength));
    const vertical = Math.abs(((params.angle % 180) + 180) % 180 - 90) < 35;

    const sortSegment = (coords: Array<[number, number]>) => {
      const sortable = coords
        .map(([x, y]) => {
          const idx = (y * width + x) * 4;
          const r = source[idx];
          const g = source[idx + 1];
          const b = source[idx + 2];
          const lum = pixelMetric(r, g, b, "luma");
          const inThreshold = lum >= min && lum <= max;
          const inMask = params.pixelSortMask === "all"
            || (params.pixelSortMask === "dark" && lum < 128)
            || (params.pixelSortMask === "light" && lum >= 128);
          return { x, y, r, g, b, canMove: inThreshold && inMask };
        });

      for (let i = 0; i < sortable.length; i += length) {
        const segment = sortable.slice(i, i + length);
        const movable = segment.filter((entry) => entry.canMove);
        movable.sort((a, b) => pixelMetric(a.r, a.g, a.b, params.pixelSortMetric) - pixelMetric(b.r, b.g, b.b, params.pixelSortMetric));
        let take = 0;
        for (const entry of segment) {
          const idx = (entry.y * width + entry.x) * 4;
          const from = entry.canMove ? movable[take++] : entry;
          data[idx] = from.r;
          data[idx + 1] = from.g;
          data[idx + 2] = from.b;
        }
      }
    };

    if (vertical) {
      for (let x = 0; x < width; x++) {
        sortSegment(Array.from({ length: height }, (_, y) => [x, y] as [number, number]));
      }
    } else {
      for (let y = 0; y < height; y++) {
        sortSegment(Array.from({ length: width }, (_, x) => [x, y] as [number, number]));
      }
    }
  }

  if (params.glitchType === "Analog") {
    const source = new Uint8ClampedArray(data);
    const line = Math.max(1, Math.floor(params.scanlineThickness));
    const gap = Math.max(1, Math.floor(params.scanlineGap));
    const curvature = Math.max(0, Math.min(100, params.curvature)) / 100;
    const flicker = Math.max(0, Math.min(100, params.flicker)) / 100;
    for (let y = 0; y < height; y++) {
      const linePhase = (y % (line + gap)) < line;
      const jitter = Math.round((seededNoise(params.globalSeed + 999, y, 0) * 2 - 1) * 4);
      for (let x = 0; x < width; x++) {
        const edge = (x / Math.max(1, width - 1) - 0.5) * 2;
        const curveShift = Math.round(edge * edge * curvature * 12 * Math.sign(edge));
        const sx = Math.max(0, Math.min(width - 1, x + jitter + curveShift));
        const src = (y * width + sx) * 4;
        const dst = (y * width + x) * 4;
        const dim = linePhase ? 0.72 : 1.0;
        const flick = 1 - flicker * 0.15 + seededNoise(params.globalSeed + 313, x, y) * flicker * 0.15;
        data[dst] = Math.max(0, Math.min(255, source[src] * dim * flick));
        data[dst + 1] = Math.max(0, Math.min(255, source[src + 1] * dim * flick));
        data[dst + 2] = Math.max(0, Math.min(255, source[src + 2] * dim * flick));
      }
    }
  }

  if (params.snapGlitchToPalette && palette.length > 0) {
    const mix = Math.max(0, Math.min(100, params.paletteMix)) / 100;
    for (let i = 0; i < data.length; i += 4) {
      const changed = data[i] !== original[i] || data[i + 1] !== original[i + 1] || data[i + 2] !== original[i + 2];
      if (!changed) {
        continue;
      }
      const [pr, pg, pb] = closestPaletteColor(data[i], data[i + 1], data[i + 2], palette);
      data[i] = Math.round(lerp(data[i], pr, mix));
      data[i + 1] = Math.round(lerp(data[i + 1], pg, mix));
      data[i + 2] = Math.round(lerp(data[i + 2], pb, mix));
    }
  }

  return out;
}

export function adjustImage(
  imageData: ImageData,
  contrast: number,
  brightness: number,
  saturation: number
): ImageData {
  const { data } = imageData;
  const contrastFactor = (contrast / 100);
  const brightnessFactor = (brightness / 100);
  const saturationFactor = (saturation / 100);

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Brightness
    r *= brightnessFactor;
    g *= brightnessFactor;
    b *= brightnessFactor;

    // Contrast
    r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
    g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
    b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;

    // Saturation
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * saturationFactor;
    g = gray + (g - gray) * saturationFactor;
    b = gray + (b - gray) * saturationFactor;

    data[i] = Math.max(0, Math.min(255, r));
    data[i + 1] = Math.max(0, Math.min(255, g));
    data[i + 2] = Math.max(0, Math.min(255, b));
  }

  return imageData;
}
