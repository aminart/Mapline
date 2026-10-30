// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

const LINE = '#3A3F4A';
const HALO = '#FFFFFF';
/** Matches the on-screen marker: 7 × the 1.75 px stroke. */
const HEAD_LENGTH = 12;
const HEAD_HALF_WIDTH = 6;

/** Offset of `el` from the top-left of the page layout, in unzoomed px. */
function layoutOffset(el: HTMLElement): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export interface RenderOptions {
  /** Pixels per layout pixel: 1, 2 or 3. */
  scale: number;
  /** Leave the background transparent instead of white. */
  transparent: boolean;
  /**
   * Square corners on white, for formats without transparency (JPEG, PDF).
   * Otherwise the board keeps its rounded corners, with nothing behind them.
   */
  flat?: boolean;
  /** Include the storyboard row, when the project shows it. */
  storyboard: boolean;
  /** Include the additional information row, when the project shows it. */
  info: boolean;
}

/** Where things are on the rendered board, in layout pixels. */
export interface BoardLayout {
  width: number;
  height: number;
  /** Right edge of the persona column, repeated on every PDF page. */
  stripRight: number;
  /** Left and right edges of each step column. */
  steps: { left: number; right: number }[];
  /** Bottom of the objective band (and the gap under it). */
  objectiveBottom: number;
  objective: string;
  phases: { left: number; right: number; top: number; height: number; title: string; color: string; size: number }[];
}

/**
 * Renders the board on a canvas.
 *
 * The page is captured by html-to-image without the arrows, which are then
 * drawn directly on the canvas: the SVG copy that html-to-image makes is
 * rendered differently by each engine (WebKit on macOS fills the paths).
 * While capturing, the board is flattened (no shadows: WebKit renders them
 * as grey bands) and empty-field hints are cleared.
 */
