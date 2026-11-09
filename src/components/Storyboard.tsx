// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useMap, useStore, useT } from '../store';
import * as ops from '../model/ops';
import type { SceneView, Step } from '../model/types';
import { readImage } from '../lib/image';
import { withBusy } from '../actions';
import { useBox } from './useBox';
import { CloseIcon, CropIcon, ImageIcon } from './Icons';
import { cls } from './cls';
import { FitText } from './FitText';

export function StoryboardRow() {
  const t = useT();
  const steps = useMap((m) => m.steps);
  const apply = useStore((s) => s.apply);
  return (
    <div className="grid-row storyboard-row">
      <div className="row-head">
        <span className="eyebrow eyebrow-accent">{t('sb.title')}</span>
        <span className="muted">{t('sb.text')}</span>
        <button className="chip no-export" onClick={() => apply((d) => ({ ...d, storyboard: false }))}>
          {t('sb.hide')}
        </button>
      </div>
      {steps.map((s) => (
        <SceneCell key={s.id} step={s} />
      ))}
      <div />
    </div>
  );
}

function SceneCell({ step }: { step: Step }) {
  const t = useT();
  const scene = useMap((m) => m.scenes[step.id]);
  const apply = useStore((s) => s.apply);
  const b = useBox<HTMLTextAreaElement>(`scene:${step.id}`, 'scene');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reframing, setReframing] = useState(false);

  async function load(file: File | undefined) {
    setError(null);
    if (!file) return;
    const img = await withBusy(t('busy.image'), () => readImage(file).catch(() => null));
    if (!img) {
      setError(t('sb.badImage'));
      return;
    }
    setReframing(false);
    // A new picture starts centred: the framing of the previous one means nothing for it.
    apply((d) => ops.setSceneView(ops.setScene(d, step.id, { img }), step.id, ops.DEFAULT_SCENE_VIEW));
  }

  const img = scene?.img ?? null;
  const text = scene?.text ?? '';
  return (
    <div className={cls('box scene', b.selected && 'is-selected')} style={{ ...b.box, gridColumn: `span ${step.slots.length}` }} data-step={step.id}>
      {img ? (
        <SceneImage
          stepId={step.id}
          img={img}
          alt={text || t('sb.alt', { name: step.title })}
          view={ops.sceneView(scene)}
          reframing={reframing}
          onReframe={setReframing}
          onReplace={load}
          onRemove={() => { setReframing(false); apply((d) => ops.setSceneView(ops.setScene(d, step.id, { img: null }), step.id, ops.DEFAULT_SCENE_VIEW)); }}
        />
      ) : (
        <label
          className={cls('scene-drop file-label no-export', dragOver && 'is-over')}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); load(e.dataTransfer.files?.[0]); }}
        >
          <ImageIcon />
          <span>{t('sb.addImage')}</span>
          <span className="muted-sm">{t('sb.drop')}</span>
          <input type="file" accept="image/*" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      )}
      {error && <span className="error-sm" role="alert">{error}</span>}
      <FitText
        ref={b.ref}
        aria-label={t('sb.description')}
        value={text}
        placeholder={t('sb.describe')}
        onFocus={b.onFocus}
        onChange={(e) => {
          const v = e.target.value;
          apply((d) => ops.setScene(d, step.id, { text: v }), { coalesce: `scene:${step.id}` });
        }}
        style={b.text}
      />
    </div>
  );
}

interface SceneImageProps {
  stepId: string;
  img: string;
  alt: string;
  view: SceneView;
  reframing: boolean;
  onReframe: (on: boolean) => void;
  onReplace: (file: File | undefined) => void;
  onRemove: () => void;
}

/** Zoom gained or lost per wheel notch, and per press of the zoom buttons. */
const WHEEL_STEP = 1.1;
const BUTTON_STEP = 0.25;
/** Arrow keys move the view by this many percent (Shift: five times more). */
const KEY_STEP = 2;

/**
 * A scene's picture, filling its block. In reframe mode, dragging the picture
 * chooses which part of it shows, and the wheel or the buttons zoom in.
 */
