// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Project } from '../model/types';
import { FILE_EXTENSION, OPEN_EXTENSIONS, parse, serialize } from '../model/serialize';
import { t } from '../store';

/** True inside the Tauri desktop shell, false in a plain browser (dev, preview). */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const projectFilter = () => ({ name: t('file.filter'), extensions: [FILE_EXTENSION] });
const openFilter = () => ({ name: t('file.filter'), extensions: OPEN_EXTENSIONS });

function safeName(title: string): string {
  return (title.trim() || t('app.untitled')).replace(/[\\/:*?"<>|]+/g, '-');
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Saves the project. On desktop, writes to `path` (or asks for one);
 * returns the path written, or null if cancelled. In a browser, downloads it.
 */
export async function saveProject(project: Project, path: string | null, saveAs = false): Promise<string | null> {
  const text = serialize(project);
  if (!isDesktop) {
    download(new Blob([text], { type: 'application/json' }), `${safeName(project.title)}.${FILE_EXTENSION}`);
    return null;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  let target = saveAs ? null : path;
  if (!target) {
    target = await save({ filters: [projectFilter()], defaultPath: `${safeName(project.title)}.${FILE_EXTENSION}` });
    if (!target) return null;
  }
  await writeTextFile(target, text);
  return target;
}

function pickFileInBrowser(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Asks for a project file and parses it; null if cancelled. */
export async function openProject(): Promise<{ project: Project; path: string | null } | null> {
  if (!isDesktop) {
    const file = await pickFileInBrowser(`${OPEN_EXTENSIONS.map((e) => `.${e}`).join(',')},application/json`);
    if (!file) return null;
    return { project: parse(await file.text()), path: null };
  }
  const { open } = await import('@tauri-apps/plugin-dialog');
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const path = await open({ multiple: false, directory: false, filters: [openFilter()] });
  if (typeof path !== 'string') return null;
  return { project: parse(await readTextFile(path)), path };
}

/** Saves an exported file (image, PDF, CSV) under the project title. */
export async function saveExport(blob: Blob, title: string, ext: string, filterName: string): Promise<void> {
  if (!isDesktop) {
    download(blob, `${safeName(title)}.${ext}`);
    return;
  }
  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeFile } = await import('@tauri-apps/plugin-fs');
  const target = await save({ filters: [{ name: filterName, extensions: [ext] }], defaultPath: `${safeName(title)}.${ext}` });
  if (!target) return;
  await writeFile(target, new Uint8Array(await blob.arrayBuffer()));
}