export async function renderBoardCanvas(board: HTMLElement, opts: RenderOptions): Promise<{ canvas: HTMLCanvasElement; layout: BoardLayout }> {
  const { toCanvas } = await import('html-to-image');

  const modes = ['is-exporting', opts.transparent && 'export-transparent', opts.flat && 'export-flat', !opts.storyboard && 'export-no-storyboard', !opts.info && 'export-no-info'].filter(
    (c): c is string => Boolean(c),
  );
  board.classList.add(...modes);
  const hinted = Array.from(board.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[placeholder]'));
  const hints = hinted.map((el) => el.placeholder);
  hinted.forEach((el) => (el.placeholder = ''));
  let canvas: HTMLCanvasElement;
  let origin: { x: number; y: number };
  let layer: { x: number; y: number } | null = null;
  let labels: { cx: number; cy: number; w: number; h: number; text: string; color: string; border: string; font: string }[] = [];
  let boardWidth = 0;
  let layout: BoardLayout = { width: 0, height: 0, stripRight: 0, steps: [], objectiveBottom: 0, objective: '', phases: [] };
  try {
    await nextFrame();
    canvas = await toCanvas(board, {
      pixelRatio: opts.scale,
      // Only flat exports are laid on white: elsewhere the rounded corners stay clear.
      backgroundColor: opts.flat ? '#FFFFFF' : undefined,
      // Arrows and their labels are drawn afterwards, labels over the lines.
      filter: (el) => !(el instanceof Element && (el.classList.contains('no-export') || el.classList.contains('links') || el.classList.contains('link-label'))),
    });
    // Measured while the export layout (e.g. without storyboard) applies.
    origin = layoutOffset(board);
    boardWidth = board.offsetWidth;
    const steps = Array.from(board.querySelectorAll<HTMLElement>('.step[data-step]')).map((el) => {
      const x = layoutOffset(el).x - origin.x;
      return { left: x, right: x + el.offsetWidth };
    });
    const objective = board.querySelector<HTMLElement>('.objective');
    const phases = Array.from(board.querySelectorAll<HTMLElement>('.phase')).map((el) => {
      const at = layoutOffset(el);
      const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
      const style = input ? getComputedStyle(input) : null;
      return {
        left: at.x - origin.x,
        right: at.x - origin.x + el.offsetWidth,
        top: at.y - origin.y,
        height: el.offsetHeight,
        title: input?.value ?? '',
        color: style?.color ?? '#1E3A9E',
        size: style ? parseFloat(style.fontSize) : 14,
      };
    });
    layout = {
      width: boardWidth,
      height: board.offsetHeight,
      stripRight: steps.length ? steps[0].left - 6 : boardWidth,
      steps,
      objectiveBottom: objective ? layoutOffset(objective).y - origin.y + objective.offsetHeight + 8 : 0,
      objective: objective?.querySelector('textarea')?.value ?? '',
      phases,
    };
    const svgParent = board.querySelector<SVGSVGElement>('svg.links')?.parentElement;
    if (svgParent) {
      layer = layoutOffset(svgParent);
      const at = layer;
      labels = Array.from(svgParent.querySelectorAll<HTMLElement>(':scope > .link-label')).map((el) => {
        // Positioned by their centre (translate -50%), which offsets ignore.
        const o = layoutOffset(el);
        const style = getComputedStyle(el);
        return {
          cx: o.x - at.x,
          cy: o.y - at.y,
          w: el.offsetWidth,
          h: el.offsetHeight,
          text: el.textContent ?? '',
          color: style.color,
          border: style.borderTopColor,
          font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`,
        };
      });
    }
  } finally {
    hinted.forEach((el, i) => (el.placeholder = hints[i]));
    board.classList.remove(...modes);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return { canvas, layout };
  const lines = Array.from(board.querySelectorAll<SVGPathElement>('svg.links .link-line'));
  if (layer && lines.length > 0) {
    const scale = canvas.width / boardWidth;
    ctx.scale(scale, scale);
    ctx.translate(layer.x - origin.x, layer.y - origin.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const line of lines) {
      const path = new Path2D(line.getAttribute('d') ?? '');
      const color = line.getAttribute('stroke') ?? LINE;
      const dash = (line.getAttribute('stroke-dasharray') ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
      if (!opts.transparent) {
        ctx.setLineDash([]);
        ctx.strokeStyle = HALO;
        ctx.lineWidth = 5;
        ctx.stroke(path);
      }
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.75;
      ctx.stroke(path);
      ctx.setLineDash([]);

      const total = line.getTotalLength();
      const tip = line.getPointAtLength(total);
      const back = line.getPointAtLength(Math.max(0, total - 1));
      const angle = Math.atan2(tip.y - back.y, tip.x - back.x);
      ctx.save();
      ctx.translate(tip.x, tip.y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-HEAD_LENGTH, -HEAD_HALF_WIDTH);
      ctx.lineTo(-HEAD_LENGTH, HEAD_HALF_WIDTH);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    }
    for (const label of labels) drawLabel(ctx, label);
  }
  return { canvas, layout };
}

/** An arrow's label: a white pill with its text, over the line. */
function drawLabel(ctx: CanvasRenderingContext2D, l: { cx: number; cy: number; w: number; h: number; text: string; color: string; border: string; font: string }) {
  const x = l.cx - l.w / 2;
  const y = l.cy - l.h / 2;
  const r = Math.min(10, l.h / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x + 0.5, y + 0.5, l.w - 1, l.h - 1, r);
  else ctx.rect(x + 0.5, y + 0.5, l.w - 1, l.h - 1);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = l.border;
  ctx.stroke();
  ctx.font = l.font;
  ctx.fillStyle = l.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let text = l.text;
  const room = l.w - 14;
  while (text.length > 1 && ctx.measureText(text).width > room) text = text.slice(0, -2) + '…';
  ctx.fillText(text, l.cx, l.cy + 0.5);
}
