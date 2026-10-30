// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { BoardLayout } from './exportImage';
import type { NoteEntry } from '../model/ops';

/** `fit`: the whole board scaled onto one A4 page (sheets and flows). */
export type PdfLayout = 'single' | 'a4' | 'a3' | 'phases' | 'fit';

/** Landscape page sizes in points. */
const PAPER: Record<'a4' | 'a3', { w: number; h: number }> = {
  a4: { w: 842, h: 595 },
  a3: { w: 1191, h: 842 },
};
const MARGIN = 28;
const HEADER = 38;
const FOOTER = 16;
/** Half the gap between columns, kept on each side of a cut. */
const PAD = 6;
/** Layout pixels to points at 100 %. */
const PX_TO_PT = 0.75;

export interface PagePlan {
  /** Points per layout pixel. */
  k: number;
  /** Board slices (layout px) shown next to the persona column, with the steps they hold. */
  pages: { x0: number; x1: number; firstStep: number; lastStep: number }[];
}

/**
 * Splits the board into pages: the board is scaled so its height fits the
 * page, then steps are packed page by page without cutting one in two
 * (a step wider than a page is sliced).
 */
export function planPages(layout: BoardLayout, page: { w: number; h: number }): PagePlan {
  // Detail pages leave out the objective band; it goes in the page header.
  const usableH = page.h - 2 * MARGIN - HEADER - FOOTER;
  const k = Math.min(PX_TO_PT, usableH / (layout.height - layout.objectiveBottom));
  const usableW = page.w - 2 * MARGIN - layout.stripRight * k;
  const pages: PagePlan['pages'] = [];
  const { steps } = layout;
  let i = 0;
  while (i < steps.length) {
    const start = steps[i].left - PAD;
    if ((steps[i].right + PAD - start) * k > usableW) {
      // One step wider than the page: slice it.
      const sliceW = usableW / k;
      for (let x = start; x < steps[i].right + PAD; x += sliceW) {
        pages.push({ x0: x, x1: Math.min(x + sliceW, steps[i].right + PAD), firstStep: i, lastStep: i });
      }
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < steps.length && (steps[j + 1].right + PAD - start) * k <= usableW) j++;
    pages.push({ x0: start, x1: steps[j].right + PAD, firstStep: i, lastStep: j });
    i = j + 1;
  }
  return { k, pages };
}

export interface PhasePage {
  /** Board slice (layout px) shown next to the persona column, from `top` down. */
  x0: number;
  x1: number;
  top: number;
  /** Index of the phase, for its default name. */
  index: number;
  title: string;
}

/** One page per phase: its steps, with the phase box on top and without the objective. */
export function planPhasePages(layout: BoardLayout): PhasePage[] {
  if (layout.phases.length === 0) {
    const { steps } = layout;
    if (steps.length === 0) return [];
    return [{ x0: steps[0].left - PAD, x1: steps[steps.length - 1].right + PAD, top: layout.objectiveBottom, index: 0, title: '' }];
  }
  return layout.phases.map((ph, index) => ({
    x0: ph.left - PAD,
    x1: ph.right + PAD,
    top: Math.max(0, ph.top - 2 * PAD),
    index,
    title: ph.title,
  }));
}

export interface PdfLabels {
  page: (n: number, total: number) => string;
  steps: (from: number, to: number) => string;
  step: (n: number) => string;
  phase: (n: number) => string;
  overview: string;
  notes: string;
}

/** Copies part of the rendered board (layout px, from `top` down) into a new canvas. */
export function crop(canvas: HTMLCanvasElement, scale: number, parts: { x0: number; x1: number }[], top: number, height: number) {
  const out = document.createElement('canvas');
  out.width = Math.round(parts.reduce((w, p) => w + (p.x1 - p.x0), 0) * scale);
  out.height = Math.round((height - top) * scale);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, out.width, out.height);
  let dx = 0;
  for (const p of parts) {
    const sw = (p.x1 - p.x0) * scale;
    ctx.drawImage(canvas, p.x0 * scale, top * scale, sw, out.height, dx, 0, sw, out.height);
    dx += sw;
  }
  return out;
}

