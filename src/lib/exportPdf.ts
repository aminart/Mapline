// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { BoardLayout } from './exportImage';
import type { NoteEntry } from '../model/ops';
import { parseColor } from './boardShapes';

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

export interface PlannedPage {
  /** Board slice (layout px) shown next to the persona column. */
  x0: number;
  x1: number;
  firstStep: number;
  lastStep: number;
  /** Points per layout pixel on this page. */
  k: number;
}

export interface PagePlan {
  /** Points per layout pixel, shared by every page whose steps fit at that scale. */
  k: number;
  pages: PlannedPage[];
}

/** Room for the board on a page: under the header, above the page number. */
function usableArea(page: { w: number; h: number }) {
  return { w: page.w - 2 * MARGIN, h: page.h - 2 * MARGIN - HEADER - FOOTER };
}

/** Points per layout pixel at most on a phase page: 133 %, still sharp at the export's resolution. */
const MAX_PHASE_K = 1;

/** Height of the board printed on detail pages: from under the objective to its last exported row. */
function printedHeight(layout: BoardLayout) {
  return layout.contentBottom - layout.objectiveBottom;
}

/** The scale at which the board, from its objective down, fits the height of the page. */
function heightScale(layout: BoardLayout, page: { w: number; h: number }, max = PX_TO_PT) {
  return Math.min(max, usableArea(page).h / printedHeight(layout));
}

/**
 * Packs steps `from` to `to` page by page at scale `k`, without cutting one
 * in two. A step too wide for a page gets a page of its own, scaled down so
 * that it fits whole: its cards are never cut.
 */
function packSteps(layout: BoardLayout, page: { w: number; h: number }, k: number, from: number, to: number): PlannedPage[] {
  const availW = usableArea(page).w;
  const usableW = availW - layout.stripRight * k;
  const pages: PlannedPage[] = [];
  const { steps } = layout;
  let i = from;
  while (i <= to) {
    const start = steps[i].left - PAD;
    let j = i;
    while (j + 1 <= to && (steps[j + 1].right + PAD - start) * k <= usableW) j++;
    const x1 = steps[j].right + PAD;
    const fit = Math.min(k, availW / (layout.stripRight + x1 - start));
    pages.push({ x0: start, x1, firstStep: i, lastStep: j, k: fit });
    i = j + 1;
  }
  return pages;
}

/**
 * Splits the board into pages: the board is scaled so its height fits the
 * page, then steps are packed page by page without cutting one in two.
 */
export function planPages(layout: BoardLayout, page: { w: number; h: number }): PagePlan {
  const k = heightScale(layout, page);
  return { k, pages: layout.steps.length ? packSteps(layout, page, k, 0, layout.steps.length - 1) : [] };
}

export interface PhasePdfPage extends PlannedPage {
  /** Index of the phase, for its default name; -1 when the map has no phases. */
  phase: number;
  title: string;
  /** Which page of its phase this is (from 1), out of `parts`. */
  part: number;
  parts: number;
}

/**
 * Pages of the "one page per phase" PDF: each phase starts a new page, at
 * the scale of the A4 pages; a phase too wide for one page goes on over the
 * next ones, cut between steps.
 */
