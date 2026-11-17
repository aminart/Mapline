// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Colours of the documents in the dark theme.
 *
 * The documents keep the colours they are saved with. On screen, in the dark
 * theme, each colour of Mapline's own palettes (the default boxes, the
 * swatches, the tags, the persona tints) is shown as a darker or lighter
 * counterpart, so that the board reads on a dark ground. A colour picked
 * outside these palettes is shown as it is, and so is the text on it: the
 * pair the user chose stays readable.
 *
 * This works through CSS variables: shown() returns `var(--mc-…, #light)`,
 * the variables are set only in the dark theme, and cleared on an exported
 * board (.is-exporting), so pictures, PDF and PowerPoint stay light.
 */

export type ColorRole = 'bg' | 'line' | 'ink';

/** Light colour (upper case) → its dark-theme counterpart, by role. */
const DARK: Record<ColorRole, Record<string, string>> = {
  bg: {
    // Default boxes
    '#FFFFFF': '#1C2038',
    '#F4F6FA': '#191C33',
    '#FAFBFC': '#151830',
    '#E8EDFB': '#1F2752',
    '#191B20': '#2A2F4C',
    // Fill swatches and tags
    '#FFF4C2': '#3A3216',
    '#E3ECFF': '#1F2B55',
    '#DDF3E8': '#15352A',
    '#FDE4D8': '#3E2519',
    '#EFE4FB': '#2E2349',
    '#FFF1BF': '#3A3114',
    '#FCE3EE': '#3D1C2D',
    '#E6E9EE': '#2A2E45',
    // Persona tints
    '#EDF1FC': '#1D2551',
    '#FDF0E8': '#3A2418',
    '#E7F4F2': '#13322E',
    '#F4ECFB': '#2C2143',
    '#FBF4E2': '#332A12',
    '#FCEBF3': '#3A1B2A',
    // Choice cards
    '#FFFBEB': '#2E2611',
  },
  line: {
    '#DDE1E7': '#363C5A',
    '#E6E9EE': '#2E334D',
    '#191B20': '#C6CADF',
    '#3A3F4A': '#A3A9C4',
    '#2F55D4': '#7088F0',
    '#C2410C': '#E37A4C',
    '#0F766E': '#33A99C',
    '#7E22CE': '#A877E6',
    '#A16207': '#D09B3C',
    '#BE185D': '#DD639B',
    '#B42318': '#EB6F64',
    '#15803D': '#45B26B',
    '#D9A93B': '#B88D2E',
  },
  ink: {
    '#191B20': '#EDEFF8',
    '#4A505C': '#A9AFC8',
    '#3A3F4A': '#C6CADF',
    '#2F55D4': '#93A6FF',
    '#C2410C': '#F59D6E',
    '#0F766E': '#5FCABD',
    '#1E3A9E': '#C3CAFF',
    '#9A3412': '#F5A877',
    '#0F5E57': '#6CD3C4',
    '#6B21A8': '#CDA6F5',
    '#854D0E': '#F0C46A',
    '#9D174D': '#F28DB9',
  },
};

const PREFIX: Record<ColorRole, string> = { bg: 'mcb', line: 'mcl', ink: 'mci' };

function varName(role: ColorRole, hex: string): string {
  return `--${PREFIX[role]}-${hex.slice(1).toLowerCase()}`;
}

/** Whether `hex` is one of Mapline's colours for `role`, shown differently in the dark theme. */
export function themable(hex: string | undefined, role: ColorRole): boolean {
  return !!hex && hex.toUpperCase() in DARK[role];
}

/** The colour to show on screen for `hex`: the colour itself, or a variable the dark theme sets. */
export function shown(hex: string, role: ColorRole): string;
export function shown(hex: string | undefined, role: ColorRole): string | undefined;
export function shown(hex: string | undefined, role: ColorRole): string | undefined {
  if (!hex || !themable(hex, role)) return hex;
  return `var(${varName(role, hex)}, ${hex})`;
}

/**
 * A box's fill, border and text as shown. When its fill is not one of
 * Mapline's colours, nothing changes: the text keeps reading on it.
 */
export function shownBox(bg: string, bc: string, color?: string): { bg: string; bc: string; color?: string } {
  if (!themable(bg, 'bg')) return { bg, bc, color };
  return {
    bg: shown(bg, 'bg'),
    // A border the colour of the fill stays with the fill.
    bc: bc.toUpperCase() === bg.toUpperCase() ? shown(bg, 'bg') : themable(bc, 'line') ? shown(bc, 'line') : themable(bc, 'bg') ? shown(bc, 'bg') : bc,
    color: shown(color, 'ink'),
  };
}

/** The style sheet that sets the variables: dark counterparts, none on an exported board. */
export function darkPaletteCss(): string {
  const set: string[] = [];
  const clear: string[] = [];
  for (const role of Object.keys(DARK) as ColorRole[]) {
    for (const [light, dark] of Object.entries(DARK[role])) {
      set.push(`${varName(role, light)}:${dark};`);
      clear.push(`${varName(role, light)}:initial;`);
    }
  }
  return `:root[data-theme='dark']{${set.join('')}}.is-exporting{${clear.join('')}}`;
}

/** Adds the style sheet of the dark palette to the page, once. */
export function installDarkPalette() {
  if (document.getElementById('mapline-dark-palette')) return;
  const style = document.createElement('style');
  style.id = 'mapline-dark-palette';
  style.textContent = darkPaletteCss();
  document.head.appendChild(style);
}
