// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect } from 'react';
import { activeMap, useMap, useStore, useT } from '../store';
import { normalizePhases, phaseIndexOf } from '../model/ops';
import { boardRef } from './Board';
import { isDesktop } from '../lib/fileio';
import { ChevronLeft, ChevronRight, CloseIcon } from './Icons';

let zoomBefore = 1;
/** Stops listening for the window leaving full screen. */
let unwatchFullscreen: (() => void) | null = null;

async function setFullscreen(on: boolean) {
  try {
    if (isDesktop) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setFullscreen(on);
    } else if (on && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen?.();
    } else if (!on && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // Presenting still works in a normal window.
  }
}

/**
 * Leaving full screen some other way (Esc in Safari, which keeps the key for
 * itself, or the window's own button) ends the presentation too.
 */
async function watchFullscreenExit() {
  unwatchFullscreen?.();
  unwatchFullscreen = null;
  try {
    if (isDesktop) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      // macOS animates into full screen: only a window seen full screen can leave it.
      let seen = await win.isFullscreen();
      const unlisten = await win.onResized(async () => {
        const full = await win.isFullscreen();
        if (full) seen = true;
        else if (seen) stopPresentation();
      });
      unwatchFullscreen = unlisten;
    } else if (document.fullscreenElement) {
      const onChange = () => {
        if (!document.fullscreenElement) stopPresentation();
      };
      document.addEventListener('fullscreenchange', onChange);
      unwatchFullscreen = () => document.removeEventListener('fullscreenchange', onChange);
    }
  } catch {
    // Esc and the close button still end it.
  }
}

export function startPresentation() {
  const s = useStore.getState();
  if (!s.activeId || s.presentStep !== null) return;
  zoomBefore = s.zoom;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  useStore.setState({ sel: null, tool: 'select', linkFrom: null });
  s.setPresentStep(-1);
  setFullscreen(true).then(() => {
    // Started and stopped before full screen came on: nothing to watch.
    if (useStore.getState().presentStep !== null) watchFullscreenExit();
  });
}

export function stopPresentation() {
  const s = useStore.getState();
  if (s.presentStep === null) return;
  unwatchFullscreen?.();
  unwatchFullscreen = null;
  s.setPresentStep(null);
  s.setZoom(zoomBefore);
  setFullscreen(false);
}

/** Moves through the presentation: -1 is the overview, then each step. */
export function presentGo(delta: number | 'overview') {
  const s = useStore.getState();
  if (s.presentStep === null) return;
  const last = activeMap(s).steps.length - 1;
  const next = delta === 'overview' ? -1 : Math.min(last, Math.max(-1, s.presentStep + delta));
  s.setPresentStep(next);
}

/** Fits the whole board in the window. */
function fitZoom(): number {
  const board = boardRef.current;
  const canvas = board?.closest('.canvas');
  if (!board || !(canvas instanceof HTMLElement)) return 1;
  const w = (canvas.clientWidth - 64) / board.offsetWidth;
  const h = (canvas.clientHeight - 140) / board.offsetHeight;
  return Math.min(1, w, h);
}

/** Bottom bar and board focus while presenting. */
export function PresentationBar() {
  const t = useT();
  const step = useStore((s) => s.presentStep);
  const doc = useMap((m) => m);
  const title = useStore((s) => s.project.title);
  const setZoom = useStore((s) => s.setZoom);

  // Overview fits the board; a step is shown at full size and centred.
  useEffect(() => {
    if (step === null) return;
    if (step < 0) {
      setZoom(fitZoom());
      return;
    }
    setZoom(1);
    const id = doc.steps[step]?.id;
    requestAnimationFrame(() => {
      boardRef.current
        ?.querySelector(`.step[data-step="${CSS.escape(id ?? '')}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
    // Only when the step changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (step === null) return null;
  const total = doc.steps.length;
  const current = step >= 0 ? doc.steps[step] : null;
  const phases = normalizePhases(doc.phases, total);
  const phase = current ? phases[phaseIndexOf(phases, step)]?.title : '';
  return (
    <div className="present-bar" role="toolbar" aria-label={t('present.start')}>
      <button className="present-btn" aria-label={t('present.prev')} disabled={step < 0} onClick={() => presentGo(-1)}>
        <ChevronLeft size={18} />
      </button>
      <div className="present-title" aria-live="polite">
        {current ? (
          <>
            <span className="present-kicker">
              {t('present.step', { n: step + 1, total })}
              {phase ? ` · ${phase}` : ''}
            </span>
            <span className="present-name">{current.title || t('board.step', { n: step + 1 })}</span>
          </>
        ) : (
          <>
            <span className="present-kicker">{t('present.overview')}</span>
            <span className="present-name">{title || t('app.untitled')}</span>
          </>
        )}
      </div>
      <button className="present-btn" aria-label={t('present.next')} disabled={step >= total - 1} onClick={() => presentGo(1)}>
        <ChevronRight size={18} />
      </button>
      <span className="present-hint">{t('present.hint')}</span>
      <button className="present-btn" aria-label={t('present.exit')} title={t('present.exit')} onClick={stopPresentation}>
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

/** CSS that dims every step but the presented one, and hides the arrows that don't touch it. */
export function PresentationFocus() {
  const step = useStore((s) => s.presentStep);
  const id = useStore((s) => (s.presentStep !== null && s.presentStep >= 0 ? activeMap(s).steps[s.presentStep]?.id : null));
  if (step === null || !id) return null;
  const stepId = CSS.escape(id);
  const dim = `.board.presenting [data-step]:not([data-step="${stepId}"])`;
  const hide = `.board.presenting [data-link-steps]:not([data-link-steps~="${stepId}"])`;
  return <style>{`${dim} { opacity: 0.18; } ${hide} { opacity: 0; }`}</style>;
}
