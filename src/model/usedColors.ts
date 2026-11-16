// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

// The colours already used in a project, offered as shortcuts in every colour
// menu. The user can take one off the shortcuts: it stays on what it colours.

import type { BoxStyle, Project } from './types';

/** How many used colours a menu offers. */
export const USED_COLORS_MAX = 12;

/** #RRGGBB from a CSS colour (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba()); null when invalid or not opaque. */
export function cssColorToHex(css: string | undefined | null): string | null {
  if (!css) return null;
  const s = css.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return ('#' + [...m[1]].map((c) => c + c).join('')).toUpperCase();
  m = /^#([0-9a-f]{6})(?:([0-9a-f]{2}))?$/i.exec(s);
  if (m) return m[2] && parseInt(m[2], 16) < 255 ? null : ('#' + m[1]).toUpperCase();
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
  if (m) {
    if (m[4] !== undefined) {
      const a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
      if (a < 1) return null;
    }
    const byte = (v: string) => Math.max(0, Math.min(255, Math.round(parseFloat(v)))).toString(16).padStart(2, '0');
    return ('#' + byte(m[1]) + byte(m[2]) + byte(m[3])).toUpperCase();
  }
  return null;
}

/** Every colour set by the user in the project, the most used first, without the ones taken off the shortcuts. */
export function usedColors(project: Project): string[] {
  const count = new Map<string, number>();
  const add = (c: string | undefined) => {
    const hex = cssColorToHex(c);
    if (hex) count.set(hex, (count.get(hex) ?? 0) + 1);
  };
  const addStyles = (styles: Record<string, BoxStyle> | undefined) => {
    for (const s of Object.values(styles ?? {})) {
      add(s.bg);
      add(s.bc);
      add(s.color);
      add(s.top);
    }
  };
  for (const doc of project.docs) {
    if (doc.kind === 'mission-map') {
      addStyles(doc.map.styles);
      for (const l of doc.map.links) add(l.color);
    } else if (doc.kind === 'flow') {
      addStyles(doc.flow.styles);
      for (const l of doc.flow.links) add(l.color);
    } else {
      addStyles(doc.sheet.styles);
      for (const b of doc.sheet.blocks) add(b.accent);
    }
  }
  const hidden = new Set(project.hiddenColors ?? []);
  return [...count.entries()]
    .filter(([hex]) => !hidden.has(hex))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
}

/** Takes a colour off the shortcuts; what it colours keeps it. */
export function hideUsedColor(project: Project, hex: string): Project {
  const c = cssColorToHex(hex);
  if (!c || project.hiddenColors?.includes(c)) return project;
  return { ...project, hiddenColors: [...(project.hiddenColors ?? []), c] };
}

/** Offers a colour again, e.g. once the user picks it on purpose. */
export function showUsedColor(project: Project, hex: string): Project {
  const c = cssColorToHex(hex);
  if (!c || !project.hiddenColors?.includes(c)) return project;
  const hiddenColors = project.hiddenColors.filter((h) => h !== c);
  if (hiddenColors.length) return { ...project, hiddenColors };
  const { hiddenColors: _gone, ...rest } = project;
  return rest;
}
