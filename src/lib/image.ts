// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

const MAX_SIDE = 1600;
/** Below this, a picture that needs no downscaling is kept as it is. */
const SMALL_FILE = 150_000;
const JPEG_QUALITY = 0.85;

/**
 * Reads an image file as a data URL, downscaling large pictures so project
 * files stay a reasonable size. Pictures without transparency (photos,
 * screenshots) are stored as JPEG, often several times lighter than PNG;
 * the others stay PNG. The original is kept when it is already lighter.
 */
export async function readImage(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null;
  const original = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return original;

  const img = new Image();
  img.src = original;
  try {
    await img.decode();
  } catch {
    return original;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.size < SMALL_FILE) return original;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return original;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const opaque = file.type === 'image/jpeg' || !hasTransparency(ctx, canvas.width, canvas.height);
  const encoded = opaque ? canvas.toDataURL('image/jpeg', JPEG_QUALITY) : canvas.toDataURL('image/png');
  return scale === 1 && encoded.length >= original.length ? original : encoded;
}

/** Whether any pixel of the canvas is not fully opaque. */
export function hasTransparency(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    return alphaBelowFull(ctx.getImageData(0, 0, width, height).data);
  } catch {
    return true;
  }
}

/** Whether RGBA pixel data holds any alpha below 255. */
export function alphaBelowFull(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}