export async function pdfDocument(args: {
  canvas: HTMLCanvasElement;
  scale: number;
  layout: BoardLayout;
  title: string;
  mode: PdfLayout;
  overview: boolean;
  notes: NoteEntry[];
  labels: PdfLabels;
}): Promise<Blob> {
  const { canvas, scale, layout, title, mode, overview, notes, labels } = args;
  const { jsPDF } = await import('jspdf');

  if (mode === 'single') {
    // One page the size of the board.
    const w = layout.width * PX_TO_PT;
    const h = layout.height * PX_TO_PT;
    const pdf = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'pt', format: [w, h], compress: true });
    pdf.setProperties({ title });
    pdf.addImage(canvas, 'PNG', 0, 0, w, h, undefined, 'FAST');
    if (notes.length) {
      addNotes(pdf, title, notes, labels, { w: 595, h: 842 });
      numberPages(pdf, labels);
    }
    return pdf.output('blob');
  }

  if (mode === 'phases') return phasesDocument(jsPDF, args);

  if (mode === 'fit') {
    // One A4 page, turned to suit the board's shape, the board scaled to fit under the title.
    const landscape = layout.width >= layout.height;
    const paper = landscape ? PAPER.a4 : { w: PAPER.a4.h, h: PAPER.a4.w };
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: [paper.w, paper.h], compress: true });
    pdf.setProperties({ title });
    drawHeader(pdf, paper, title, '', '');
    const availW = paper.w - 2 * MARGIN;
    const availH = paper.h - 2 * MARGIN - HEADER;
    const k = Math.min(availW / layout.width, availH / layout.height);
    const w = layout.width * k;
    const h = layout.height * k;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN + (availW - w) / 2, MARGIN + HEADER, w, h, undefined, 'FAST');
    return pdf.output('blob');
  }

  const paper = PAPER[mode];
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [paper.w, paper.h], compress: true });
  pdf.setProperties({ title });
  const plan = planPages(layout, paper);
  let first = true;

  const header = (right: string, subtitle: string) => {
    if (!first) pdf.addPage([paper.w, paper.h], 'landscape');
    first = false;
    drawHeader(pdf, paper, title, right, subtitle);
  };

  if (overview) {
    const availW = paper.w - 2 * MARGIN;
    const availH = paper.h - 2 * MARGIN - HEADER - FOOTER;
    const k = Math.min(availW / layout.width, availH / layout.height);
    const w = layout.width * k;
    const h = layout.height * k;
    header(labels.overview, '');
    pdf.addImage(canvas, 'JPEG', MARGIN + (availW - w) / 2, MARGIN + HEADER, w, h, undefined, 'FAST');
  }

  const top = layout.objectiveBottom;
  for (const p of plan.pages) {
    const range = p.firstStep === p.lastStep ? labels.step(p.firstStep + 1) : labels.steps(p.firstStep + 1, p.lastStep + 1);
    header(range, layout.objective);
    const image = crop(canvas, scale, [{ x0: 0, x1: layout.stripRight }, p], top, layout.height);
    const x = MARGIN;
    const y = MARGIN + HEADER;
    const w = (layout.stripRight + (p.x1 - p.x0)) * plan.k;
    pdf.addImage(image.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, w, (layout.height - top) * plan.k, undefined, 'FAST');
    // A phase that began on an earlier page: repeat its name where it enters this one.
    for (const ph of layout.phases) {
      if (!ph.title || ph.left >= p.x0 || ph.right <= p.x0) continue;
      const px = x + (layout.stripRight + 14) * plan.k;
      const py = y + (ph.top - top + ph.height / 2) * plan.k;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(ph.size * plan.k);
      pdf.setTextColor(ph.color);
      pdf.text(ph.title, px, py, { baseline: 'middle' });
    }
  }

  if (notes.length) addNotes(pdf, title, notes, labels, paper);
  numberPages(pdf, labels);
  return pdf.output('blob');
}

/** Title on the left, `right` on the right, and an optional one-line subtitle. */
function drawHeader(pdf: Pdf, paper: { w: number; h: number }, title: string, right: string, subtitle: string) {
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(25, 27, 32);
  pdf.text(title, MARGIN, MARGIN + 10);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(91, 98, 112);
  pdf.text(right, paper.w - MARGIN, MARGIN + 10, { align: 'right' });
  if (subtitle) {
    const line: string = pdf.splitTextToSize(subtitle, paper.w - 2 * MARGIN)[0];
    pdf.text(line, MARGIN, MARGIN + 24);
  }
}

