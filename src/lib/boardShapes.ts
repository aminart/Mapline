// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The board as shapes, for slides that can be edited: its boxes, texts,
 * pictures and arrows, measured on the page as it is laid out for export.
 * Positions and sizes are in layout pixels from the board's top left.
 */

export interface Color {
  /** RRGGBB, without '#'. */
  hex: string;
  /** 0 (clear) to 1. */
  alpha: number;
}

export type Shape =
  | { kind: 'box'; x: number; y: number; w: number; h: number; fill: Color | null; line: { color: Color; width: number; dash: boolean } | null; radius: number; ellipse: boolean }
  | { kind: 'text'; x: number; y: number; w: number; h: number; text: string; size: number; color: Color; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'; font: string; lineHeight: number; wrap: boolean }
  | { kind: 'image'; x: number; y: number; w: number; h: number; data: string; round: boolean }
  /** A line through `points`: an arrow when it has a head, else a dashed border, say. */
  | { kind: 'line'; points: { x: number; y: number }[]; color: Color; dash: boolean; width: number; head: boolean };

/** 'rgb(…)' or 'rgba(…)' as a colour, or null when fully clear. */
export function parseColor(css: string): Color | null {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(css);
  if (!m) {
    const hex = /^#([0-9a-f]{6})$/i.exec(css.trim());
    return hex ? { hex: hex[1].toUpperCase(), alpha: 1 } : null;
  }
  const alpha = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (alpha <= 0.01) return null;
  const hex = [m[1], m[2], m[3]].map((v) => Math.round(Number(v)).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { hex, alpha };
}

/** Drops the points of a polyline that lie on the line through their neighbours. */
export function simplify(points: { x: number; y: number }[], tolerance = 0.75): { x: number; y: number }[] {
  if (points.length <= 2) return points;
  let worst = 0;
  let at = 0;
  const [a, b] = [points[0], points[points.length - 1]];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= tolerance) return [a, b];
  return simplify(points.slice(0, at + 1), tolerance).concat(simplify(points.slice(at), tolerance).slice(1));
}

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url', 'tel', 'number', '']);

/** The board's boxes, texts and pictures in paint order, then its arrows. */
export function boardShapes(board: HTMLElement): Shape[] {
  const origin = board.getBoundingClientRect();
  // The board is zoomed: client pixels are layout pixels times the zoom.
  const zoom = board.offsetWidth ? origin.width / board.offsetWidth : 1;
  const local = (r: DOMRect) => ({ x: (r.left - origin.left) / zoom, y: (r.top - origin.top) / zoom, w: r.width / zoom, h: r.height / zoom });
  const shapes: Shape[] = [];

  const visit = (el: Element) => {
    if (!(el instanceof HTMLElement)) return;
    if (el.classList.contains('no-export') || el.classList.contains('drag-ghost')) return;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return;
    const r = local(el.getBoundingClientRect());
    if (r.w < 0.5 || r.h < 0.5) return;
    boxOf(style, r, shapes);

    if (el instanceof HTMLImageElement) {
      const data = imageData(el);
      const radius = parseFloat(style.borderTopLeftRadius) || 0;
      if (data) shapes.push({ kind: 'image', ...r, data, round: radius >= Math.min(r.w, r.h) / 2 - 1 || isRound(el.parentElement) });
      return;
    }
    if (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_INPUTS.has(el.type))) {
      const text = el.value.trim() ? el.value : '';
      if (text) shapes.push(textShape(contentBox(r, style), text, style, el instanceof HTMLTextAreaElement));
      return;
    }
    if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) return;
    // Text written directly in the element: measured where it is laid out.
    const nodes = Array.from(el.childNodes).filter((n): n is Text => n.nodeType === Node.TEXT_NODE && Boolean(n.textContent?.trim()));
    if (nodes.length) {
      const range = document.createRange();
      range.setStartBefore(nodes[0]);
      range.setEndAfter(nodes[nodes.length - 1]);
      const tr = local(range.getBoundingClientRect());
      const text = nodes.map((n) => n.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim();
      // A little room, so a font that runs wider than the browser's doesn't wrap a label.
      const extra = Math.max(4, tr.w * 0.08);
      const align = style.textAlign === 'center' ? 'center' : style.textAlign === 'right' || style.textAlign === 'end' ? 'right' : 'left';
      const x = align === 'center' ? tr.x - extra / 2 : align === 'right' ? tr.x - extra : tr.x;
      shapes.push(textShape({ ...tr, x, w: tr.w + extra }, text, style, false));
    }
    for (const child of Array.from(el.children)) visit(child);
  };
  visit(board);

  for (const line of Array.from(board.querySelectorAll<SVGPathElement>('svg.links .link-line'))) {
    const svg = line.ownerSVGElement;
    const matrix = line.getScreenCTM();
    if (!svg || !matrix) continue;
    const total = line.getTotalLength();
    const steps = Math.max(2, Math.ceil(total / 4));
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const p = line.getPointAtLength((total * i) / steps);
      const screen = new DOMPoint(p.x, p.y).matrixTransform(matrix);
      points.push({ x: (screen.x - origin.left) / zoom, y: (screen.y - origin.top) / zoom });
    }
    const color = parseColor(line.getAttribute('stroke') ?? getComputedStyle(line).stroke) ?? { hex: '3A3F4A', alpha: 1 };
    shapes.push({ kind: 'line', points: simplify(points), color, dash: Boolean(line.getAttribute('stroke-dasharray')), width: 1.75, head: true });
  }
  return shapes;
}

