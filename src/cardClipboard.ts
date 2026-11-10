// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Copy, paste and duplicate cards with the keyboard: Ctrl+C, Ctrl+V and
 * Ctrl+D on the selected card of a map or a flow. The copied card stays
 * available across the project's documents and the open projects, so a
 * card can go from one map to another, or between a map and a flow.
 *
 * Text editing keeps its own shortcuts: with some text selected, Ctrl+C
 * copies that text, and Ctrl+V pastes text unless the clipboard still holds
 * the card last copied.
 */

import { activeFlow, activeMap, useStore } from './store';
import { findDoc, projectPersonas } from './model/project';
import { activityKeyOf } from './model/ops';
import { findNode } from './model/flow';
import { clipFromFlow, clipFromMap, clipText, pasteInCell, pasteInFlow, pasteOnMap, type CardClip } from './model/clipboard';
import type { Id } from './model/types';

/** Clipboard format holding the card itself, for another window of the app. */
const MIME = 'application/x-mapline-card';

let clip: CardClip | null = null;

/** The card last copied, if any. */
export function copiedCard(): CardClip | null {
  return clip;
}

type Source = { doc: 'map'; key: string } | { doc: 'flow'; id: Id };
type Target = Source | { doc: 'cell'; personaId: Id; slotId: Id } | { doc: 'flow-end' };

/** The selected card of the document shown. */
function selectedCard(): Source | null {
  const s = useStore.getState();
  if (s.presentStep !== null || !s.activeId || !s.sel) return null;
  const kind = findDoc(s.project, s.docId)?.kind;
  if (kind === 'mission-map' && s.sel.startsWith('act:')) {
    const key = activityKeyOf(activeMap(s), s.sel.slice('act:'.length));
    return key ? { doc: 'map', key } : null;
  }
  const flow = activeFlow(s);
  if (kind === 'flow' && flow && s.sel.startsWith('node:')) {
    const id = s.sel.slice('node:'.length);
    return findNode(flow, id) ? { doc: 'flow', id } : null;
  }
  return null;
}

const editable = (el: Element | null) => el?.closest<HTMLElement>('input, textarea, select, [contenteditable]') ?? null;
/** A card's own text, where these shortcuts work alongside typing. */
const isCardText = (el: HTMLElement) => el.matches('.card > textarea, .flow-text, .flow-pill-text');

function hasTextSelection(el: HTMLElement | null): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    try {
      return el.selectionStart !== null && el.selectionStart !== el.selectionEnd;
    } catch {
      return false;
    }
  }
  const sel = window.getSelection();
  return Boolean(sel && !sel.isCollapsed && sel.toString());
}

/**
 * Where the focus lets the card shortcuts act: nowhere when typing in a
 * field other than a card's text, or in a dialog.
 */
function cardFocus(): { field: HTMLElement | null } | null {
  const active = document.activeElement;
  if (active?.closest('dialog, [role="dialog"]')) return null;
  const field = editable(active);
  if (field && !isCardText(field)) return null;
  return { field };
}

/** Where a paste goes: next to the selected card, in the focused empty cell, or at the end of the flow. */
function pasteTarget(): Target | null {
  const card = selectedCard();
  if (card) return card;
  const s = useStore.getState();
  if (s.presentStep !== null || !s.activeId) return null;
  const kind = findDoc(s.project, s.docId)?.kind;
  const cell = document.activeElement?.closest<HTMLElement>('.cell[data-persona][data-slot]');
  if (kind === 'mission-map' && cell) return { doc: 'cell', personaId: cell.dataset.persona!, slotId: cell.dataset.slot! };
  if (kind === 'flow' && !s.sel) return { doc: 'flow-end' };
  return null;
}

function copyOf(card: Source): CardClip | null {
  const s = useStore.getState();
  if (card.doc === 'map') return clipFromMap(activeMap(s), card.key);
  const flow = activeFlow(s);
  return flow ? clipFromFlow(flow, card.id) : null;
}

/** Puts `c` at `target`, as one undo step, and selects the new card. */
function place(c: CardClip, target: Target, fill = true) {
  const s = useStore.getState();
  let made: Id | null = null;
  if (target.doc === 'map' || target.doc === 'cell') {
    s.apply((map) => {
      const r = target.doc === 'map' ? pasteOnMap(map, c, target.key, fill) : pasteInCell(map, c, target.personaId, target.slotId);
      made = r.activityId;
      return r.doc;
    });
    if (made) s.focusLater(`act:${made}`);
    return;
  }
  const known = new Set(projectPersonas(s.project).map((p) => p.persona.id));
  s.applyFlow((flow) => {
    const r = pasteInFlow(flow, c, target.doc === 'flow' ? target.id : null, (id) => known.has(id), fill);
    made = r.nodeId;
    return r.flow;
  });
  if (made) s.focusLater(`node:${made}`);
}