/** One page per phase, each sized to fit its phase at full scale. */
function phasesDocument(jsPDF: (typeof import('jspdf'))['jsPDF'], args: Parameters<typeof pdfDocument>[0]): Blob {
  const { canvas, scale, layout, title, overview, notes, labels } = args;
  const pages = planPhasePages(layout);
  // At least as wide as an A4 page, so a one-step phase still has room for its header.
  const sizeOf = (w: number, h: number) => ({ w: Math.max(595, w * PX_TO_PT + 2 * MARGIN), h: h * PX_TO_PT + 2 * MARGIN + HEADER + FOOTER });
  const sizes = pages.map((p) => sizeOf(layout.stripRight + p.x1 - p.x0, layout.height - p.top));
  const overviewSize = sizeOf(layout.width, layout.height);
  const firstSize = overview || sizes.length === 0 ? overviewSize : sizes[0];
  const orientation = (s: { w: number; h: number }) => (s.w >= s.h ? 'landscape' : 'portrait');
  const pdf = new jsPDF({ orientation: orientation(firstSize), unit: 'pt', format: [firstSize.w, firstSize.h], compress: true });
  pdf.setProperties({ title });
  let first = true;
  const newPage = (size: { w: number; h: number }) => {
    if (!first) pdf.addPage([size.w, size.h], orientation(size));
    first = false;
  };

  if (overview || pages.length === 0) {
    newPage(overviewSize);
    drawHeader(pdf, overviewSize, title, labels.overview, '');
    pdf.addImage(canvas, 'PNG', MARGIN, MARGIN + HEADER, layout.width * PX_TO_PT, layout.height * PX_TO_PT, undefined, 'FAST');
  }
  pages.forEach((p, i) => {
    const size = sizes[i];
    newPage(size);
    drawHeader(pdf, size, title, p.title || labels.phase(p.index + 1), layout.objective);
    const image = crop(canvas, scale, [{ x0: 0, x1: layout.stripRight }, p], p.top, layout.height);
    const w = (layout.stripRight + p.x1 - p.x0) * PX_TO_PT;
    const h = (layout.height - p.top) * PX_TO_PT;
    pdf.addImage(image.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN + HEADER, w, h, undefined, 'FAST');
  });

  if (notes.length) addNotes(pdf, title, notes, labels, { w: 842, h: 595 });
  numberPages(pdf, labels);
  return pdf.output('blob');
}

/** "n / total" at the bottom right of every page. */
function numberPages(pdf: Pdf, labels: PdfLabels) {
  const total = pdf.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    pdf.setPage(n);
    const { width, height } = pdf.internal.pageSize;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(139, 145, 156);
    pdf.text(labels.page(n, total), (width as number) - MARGIN, (height as number) - MARGIN / 2, { align: 'right' });
  }
}

type Pdf = InstanceType<(typeof import('jspdf'))['jsPDF']>;

/** Appends the activity notes as text pages. */
function addNotes(pdf: Pdf, title: string, notes: NoteEntry[], labels: PdfLabels, paper: { w: number; h: number }) {
  pdf.addPage([paper.w, paper.h], paper.w > paper.h ? 'landscape' : 'portrait');
  const width = Math.min(paper.w - 2 * MARGIN, 640);
  const bottom = paper.h - MARGIN;
  let y = MARGIN + 10;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(25, 27, 32);
  pdf.text(`${labels.notes} · ${title}`, MARGIN, y);
  y += 28;

  for (const entry of notes) {
    const heading = `${labels.step(entry.stepIndex + 1)}${entry.stepTitle ? ` · ${entry.stepTitle}` : ''}  —  ${entry.persona}`;
    const activity: string[] = entry.activity ? pdf.splitTextToSize(entry.activity, width) : [];
    const body: string[] = pdf.splitTextToSize(entry.note, width);
    const needed = 16 + activity.length * 13 + body.length * 14 + 14;
    if (y + needed > bottom) {
      pdf.addPage([paper.w, paper.h], paper.w > paper.h ? 'landscape' : 'portrait');
      y = MARGIN + 10;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(47, 85, 212);
    pdf.text(heading, MARGIN, y);
    y += 15;
    if (activity.length) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.setTextColor(91, 98, 112);
      pdf.text(activity, MARGIN, y);
      y += activity.length * 13;
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.setTextColor(25, 27, 32);
    pdf.text(body, MARGIN, y);
    y += body.length * 14 + 14;
  }
}