const isRound = (el: HTMLElement | null) => {
  if (!el) return false;
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return radius >= Math.min(el.offsetWidth, el.offsetHeight) / 2 - 1;
};

/** The element's background and border, when it has any: a rectangle, rounded, or a circle. */
function boxOf(style: CSSStyleDeclaration, r: { x: number; y: number; w: number; h: number }, shapes: Shape[]) {
  const fill = parseColor(style.backgroundColor);
  const sides = (['Top', 'Right', 'Bottom', 'Left'] as const).map((side) => ({
    side,
    width: style.getPropertyValue(`border-${side.toLowerCase()}-style`) === 'none' ? 0 : parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0,
    color: parseColor(style.getPropertyValue(`border-${side.toLowerCase()}-color`)),
    dash: /dash|dot/.test(style.getPropertyValue(`border-${side.toLowerCase()}-style`)),
  }));
  const shown = sides.filter((s) => s.width > 0 && s.color);
  const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 0, Math.min(r.w, r.h) / 2);
  const ellipse = radius >= Math.min(r.w, r.h) / 2 - 0.5 && Math.abs(r.w - r.h) < 1;
  // One border all round becomes the outline; otherwise each side is a thin bar.
  const thinnest = Math.min(...sides.map((s) => s.width));
  const even = shown.length === 4 && shown.every((s) => s.color!.hex === shown[0].color!.hex);
  const outline = even ? { color: shown[0].color!, width: thinnest, dash: shown[0].dash } : null;
  if (!fill && !outline && shown.length === 0) return;
  if (fill || outline) shapes.push({ kind: 'box', ...r, fill, line: outline, radius, ellipse });
  for (const s of shown) {
    const extra = outline ? s.width - thinnest : s.width;
    if (extra < 0.5) continue;
    if (s.dash && !outline) {
      // A dashed edge on its own (a separator line): drawn as a dashed line.
      const mid = s.width / 2;
      const points =
        s.side === 'Top' ? [{ x: r.x, y: r.y + mid }, { x: r.x + r.w, y: r.y + mid }] :
        s.side === 'Bottom' ? [{ x: r.x, y: r.y + r.h - mid }, { x: r.x + r.w, y: r.y + r.h - mid }] :
        s.side === 'Left' ? [{ x: r.x + mid, y: r.y }, { x: r.x + mid, y: r.y + r.h }] :
        [{ x: r.x + r.w - mid, y: r.y }, { x: r.x + r.w - mid, y: r.y + r.h }];
      shapes.push({ kind: 'line', points, color: s.color!, dash: true, width: s.width, head: false });
      continue;
    }
    const bar =
      s.side === 'Top' ? { x: r.x, y: r.y, w: r.w, h: s.width } :
      s.side === 'Bottom' ? { x: r.x, y: r.y + r.h - s.width, w: r.w, h: s.width } :
      s.side === 'Left' ? { x: r.x, y: r.y, w: s.width, h: r.h } :
      { x: r.x + r.w - s.width, y: r.y, w: s.width, h: r.h };
    // A thick top edge on a rounded card follows its corners.
    shapes.push({ kind: 'box', ...bar, fill: s.color, line: null, radius: s.side === 'Top' && radius > 0 ? Math.min(radius, s.width) : 0, ellipse: false });
  }
}