export function planPhasePdfPages(layout: BoardLayout, page: { w: number; h: number }): PhasePdfPage[] {
  const { steps } = layout;
  if (steps.length === 0) return [];
  const k = heightScale(layout, page);
  // The steps under each phase: those whose middle lies inside it.
  const groups = layout.phases
    .map((ph, index) => {
      const inside = steps.map((s, i) => ({ i, mid: (s.left + s.right) / 2 })).filter((s) => s.mid >= ph.left && s.mid <= ph.right);
      return { index, title: ph.title, from: inside[0]?.i, to: inside[inside.length - 1]?.i };
    })
    .filter((g): g is { index: number; title: string; from: number; to: number } => g.from !== undefined);
  if (groups.length === 0) groups.push({ index: -1, title: '', from: 0, to: steps.length - 1 });
  const availW = usableArea(page).w;
  const tallest = heightScale(layout, page, MAX_PHASE_K);
  return groups.flatMap((g) => {
    const packed = packSteps(layout, page, k, g.from, g.to);
    // A phase that leaves room on its pages is zoomed in, the same on each of them, as far as
    // the height of the page allows. A step scaled down to fit a page keeps its scale.
    const grow = Math.min(tallest, ...packed.filter((p) => p.k >= k).map((p) => availW / (layout.stripRight + p.x1 - p.x0)));
    const pages = packed.map((p) => (p.k >= k ? { ...p, k: Math.max(k, grow) } : p));
    return pages.map((p, n) => ({ ...p, phase: g.index, title: g.title, part: n + 1, parts: pages.length }));
  });
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

/** One slide per phase (PowerPoint): its steps, with the phase box on top and without the objective. */
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

  // Detail pages: A4 or A3 cut between steps, or A4 with each phase starting a page.
  const paper = mode === 'phases' ? PAPER.a4 : PAPER[mode];
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [paper.w, paper.h], compress: true });
  pdf.setProperties({ title });
  const stepsLabel = (p: PlannedPage) => (p.firstStep === p.lastStep ? labels.step(p.firstStep + 1) : labels.steps(p.firstStep + 1, p.lastStep + 1));
  const pages: (PlannedPage & { label: string })[] =
    mode === 'phases'
      ? planPhasePdfPages(layout, paper).map((p) => {
          const name = p.phase < 0 ? '' : p.title || labels.phase(p.phase + 1);
          return { ...p, label: [name, p.parts > 1 || !name ? stepsLabel(p) : ''].filter(Boolean).join(' · ') };
        })
      : planPages(layout, paper).pages.map((p) => ({ ...p, label: stepsLabel(p) }));
  let first = true;

  const header = (right: string, subtitle: string) => {
    if (!first) pdf.addPage([paper.w, paper.h], 'landscape');
    first = false;
    drawHeader(pdf, paper, title, right, subtitle);
  };

  if (overview || pages.length === 0) {
    const { w: availW, h: availH } = usableArea(paper);
    const k = Math.min(availW / layout.width, availH / layout.height);
    const w = layout.width * k;
    const h = layout.height * k;
    header(labels.overview, '');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN + (availW - w) / 2, MARGIN + HEADER, w, h, undefined, 'FAST');
  }

  const top = layout.objectiveBottom;
  const bottom = layout.contentBottom;
  for (const p of pages) {
    header(p.label, layout.objective);
    const image = crop(canvas, scale, [{ x0: 0, x1: layout.stripRight }, p], top, bottom);
    const x = MARGIN;
    const y = MARGIN + HEADER;
    const w = (layout.stripRight + (p.x1 - p.x0)) * p.k;
    pdf.addImage(image.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, w, (bottom - top) * p.k, undefined, 'FAST');
    // A phase that began on an earlier page: repeat its name where it enters this one.
    for (const ph of layout.phases) {
      if (!ph.title || ph.left >= p.x0 || ph.right <= p.x0) continue;
      const px = x + (layout.stripRight + 14) * p.k;
      const py = y + (ph.top - top + ph.height / 2) * p.k;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(ph.size * p.k);
      const [r, g, b] = pdfTextColor(ph.color);
      pdf.setTextColor(r, g, b);
      pdf.text(ph.title, px, py, { baseline: 'middle' });
    }
  }

  if (notes.length) addNotes(pdf, title, notes, labels, paper);
  numberPages(pdf, labels);
  return pdf.output('blob');
}

/**
 * A CSS colour as jsPDF takes it (0–255 each). jsPDF throws on anything but
 * plain colours, e.g. the `rgba(0,0,0,0)` of a see-through field: such a
 * colour, or one that can't be read, falls back to the phase title blue.
 */
