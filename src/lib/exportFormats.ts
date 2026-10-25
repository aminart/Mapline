// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { isDesktop } from './fileio';

export type ExportFormat = 'png' | 'jpeg' | 'pdf' | 'csv';

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), type, quality),
  );
}

export function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return toBlob(canvas, 'image/png');
}

/** JPEG has no transparency: the image is laid on white. */
export function jpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const flat = document.createElement('canvas');
  flat.width = canvas.width;
  flat.height = canvas.height;
  const ctx = flat.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, flat.width, flat.height);
  ctx.drawImage(canvas, 0, 0);
  return toBlob(flat, 'image/jpeg', 0.92);
}

/**
 * Puts a PNG on the clipboard. `png` is passed as a promise so the browser
 * still counts the call as part of the click (Safari/WebKit requires it).
 * On desktop, falls back to the Tauri clipboard plugin.
 */
export async function copyPng(png: Promise<Blob>): Promise<void> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) throw new Error('no clipboard API');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  } catch (err) {
    if (!isDesktop) throw err;
    const { writeImage } = await import('@tauri-apps/plugin-clipboard-manager');
    await writeImage(new Uint8Array(await (await png).arrayBuffer()));
  }
}