/** The box inside the padding and border, where an input lays out its text. */
function contentBox(r: { x: number; y: number; w: number; h: number }, style: CSSStyleDeclaration) {
  const px = (p: string) => parseFloat(style.getPropertyValue(p)) || 0;
  const left = px('padding-left') + px('border-left-width');
  const right = px('padding-right') + px('border-right-width');
  const top = px('padding-top') + px('border-top-width');
  const bottom = px('padding-bottom') + px('border-bottom-width');
  return { x: r.x + left, y: r.y + top, w: Math.max(1, r.w - left - right), h: Math.max(1, r.h - top - bottom) };
}

function textShape(r: { x: number; y: number; w: number; h: number }, text: string, style: CSSStyleDeclaration, wrap: boolean): Shape {
  const size = parseFloat(style.fontSize) || 14;
  const lineHeight = style.lineHeight === 'normal' ? size * 1.2 : parseFloat(style.lineHeight) || size * 1.2;
  const align = style.textAlign === 'center' ? 'center' : style.textAlign === 'right' || style.textAlign === 'end' ? 'right' : 'left';
  return {
    kind: 'text',
    ...r,
    text: style.textTransform === 'uppercase' ? text.toUpperCase() : text,
    size,
    color: parseColor(style.color) ?? { hex: '191B20', alpha: 1 },
    bold: (parseInt(style.fontWeight, 10) || 400) >= 600,
    italic: style.fontStyle === 'italic',
    align,
    font: style.fontFamily.split(',')[0].replace(/["']/g, '').trim() || 'Arial',
    lineHeight,
    wrap,
  };
}

/** A picture as a data URL, drawn on a canvas when it isn't one already. */
function imageData(img: HTMLImageElement): string | null {
  if (img.src.startsWith('data:image/')) return img.src;
  if (!img.complete || !img.naturalWidth) return null;
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    return null;
  }
}

export interface Part {
  x0: number;
  x1: number;
}

/**
 * The shapes of a slice of the board: the columns of `parts`, side by side,
 * from `top` down. Boxes are cut at the edges; a text or picture belongs to
 * the part where it starts. Arrows are kept when they lie within one part.
 */
export function sliceShapes(shapes: Shape[], parts: Part[], top: number): Shape[] {
  const out: Shape[] = [];
  let dx = 0;
  for (const part of parts) {
    const shift = dx - part.x0;
    for (const s of shapes) {
      if (s.kind === 'line' && !s.head && s.points.length === 2 && s.points[0].y === s.points[1].y) {
        // A straight edge across the board: cut to the part.
        const [a, b] = s.points;
        const x0 = Math.max(Math.min(a.x, b.x), part.x0);
        const x1 = Math.min(Math.max(a.x, b.x), part.x1);
        if (x1 - x0 >= 1 && a.y >= top) out.push({ ...s, points: [{ x: x0 + shift, y: a.y - top }, { x: x1 + shift, y: a.y - top }] });
        continue;
      }
      if (s.kind === 'line') {
        if (s.points.every((p) => p.x >= part.x0 - 1 && p.x <= part.x1 + 1 && p.y >= top)) out.push({ ...s, points: s.points.map((p) => ({ x: p.x + shift, y: p.y - top })) });
        continue;
      }
      if (s.y + s.h <= top) continue;
      if (s.kind === 'box') {
        const x0 = Math.max(s.x, part.x0);
        const x1 = Math.min(s.x + s.w, part.x1);
        if (x1 - x0 < 0.5) continue;
        const y0 = Math.max(s.y, top);
        const cut = x0 > s.x || x1 < s.x + s.w || y0 > s.y;
        // A box cut at the edge of a part loses its outline, which would draw the cut.
        out.push({ ...s, x: x0 + shift, y: y0 - top, w: x1 - x0, h: s.y + s.h - y0, ellipse: s.ellipse && !cut, radius: cut ? 0 : s.radius, line: cut ? null : s.line });
      } else {
        if (s.x < part.x0 - 1 || s.x >= part.x1 || s.y < top - 1) continue;
        out.push({ ...s, x: s.x + shift, y: s.y - top, w: Math.min(s.w, part.x1 - s.x) });
      }
    }
    dx += part.x1 - part.x0;
  }
  return out;
}
