export const isDesktop = typeof (window as any).Neutralino !== "undefined";

export async function showOpenDialog(filters?: string[]) {
  if (isDesktop) {
    const res = await (window as any).Neutralino.os.showOpenDialog("Open file", { filters: filters ?? ["*"] });
    return res?.selectedEntry ?? null;
  }
  return null;
}

export async function showSaveDialog(defaultPath: string, filters?: string[]) {
  if (isDesktop) {
    const res = await (window as any).Neutralino.os.showSaveDialog("Save file", { defaultPath, filters: filters ?? ["*"] });
    return res?.selectedEntry ?? null;
  }
  return null;
}

export async function readText(path: string) {
  if (isDesktop) {
    return await (window as any).Neutralino.filesystem.readFile(path);
  }
  throw new Error("readText not available in web mode");
}

export async function writeText(path: string, data: string) {
  if (isDesktop) {
    await (window as any).Neutralino.filesystem.writeFile(path, data);
    return;
  }
  throw new Error("writeText not available in web mode");
}

export async function readBinary(path: string) {
  if (isDesktop) {
    return await (window as any).Neutralino.filesystem.readBinaryFile(path);
  }
  throw new Error("readBinary not available in web mode");
}

export async function writeBinary(path: string, data: Uint8Array) {
  if (isDesktop) {
    await (window as any).Neutralino.filesystem.writeBinaryFile(path, data);
    return;
  }
  throw new Error("writeBinary not available in web mode");
}

export async function getDataPath() {
  if (isDesktop) {
    return await (window as any).Neutralino.app.getDataPath();
  }
  return "";
}

export async function ensureDir(path: string) {
  if (isDesktop) {
    try {
      await (window as any).Neutralino.filesystem.createDirectory(path);
    } catch {}
  }
}
