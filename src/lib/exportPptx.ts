// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/** A slide: a title over a picture of a document, or of one phase of a map. */
export interface Slide {
  title: string;
  /** Under the title, smaller: the map's objective, for instance. */
  subtitle?: string;
  image: HTMLCanvasElement;
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
    const place = fitImage(s.image.width, s.image.height, { x: MARGIN, y: top, w: W - 2 * MARGIN, h: H - top - MARGIN });
    slide.addImage({ data: s.image.toDataURL('image/png'), ...place });
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}
