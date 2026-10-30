// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { Shape } from './boardShapes';

/** A slide: a title over a document, or one phase of a map, as a picture or as shapes to edit. */
export interface Slide {
  title: string;
  /** Under the title, smaller: the map's objective, for instance. */
  subtitle?: string;
  image?: HTMLCanvasElement;
  /** The board as shapes, in layout pixels, within `width` × `height`. */
  shapes?: { list: Shape[]; width: number; height: number };
}

/** Widescreen slides (16:9), in inches. */
const W = 13.333;
const H = 7.5;
const MARGIN = 0.4;
const TITLE_H = 0.5;
const SUBTITLE_H = 0.35;

/** Where a picture of `w`×`h` pixels fits in a box, keeping its proportions, centred. */
export function fitImage(w: number, h: number, box: { x: number; y: number; w: number; h: number }) {
  const scale = Math.min(box.w / w, box.h / h);
  const fw = w * scale;
  const fh = h * scale;
  return { x: box.x + (box.w - fw) / 2, y: box.y + (box.h - fh) / 2, w: fw, h: fh };
}

/** A PowerPoint deck, one slide per picture. */
export async function pptxDocument(title: string, slides: Slide[]): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title;
  for (const s of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    slide.addText(s.title, { x: MARGIN, y: MARGIN * 0.6, w: W - 2 * MARGIN, h: TITLE_H, fontFace: 'Arial', fontSize: 20, bold: true, color: '191B20', fit: 'shrink' });
    let top = MARGIN * 0.6 + TITLE_H;
    if (s.subtitle) {
      slide.addText(s.subtitle, { x: MARGIN, y: top, w: W - 2 * MARGIN, h: SUBTITLE_H, fontFace: 'Arial', fontSize: 12, color: '5B6170', fit: 'shrink' });
      top += SUBTITLE_H;
    }
    top += 0.15;
    const box = { x: MARGIN, y: top, w: W - 2 * MARGIN, h: H - top - MARGIN };
    if (s.image) {
      const place = fitImage(s.image.width, s.image.height, box);
      slide.addImage({ data: s.image.toDataURL('image/png'), ...place });
    }
    if (s.shapes) addShapes(pptx, slide, s.shapes.list, fitImage(s.shapes.width, s.shapes.height, box), s.shapes.width);
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

type Pptx = InstanceType<(typeof import('pptxgenjs'))['default']>;
type PptxSlide = ReturnType<Pptx['addSlide']>;

const transparency = (alpha: number) => Math.round((1 - alpha) * 100);

/** Draws the board's shapes in `place` (inches), the board being `width` layout pixels wide. */
function addShapes(pptx: Pptx, slide: PptxSlide, shapes: Shape[], place: { x: number; y: number; w: number; h: number }, width: number) {
  const k = place.w / width;
  const pt = k * 72;
  const at = (s: { x: number; y: number; w: number; h: number }) => ({ x: place.x + s.x * k, y: place.y + s.y * k, w: Math.max(0.01, s.w * k), h: Math.max(0.01, s.h * k) });
  for (const s of shapes) {
    if (s.kind === 'box') {
      const shape = s.ellipse ? pptx.ShapeType.ellipse : s.radius > 0.5 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect;
      slide.addShape(shape, {
        ...at(s),
        fill: s.fill ? { color: s.fill.hex, transparency: transparency(s.fill.alpha) } : { type: 'none' },
        line: s.line ? { color: s.line.color.hex, transparency: transparency(s.line.color.alpha), width: Math.max(0.25, s.line.width * pt), dashType: s.line.dash ? 'dash' : 'solid' } : { type: 'none' },
        ...(shape === pptx.ShapeType.roundRect ? { rectRadius: s.radius * k } : {}),
      });
    } else if (s.kind === 'text') {
      slide.addText(s.text, {
        ...at(s),
        margin: 0,
        valign: 'top',
        align: s.align,
        fontFace: s.font,
        fontSize: Math.max(1, Math.round(s.size * pt * 2) / 2),
        bold: s.bold,
        italic: s.italic,
        color: s.color.hex,
        transparency: transparency(s.color.alpha),
        lineSpacing: Math.max(1, s.lineHeight * pt),
        wrap: true,
      });
    } else if (s.kind === 'image') {
      slide.addImage({ data: s.data, ...at(s), sizing: { type: 'cover', ...at(s) }, rounding: s.round });
    } else if (s.points.length >= 2) {
      const xs = s.points.map((p) => p.x);
      const ys = s.points.map((p) => p.y);
      const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      slide.addShape('custGeom' as Parameters<PptxSlide['addShape']>[0], {
        ...at(box),
        points: s.points.map((p, i) => ({ x: (p.x - box.x) * k, y: (p.y - box.y) * k, ...(i === 0 ? { moveTo: true } : {}) })),
        line: { color: s.color.hex, transparency: transparency(s.color.alpha), width: Math.max(0.5, s.width * pt), dashType: s.dash ? 'dash' : 'solid', ...(s.head ? { endArrowType: 'triangle' as const } : {}) },
        fill: { type: 'none' },
      });
    }
  }
}
