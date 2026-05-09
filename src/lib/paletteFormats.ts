export type RgbColor = [number, number, number];

export function rgbToHex([r, g, b]: RgbColor): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`.toUpperCase();
}

export function hexToRgb(hex: string): RgbColor | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

export function parseHexPaletteText(content: string): RgbColor[] {
  const colors: RgbColor[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const candidate = line.trim().split(/\s+/)[0] ?? "";
    const rgb = hexToRgb(candidate);
    if (rgb) colors.push(rgb);
  }
  return dedupeColors(colors);
}

export function parseGplPalette(content: string): RgbColor[] {
  const colors: RgbColor[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (
      trimmed.startsWith("GIMP Palette")
      || trimmed.startsWith("Name:")
      || trimmed.startsWith("Columns:")
    ) continue;

    const parts = trimmed.split(/\s+/);
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    if ([r, g, b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) {
      colors.push([r, g, b]);
    }
  }
  return dedupeColors(colors);
}

export function parseJsonPalette(content: string): RgbColor[] {
  try {
    const parsed = JSON.parse(content) as unknown;
    const rawColors = Array.isArray(parsed)
      ? parsed
      : (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { colors?: unknown }).colors))
        ? (parsed as { colors: unknown[] }).colors
        : [];

    const colors: RgbColor[] = [];
    for (const item of rawColors) {
      if (Array.isArray(item) && item.length >= 3) {
        const r = Number(item[0]);
        const g = Number(item[1]);
        const b = Number(item[2]);
        if ([r, g, b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) {
          colors.push([r, g, b]);
          continue;
        }
      }
      if (typeof item === "string") {
        const rgb = hexToRgb(item);
        if (rgb) colors.push(rgb);
      }
    }
    return dedupeColors(colors);
  } catch {
    return [];
  }
}

export function parsePaletteByExtension(fileName: string, content: string): RgbColor[] {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "gpl") return parseGplPalette(content);
  if (ext === "json") return parseJsonPalette(content);
  if (ext === "hex" || ext === "txt" || ext === "pal") return parseHexPaletteText(content);

  const gpl = parseGplPalette(content);
  if (gpl.length > 0) return gpl;
  const json = parseJsonPalette(content);
  if (json.length > 0) return json;
  return parseHexPaletteText(content);
}

export function parseAsePalette(bytes: Uint8Array): RgbColor[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const readU16 = () => {
    const value = view.getUint16(offset, false);
    offset += 2;
    return value;
  };
  const readU32 = () => {
    const value = view.getUint32(offset, false);
    offset += 4;
    return value;
  };
  const readF32 = () => {
    const value = view.getFloat32(offset, false);
    offset += 4;
    return value;
  };
  const readAscii = (len: number) => {
    const chars: string[] = [];
    for (let i = 0; i < len; i += 1) {
      chars.push(String.fromCharCode(view.getUint8(offset)));
      offset += 1;
    }
    return chars.join("");
  };

  if (bytes.byteLength < 12) return [];
  const signature = readAscii(4);
  if (signature !== "ASEF") return [];

  // version major/minor
  readU16();
  readU16();
  const blockCount = readU32();
  const colors: RgbColor[] = [];

  for (let i = 0; i < blockCount && offset + 6 <= bytes.byteLength; i += 1) {
    const blockType = readU16();
    const blockLength = readU32();
    const blockStart = offset;
    const blockEnd = blockStart + blockLength;
    if (blockEnd > bytes.byteLength) break;

    if (blockType === 0x0001) {
      const nameLen = readU16();
      // UTF-16BE name (includes terminating null)
      for (let j = 0; j < nameLen && offset + 2 <= blockEnd; j += 1) {
        readU16();
      }
      if (offset + 4 <= blockEnd) {
        const model = readAscii(4);
        if (model === "RGB " && offset + 12 <= blockEnd) {
          const r = Math.max(0, Math.min(255, Math.round(readF32() * 255)));
          const g = Math.max(0, Math.min(255, Math.round(readF32() * 255)));
          const b = Math.max(0, Math.min(255, Math.round(readF32() * 255)));
          colors.push([r, g, b]);
        }
      }
    }

    offset = blockEnd;
  }

  return dedupeColors(colors);
}

export function encodeGplPalette(name: string, colors: RgbColor[]): string {
  const lines = [
    "GIMP Palette",
    `Name: ${name}`,
    "Columns: 8",
    "#",
    ...colors.map(([r, g, b], index) => `${r}\t${g}\t${b}\tColor ${index + 1}`),
  ];
  return `${lines.join("\n")}\n`;
}

export function encodeHexPalette(colors: RgbColor[]): string {
  return `${colors.map((rgb) => rgbToHex(rgb)).join("\n")}\n`;
}

export function encodeJsonPalette(name: string, colors: RgbColor[]): string {
  return JSON.stringify({
    name,
    colors,
    hex: colors.map((rgb) => rgbToHex(rgb)),
  }, null, 2);
}

export function encodeAsePalette(_name: string, colors: RgbColor[]): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (let i = 0; i < colors.length; i += 1) {
    const [r, g, b] = colors[i]!;
    const swatchName = `Color ${i + 1}`;
    const nameUnits = Array.from(swatchName).map((char) => char.charCodeAt(0));
    const nameLength = nameUnits.length + 1; // include null

    const bodySize = 2 + (nameLength * 2) + 4 + 12 + 2;
    const block = new Uint8Array(2 + 4 + bodySize);
    const view = new DataView(block.buffer);
    let o = 0;
    view.setUint16(o, 0x0001, false); o += 2;
    view.setUint32(o, bodySize, false); o += 4;
    view.setUint16(o, nameLength, false); o += 2;
    for (const unit of nameUnits) {
      view.setUint16(o, unit, false); o += 2;
    }
    view.setUint16(o, 0, false); o += 2; // null terminator
    block[o++] = "R".charCodeAt(0);
    block[o++] = "G".charCodeAt(0);
    block[o++] = "B".charCodeAt(0);
    block[o++] = " ".charCodeAt(0);
    view.setFloat32(o, r / 255, false); o += 4;
    view.setFloat32(o, g / 255, false); o += 4;
    view.setFloat32(o, b / 255, false); o += 4;
    view.setUint16(o, 0, false); // color type: global
    blocks.push(block);
  }

  const header = new Uint8Array(12);
  const h = new DataView(header.buffer);
  header[0] = "A".charCodeAt(0);
  header[1] = "S".charCodeAt(0);
  header[2] = "E".charCodeAt(0);
  header[3] = "F".charCodeAt(0);
  h.setUint16(4, 1, false); // version major
  h.setUint16(6, 0, false); // version minor
  h.setUint32(8, blocks.length, false);

  const totalLength = header.length + blocks.reduce((sum, block) => sum + block.length, 0);
  const out = new Uint8Array(totalLength);
  let offset = 0;
  out.set(header, offset);
  offset += header.length;
  for (const block of blocks) {
    out.set(block, offset);
    offset += block.length;
  }
  return out;
}

function dedupeColors(colors: RgbColor[]): RgbColor[] {
  const seen = new Set<string>();
  const deduped: RgbColor[] = [];
  for (const color of colors) {
    const key = color.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(color);
  }
  return deduped;
}
