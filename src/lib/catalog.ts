export const DITHERING_ALGORITHM_NAMES = [
  "None",
  "Floyd-Steinberg",
  "Atkinson",
  "Jarvis-Judice-Ninke",
  "Sierra",
  "Stucki",
  "Burkes",
  "Two-Row Sierra",
  "False Floyd-Steinberg",
  "Shiau Fan",
  "Sierra Lite",
  "Bayer 2x2",
  "Bayer 4x4",
  "Bayer 8x8",
  "Blue Noise",
  "Void-and-Cluster",
  "Clustered Halftone",
  "Dispersed Halftone",
  "Fast Gaussian Blur",
  "Diagonal Line",
  "Cross Hatch",
  "Circle Halftone",
  "Square Halftone",
  "Triangle Wave",
  "Hexagon Grid",
  "Spiral",
  "Color Shift",
  "RGB Shift",
  "Block Corruption",
  "Line Glitch",
  "Bit Corruption",
  "Quantize Glitch",
  "Chromatic Aberration",
  "Line Repeat",
  "Pixel Swap",
  "Noise Injection",
  "Stripe",
  "Pixel Shift",
  "Compress Artifact",
  "Interlace",
  "Posterize",
  "Dither Mix",
  "Temporal",
  "Warp",
  "Pixel Sort",
  "JPEG Artifacts",
  "Perlin Dither",
  "Stipple",
  "Hatching",
  "Watercolor-like",
  "Ink Bleed",
  "Threshold Only",
  "Gradient Map",
  "Halftone Angle",
  "Edge Dither",
  "Wavelet Dither",
  "Voronoi",
  "Scanline",
  "Bloom",
  "Bloom Dither",
  "Marble",
  "Epsilon Glow",
  "Subpixel Layout",
  "Scanlines with Softness",
] as const;

export type SupportedDitheringAlgorithm = typeof DITHERING_ALGORITHM_NAMES[number];
export type DitheringAlgorithm = SupportedDitheringAlgorithm | "Ordered" | "Random";

export const DITHERING_ALGORITHMS: SupportedDitheringAlgorithm[] = [...DITHERING_ALGORITHM_NAMES];

export const COLOR_PALETTE_NAMES = [
  "Grayscale",
  "Grayscale 2",
  "Grayscale 4",
  "Grayscale 8",
  "Grayscale 16",
  "CGA",
  "EGA",
  "GameBoy",
  "ZX Spectrum",
  "Commodore 64",
  "Apple II",
  "VGA 16",
  "Windows 3.11",
  "Master System",
  "Sega Genesis",
  "SNES",
  "Vaporwave",
  "Cyberpunk",
  "Sepia",
  "Vintage Film",
  "Noir",
  "Synth Sunset",
  "Ocean Mist",
  "Forest Moss",
  "Desert Sand",
  "Neon Lime",
  "Plasma",
  "Lavender",
  "Amber Glow",
  "Ice Blue",
  "Rose Gold",
  "Teal Punch",
  "Night Drive",
  "Arcade",
  "Paper Ink",
  "CRT Warm",
  "CRT Cool",
  "LCD Soft",
  "Aurora",
  "Ember",
  "Pastel Dream",
  "Mono Green",
  "Mono Amber",
  "Mono Cyan",
  "Mono Purple",
  "Sunset 8",
  "Ocean 8",
  "Candy 8",
  "Matrix",
  "Terminal",
  "Dusk",
  "Dawn",
  "Infrared",
  "Blueprint",
  "Toxic",
  "Peach",
  "Mint",
  "Royal",
  "Copper",
] as const;

export type BuiltinColorPalette = typeof COLOR_PALETTE_NAMES[number];
export type ColorPalette = BuiltinColorPalette | "Gameboy" | "C64" | "Custom";

export const COLOR_PALETTES: BuiltinColorPalette[] = [...COLOR_PALETTE_NAMES];

export function normalizeDitheringAlgorithm(algorithm: string): DitheringAlgorithm {
  if (algorithm === "Ordered") {
    return "Bayer 4x4";
  }

  if (algorithm === "Random") {
    return "Blue Noise";
  }

  return algorithm as DitheringAlgorithm;
}

export function normalizeColorPalette(palette: string): ColorPalette {
  if (palette === "Gameboy") {
    return "GameBoy";
  }

  if (palette === "C64") {
    return "Commodore 64";
  }

  return palette as ColorPalette;
}