/** A copy of the selected card right next to it; returns false when no card is selected. */
export function duplicateSelectedCard(): boolean {
  const card = selectedCard();
  const c = card && copyOf(card);
  if (!card || !c) return false;
  place(c, card, false);
  return true;
}

/**
 * Whether the system clipboard surely holds the card's text (written by the
 * copy event or the clipboard API), so a paste can tell it from other text.
 */
let written = false;
/** Something else may have been copied since the card, when its text couldn't be written. */
let superseded = false;

/** Copies the selected card; returns false when no card is selected. */
export function copySelectedCard(data?: DataTransfer | null): boolean {
  const card = selectedCard();
  const c = card && copyOf(card);
  if (!c) return false;
  clip = c;
  superseded = false;
  if (data) {
    data.setData('text/plain', clipText(c));
    try {
      data.setData(MIME, JSON.stringify(c));
    } catch {
      // The plain text is enough within this window.
    }
    written = true;
  } else {
    // Best effort, so the card's text can be pasted in another app.
    written = false;
    navigator.clipboard
      ?.writeText(clipText(c))
      .then(() => {
        if (clip === c) written = true;
      })
      .catch(() => {});
  }
  return true;
}

/** Whether the system clipboard (as `data` shows it) still holds the card last copied. */
function holdsCopiedCard(data: DataTransfer): boolean {
  if (!clip) return false;
  return written ? data.getData('text/plain') === clipText(clip) : !superseded;
}

/** Pastes the copied card (or the one in `data`); returns false when there is nowhere to put it. */
export function pasteCard(data?: DataTransfer | null): boolean {
  const target = pasteTarget();
  if (!target) return false;
  let c = clip;
  if (data) {
    let carried: CardClip | null = null;
    try {
      const raw = data.getData(MIME);
      carried = raw ? (JSON.parse(raw) as CardClip) : null;
    } catch {
      carried = null;
    }
    // Something else was copied since the card: paste it as text.
    if (carried?.card && typeof carried.card.text === 'string') c = carried;
    else if (!holdsCopiedCard(data)) return false;
  }
  if (!c) return false;
  place(c, target);
  return true;
}

/**
 * Listens for the shortcuts. The copy and paste events carry the system
 * clipboard; WebKit only sends them with no text selected when their
 * "before" event is cancelled, and the key press does the work itself
 * when they don't follow.
 */
export function installCardClipboard(): () => void {
  let pendingCopy = false;
  let pendingPaste = false;

  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const k = e.key.toLowerCase();
    if (k !== 'c' && k !== 'v' && k !== 'd') return;
    const focus = cardFocus();
    if (!focus) return;
    if (k === 'd') {
      if (duplicateSelectedCard()) e.preventDefault();
      return;
    }
    if (k === 'c') {
      if (hasTextSelection(focus.field) || !selectedCard()) return;
      pendingCopy = true;
      setTimeout(() => {
        if (pendingCopy) copySelectedCard();
        pendingCopy = false;
      });
      return;
    }
    if (!clip || !pasteTarget()) return;
    // In a card's text the paste event always comes, with what was copied last.
    if (focus.field) return;
    pendingPaste = true;
    setTimeout(() => {
      if (pendingPaste) pasteCard();
      pendingPaste = false;
    });
  };

  // Cancelling them enables copy and paste with no text selected, in WebKit.
  const onBeforeCopy = (e: Event) => {
    if (pendingCopy) e.preventDefault();
  };
  const onBeforePaste = (e: Event) => {
    if (pendingPaste) e.preventDefault();
  };

  const onCopy = (e: ClipboardEvent) => {
    if (!pendingCopy) {
      // Some text copied: a later paste is that text, not the card.
      superseded = true;
      return;
    }
    pendingCopy = false;
    if (copySelectedCard(e.clipboardData)) e.preventDefault();
  };

  const onPaste = (e: ClipboardEvent) => {
    pendingPaste = false;
    const focus = cardFocus();
    if (!focus || !e.clipboardData) return;
    // Outside a text field nothing else would be pasted: the card copied last is.
    if (pasteCard(e.clipboardData) || (!focus.field && pasteCard())) e.preventDefault();
  };

  // Back from another app, which may have put something else on the clipboard.
  const onBlur = () => {
    superseded = true;
  };

  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', onBlur);
  document.addEventListener('beforecopy', onBeforeCopy, true);
  document.addEventListener('beforepaste', onBeforePaste, true);
  document.addEventListener('copy', onCopy, true);
  document.addEventListener('cut', onBlur, true);
  document.addEventListener('paste', onPaste, true);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('beforecopy', onBeforeCopy, true);
    document.removeEventListener('beforepaste', onBeforePaste, true);
    document.removeEventListener('copy', onCopy, true);
    document.removeEventListener('cut', onBlur, true);
    document.removeEventListener('paste', onPaste, true);
  };
}
