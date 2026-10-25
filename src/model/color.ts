// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/** Small colour helpers for deriving a persona's palette from its fill. */

type Hsl = { h: number; s: number; l: number };

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const DARK = '#191B20';
const LIGHT = '#FFFFFF';

/** Dark or white, whichever reads better on `bg`. */
export function readableOn(bg: string): string {
  return contrast(bg, DARK) >= contrast(bg, LIGHT) ? DARK : LIGHT;
}

/**
 * The colours that go with a fill: a stronger `accent` of the same hue
 * (border, avatar, activity cards) and readable text for the fill and for
 * the accent.
 */
export function paletteFromFill(fill: string): { accent: string; text: string; onAccent: string } {
  const rgb = parseHex(fill);
  if (!rgb) return { accent: '#5B6270', text: DARK, onAccent: LIGHT };
  const hsl = rgbToHsl(...rgb);
  const accent =
    hsl.l > 0.5
      ? // Light fill: same hue, saturated and dark enough to stand out.
        hslToHex({ h: hsl.h, s: hsl.s < 0.08 ? hsl.s : Math.max(hsl.s, 0.55), l: 0.4 })
      : // Dark fill: a lighter shade of it.
        hslToHex({ h: hsl.h, s: hsl.s, l: Math.min(0.75, hsl.l + 0.3) });
  return { accent, text: readableOn(fill), onAccent: readableOn(accent) };
}