export function pdfTextColor(css: string): [number, number, number] {
  const c = parseColor(css);
  const hex = c?.hex ?? '1E3A9E';
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
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

/** Where a sitemap's parts are on its rendered picture, in layout pixels. */
export interface SitemapPdfLayout {
  /** The whole picture. */
  width: number;
  height: number;
  /** The tree, from its first level down; its level column ends at `railRight`. */
  treeTop: number;
  treeBottom: number;
  railRight: number;
  /** Each branch of the tree: a page each. */
  branches: { x0: number; x1: number; top: number; name: string }[];
  /** The global screens, when there are some. */
  globals: { top: number; bottom: number } | null;
  /** The counts, under the title of each page. */
  summary: string;
}

export interface SitemapPdfPage {
  /** Slices of the picture laid side by side (layout px), from `top` to `bottom`. */
  parts: { x0: number; x1: number }[];
  top: number;
  bottom: number;
  /** Points per layout pixel. */
  k: number;
  label: string;
}

/**
 * Pages of a sitemap in PDF: a page per branch, the column naming the levels
 * repeated on its left, then the global screens. A branch wider than the
 * page is scaled down to fit whole; none is shown above 133 %.
 */
export function planSitemapPages(layout: SitemapPdfLayout, page: { w: number; h: number }, labels: { branch: (name: string) => string; globals: string }): SitemapPdfPage[] {
  const { w: availW, h: availH } = usableArea(page);
  const pages: SitemapPdfPage[] = [];
  for (const b of layout.branches) {
    const top = Math.max(layout.treeTop, b.top);
    const treeH = layout.treeBottom - top;
    const parts = [
      { x0: 0, x1: layout.railRight },
      { x0: Math.max(layout.railRight, b.x0 - PAD), x1: Math.min(layout.width, b.x1 + PAD) },
    ];
    const w = parts.reduce((sum, p) => sum + p.x1 - p.x0, 0);
    const k = Math.min(MAX_PHASE_K, availW / w, availH / treeH);
    pages.push({ parts, top, bottom: layout.treeBottom, k, label: labels.branch(b.name) });
  }
  if (layout.globals) {
    const h = layout.globals.bottom - layout.globals.top;
    const k = Math.min(MAX_PHASE_K, availW / layout.width, availH / h);
    pages.push({ parts: [{ x0: 0, x1: layout.width }], top: layout.globals.top, bottom: layout.globals.bottom, k, label: labels.globals });
  }
  return pages;
}

/** A sitemap's PDF: the whole sitemap on the first page, then a page per branch and the global screens. */
export async function sitemapPdfDocument(args: {
  canvas: HTMLCanvasElement;
  scale: number;
  layout: SitemapPdfLayout;
  title: string;
  labels: PdfLabels & { branch: (name: string) => string; globals: string };
}): Promise<Blob> {
  const { canvas, scale, layout, title, labels } = args;
  const { jsPDF } = await import('jspdf');
  const paper = PAPER.a4;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [paper.w, paper.h], compress: true });
  pdf.setProperties({ title });
  const { w: availW, h: availH } = usableArea(paper);

  drawHeader(pdf, paper, title, labels.overview, layout.summary);
  const k0 = Math.min(availW / layout.width, availH / layout.height);
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN + (availW - layout.width * k0) / 2, MARGIN + HEADER, layout.width * k0, layout.height * k0, undefined, 'FAST');

  for (const p of planSitemapPages(layout, paper, labels)) {
    pdf.addPage([paper.w, paper.h], 'landscape');
    drawHeader(pdf, paper, title, p.label, layout.summary);
    const image = crop(canvas, scale, p.parts, p.top, p.bottom);
    const w = p.parts.reduce((sum, part) => sum + part.x1 - part.x0, 0) * p.k;
    pdf.addImage(image.toDataURL('image/jpeg', 0.92), 'JPEG', MARGIN, MARGIN + HEADER, w, (p.bottom - p.top) * p.k, undefined, 'FAST');
  }
  numberPages(pdf, labels);
  return pdf.output('blob');
}