function SceneImage({ stepId, img, alt, view, reframing, onReframe, onReplace, onRemove }: SceneImageProps) {
  const t = useT();
  const apply = useStore((s) => s.apply);
  const frame = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; view: SceneView; rangeX: number; rangeY: number } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const coalesce = `sceneView:${stepId}`;
  const setView = (v: SceneView) => apply((d) => ops.setSceneView(d, stepId, v), { coalesce });
  const zoomBy = (factor: number) => {
    const v = viewRef.current;
    setView({ ...v, zoom: Math.min(ops.SCENE_MAX_ZOOM, Math.max(1, v.zoom * factor)) });
  };

  /**
   * How far the picture can travel inside the frame, in screen pixels, on each axis.
   * The picture covers the frame, then is scaled about its focus point: its left
   * edge then sits at x% × (frame width − zoom × covered width), so moving the
   * focus by 1% moves the picture by 1% of that range.
   */
  function ranges(zoom: number) {
    const f = frame.current?.getBoundingClientRect();
    const i = picture.current;
    if (!f || !i || !i.naturalWidth || !i.naturalHeight) return { rangeX: 0, rangeY: 0 };
    const cover = Math.max(f.width / i.naturalWidth, f.height / i.naturalHeight);
    return {
      rangeX: zoom * i.naturalWidth * cover - f.width,
      rangeY: zoom * i.naturalHeight * cover - f.height,
    };
  }

  // The wheel zooms the picture rather than scrolling the page, which needs a non passive listener.
  useEffect(() => {
    const el = frame.current;
    if (!el || !reframing) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      zoomBy(e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // A click anywhere else, or Escape, ends reframing.
  useEffect(() => {
    if (!reframing) return;
    const onDown = (e: PointerEvent) => {
      if (!frame.current?.contains(e.target as Node)) onReframe(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onReframe(false);
      }
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [reframing, onReframe]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!reframing || e.button !== 0 || (e.target as HTMLElement).closest('.scene-img-actions, .scene-reframe-bar, .scene-reframe-hint')) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, view: viewRef.current, ...ranges(viewRef.current.zoom) };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    // Dragging right brings the left of the picture into view: the focus moves left.
    const x = d.rangeX > 0 ? d.view.x - ((e.clientX - d.x) / d.rangeX) * 100 : d.view.x;
    const y = d.rangeY > 0 ? d.view.y - ((e.clientY - d.y) / d.rangeY) * 100 : d.view.y;
    setView({ ...viewRef.current, x, y });
  }

  function onPointerUp() {
    drag.current = null;
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!reframing) return;
    const step = e.shiftKey ? KEY_STEP * 5 : KEY_STEP;
    const v = viewRef.current;
    const moves: Record<string, Partial<SceneView>> = {
      ArrowLeft: { x: v.x - step },
      ArrowRight: { x: v.x + step },
      ArrowUp: { y: v.y - step },
      ArrowDown: { y: v.y + step },
    };
    if (moves[e.key]) setView({ ...v, ...moves[e.key] });
    else if (e.key === '+' || e.key === '=') zoomBy(WHEEL_STEP);
    else if (e.key === '-') zoomBy(1 / WHEEL_STEP);
    else if (e.key === 'Enter') onReframe(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  const isDefault = view.x === 50 && view.y === 50 && view.zoom === 1;
  return (
    <div
      ref={frame}
      className={cls('scene-img', reframing && 'is-reframing')}
      tabIndex={reframing ? 0 : undefined}
      role={reframing ? 'application' : undefined}
      aria-label={reframing ? t('sb.reframeHint') : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).closest('.scene-img-actions, .scene-reframe-bar, .scene-reframe-hint')) onReframe(!reframing);
      }}
    >
      <img
        ref={picture}
        src={img}
        alt={alt}
        draggable={false}
        style={{
          objectPosition: `${view.x}% ${view.y}%`,
          transform: view.zoom !== 1 ? `scale(${view.zoom})` : undefined,
          transformOrigin: `${view.x}% ${view.y}%`,
        }}
      />
      {reframing ? (
        <>
          <span className="scene-reframe-hint no-export">{t('sb.reframeHint')}</span>
          <div className="scene-reframe-bar no-export">
            <button className="chip chip-raised chip-icon" aria-label={t('sb.zoomOut')} disabled={view.zoom <= 1} onClick={() => setView({ ...view, zoom: Math.max(1, view.zoom - BUTTON_STEP) })}>
              −
            </button>
            <button className="chip chip-raised chip-icon" aria-label={t('sb.zoomIn')} disabled={view.zoom >= ops.SCENE_MAX_ZOOM} onClick={() => setView({ ...view, zoom: Math.min(ops.SCENE_MAX_ZOOM, view.zoom + BUTTON_STEP) })}>
              +
            </button>
            <button className="chip chip-raised" disabled={isDefault} onClick={() => setView(ops.DEFAULT_SCENE_VIEW)}>
              {t('sb.resetView')}
            </button>
            <button className="chip chip-raised chip-primary" onClick={() => onReframe(false)}>
              {t('sb.reframeDone')}
            </button>
          </div>
        </>
      ) : (
        <div className="scene-img-actions no-export">
          <button
            className="chip chip-raised chip-icon"
            aria-label={t('sb.reframe')}
            title={t('sb.reframe')}
            onClick={() => { onReframe(true); requestAnimationFrame(() => frame.current?.focus()); }}
          >
            <CropIcon />
          </button>
          <label className="chip chip-raised file-label">
            {t('sb.replace')}
            <input type="file" accept="image/*" onChange={(e) => { onReplace(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button className="chip chip-raised chip-icon" aria-label={t('sb.removeImage')} onClick={onRemove}>
            <CloseIcon size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
