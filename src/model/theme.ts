// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { CSSProperties } from 'react';
import type { BoxKind, BoxStyle, FontId } from './types';
import { paletteFromFill, readableOn } from './color';

export const PERSONA_PALETTE = [
  { color: '#2F55D4', tint: '#EDF1FC' },
  { color: '#C2410C', tint: '#FDF0E8' },
  { color: '#0F766E', tint: '#E7F4F2' },
  { color: '#7E22CE', tint: '#F4ECFB' },
  { color: '#A16207', tint: '#FBF4E2' },
  { color: '#BE185D', tint: '#FCEBF3' },
];

export const FONTS: Record<FontId, string> = {
  inter: 'Inter, system-ui, sans-serif',
  lora: 'Lora, Georgia, serif',
  plex: '"IBM Plex Mono", ui-monospace, monospace',
  caveat: 'Caveat, cursive',
};

export const FILL_SWATCHES = ['#FFFFFF', '#FFF4C2', '#E3ECFF', '#DDF3E8', '#FDE4D8', '#EFE4FB', '#191B20'];
export const BORDER_SWATCHES = ['#DDE1E7', '#2F55D4', '#C2410C', '#0F766E', '#7E22CE', '#191B20'];
export const TEXT_SWATCHES = ['#191B20', '#4A505C', '#2F55D4', '#C2410C', '#0F766E', '#FFFFFF'];
export const SIZES = [12, 13, 14, 16, 18, 20, 24, 28];

export type ResolvedStyle = Required<BoxStyle>;

const BASE: Record<BoxKind, ResolvedStyle> = {
  obj: { bg: '#191B20', bc: '#191B20', color: '#FFFFFF', font: 'inter', size: 20, weight: 600 },
  phase: { bg: '#E8EDFB', bc: '#E8EDFB', color: '#1E3A9E', font: 'inter', size: 14, weight: 600 },
  step: { bg: '#F4F6FA', bc: '#F4F6FA', color: '#191B20', font: 'inter', size: 16, weight: 600 },
  scene: { bg: '#FFFFFF', bc: '#E6E9EE', color: '#191B20', font: 'inter', size: 13, weight: 400 },
  persona: { bg: '#F4F6FA', bc: '#F4F6FA', color: '#191B20', font: 'inter', size: 15, weight: 600 },
  act: { bg: '#FFFFFF', bc: '#DDE1E7', color: '#191B20', font: 'inter', size: 14, weight: 400 },
  info: { bg: '#FAFBFC', bc: '#E6E9EE', color: '#191B20', font: 'inter', size: 13, weight: 400 },
  identity: { bg: '#F4F6FA', bc: '#F4F6FA', color: '#191B20', font: 'inter', size: 15, weight: 400 },
  block: { bg: '#FFFFFF', bc: '#DDE1E7', color: '#191B20', font: 'inter', size: 14, weight: 400 },
  node: { bg: '#FFFFFF', bc: '#DDE1E7', color: '#191B20', font: 'inter', size: 14, weight: 400 },
};

/** Accents offered for sheet blocks. */
export const BLOCK_ACCENTS = ['#2F55D4', '#C2410C', '#0F766E', '#7E22CE', '#A16207', '#BE185D', '#3A3F4A'];

export function defaultStyle(kind: BoxKind, personaColor?: number): ResolvedStyle {
  if (kind === 'persona' && personaColor !== undefined) {
    const tint = PERSONA_PALETTE[personaColor % PERSONA_PALETTE.length].tint;
    return { ...BASE.persona, bg: tint, bc: tint };
  }
  return BASE[kind];
}

export function resolveStyle(kind: BoxKind, custom: BoxStyle | undefined, personaColor?: number): ResolvedStyle {
  if (kind === 'persona' && custom?.bg) {
    // A persona's own fill drives its border and text unless those are set too.
    const derived = paletteFromFill(custom.bg);
    return { ...BASE.persona, bc: derived.accent, color: derived.text, ...custom };
  }
  return { ...defaultStyle(kind, personaColor), ...custom };
}

/**
 * A persona's accent colour, used for its avatar and for the top edge of its
 * activity cards, plus the text colour that reads on it.
 */
export function personaAccent(personaColor: number, custom: BoxStyle | undefined): { accent: string; onAccent: string } {
  if (custom?.bc) return { accent: custom.bc, onAccent: readableOn(custom.bc) };
  if (custom?.bg) {
    const { accent, onAccent } = paletteFromFill(custom.bg);
    return { accent, onAccent };
  }
  return { accent: PERSONA_PALETTE[personaColor % PERSONA_PALETTE.length].color, onAccent: '#FFFFFF' };
}

export function textStyle(s: ResolvedStyle): CSSProperties {
  return { color: s.color, fontFamily: FONTS[s.font], fontSize: s.size, fontWeight: s.weight };
}

export function boxStyle(s: ResolvedStyle): CSSProperties {
  return { background: s.bg, borderColor: s.bc };
}

/** Choice cards (decision points), in maps and flows: amber unless restyled. */
export const CHOICE_STYLE = { bg: '#FFFBEB', bc: '#D9A93B', ink: '#854D0E' };

const TAG_COLORS = [
  { bg: '#E3ECFF', fg: '#1E3A9E' },
  { bg: '#FDE4D8', fg: '#9A3412' },
  { bg: '#DDF3E8', fg: '#0F5E57' },
  { bg: '#EFE4FB', fg: '#6B21A8' },
  { bg: '#FFF1BF', fg: '#854D0E' },
  { bg: '#FCE3EE', fg: '#9D174D' },
  { bg: '#E6E9EE', fg: '#3A3F4A' },
];

export const TAG_PALETTE = TAG_COLORS;

/**
 * A tag's colour: the one chosen in the project, else a stable one derived
 * from its name, so the same tag looks the same everywhere.
 */
export function tagColor(tag: string, chosen?: Record<string, number>): { bg: string; fg: string } {
  const pick = chosen?.[tag.toLowerCase()];
  if (pick !== undefined && TAG_COLORS[pick]) return TAG_COLORS[pick];
  let h = 0;
  for (const ch of tag.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

/** Colours offered for arrows; the first is the default. */
export const LINK_COLORS = ['#3A3F4A', '#8B919C', '#2F55D4', '#0284C7', '#0F766E', '#15803D', '#A16207', '#C2410C', '#B42318', '#BE185D', '#7E22CE'];

export const LINK_DASH: Record<'solid' | 'dashed' | 'dotted', number[]> = {
  solid: [],
  dashed: [7, 5],
  dotted: [0.5, 4.5],
};
