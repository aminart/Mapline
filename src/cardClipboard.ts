// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Copy, paste and duplicate cards with the keyboard: Ctrl+C, Ctrl+V and
 * Ctrl+D on the selected card of a map or a flow. The copied card stays
 * available across the project's documents and the open projects, so a
 * card can go from one map to another, or between a map and a flow.
 *
 * Several cards, steps or phases picked together (Shift or Cmd/Ctrl +
 * click) are copied and pasted as one group: cards keep their layout and
 * the arrows between them, steps and phases come with all their cards,
 * scenes and texts. Delete removes the picked cards or steps.
 *
 * Text editing keeps its own shortcuts: with some text selected, Ctrl+C
 * copies that text, and Ctrl+V pastes text unless the clipboard still holds
 * the card last copied.
 */

import { activeFlow, activeMap, selectedKeys, t, useStore } from './store';
import { findDoc, projectPersonas } from './model/project';
import { activityKeyOf, normalizePhases, phaseIndexOf, removeActivity, removeStep } from './model/ops';
import { findNode, removeNode } from './model/flow';
import { clipFromFlow, clipFromMap, clipText as cardText, pasteInCell, pasteInFlow, pasteOnMap, type CardClip } from './model/clipboard';
import { blockFromFlow, blockFromMap, columnsFromPhases, columnsFromSteps, pasteBlockInFlow, pasteBlockOnMap, pasteColumns, type CardBlock, type ColumnsBlock, type MapAnchor } from './model/blocks';
import { flowsDetailing } from './model/links';
import type { Blueprint, Id } from './model/types';

/** Clipboard format holding the card itself, for another window of the app. */
const MIME = 'application/x-mapline-card';

/** What was copied: one card, a group of cards, or steps or phases. */
type Clip = { kind: 'card'; card: CardClip } | CardBlock | ColumnsBlock;

let clip: Clip | null = null;

/** The card last copied, if a single card was. */
export function copiedCard(): CardClip | null {
  return clip?.kind === 'card' ? clip.card : null;
}

/** What a copy puts on the system clipboard as plain text. */
function clipText(c: Clip): string {
  if (c.kind === 'card') return cardText(c.card);
  if (c.kind === 'cards') return c.cards.map((b) => cardText(b.clip)).join('\n');
  const lines: string[] = [];
  for (const step of c.steps) {
    lines.push(step.title);
    for (const [key, act] of Object.entries(c.activities)) if (step.slots.includes(key.split(':')[1]) && act.text) lines.push(act.text);
  }
  return lines.join('\n');
}

/** Several cards, steps or phases selected together, or one step or phase, on the document shown. */
type Group =
  | { doc: 'map'; kind: 'act'; keys: string[] }
  | { doc: 'map'; kind: 'step' | 'phase'; ids: Id[] }
  | { doc: 'flow'; kind: 'node'; ids: Id[] };

function selectedGroup(): Group | null {
  const s = useStore.getState();
  if (s.presentStep !== null || !s.activeId) return null;
  const keys = selectedKeys(s);
  if (!keys.length) return null;
  const kind = keys[0].split(':')[0];
  const ids = keys.map((k) => k.slice(kind.length + 1));
  const docKind = findDoc(s.project, s.docId)?.kind;
  if (docKind === 'mission-map') {
    const map = activeMap(s);
    if (kind === 'step') return { doc: 'map', kind, ids: ids.filter((id) => map.steps.some((st) => st.id === id)) };
    if (kind === 'phase') return { doc: 'map', kind, ids: ids.filter((id) => map.phases.some((p) => p.id === id)) };
    if (kind === 'act' && keys.length > 1) {
      const found = ids.map((id) => activityKeyOf(map, id)).filter((k): k is string => !!k);
      return found.length ? { doc: 'map', kind, keys: found } : null;
    }
  }
  const flow = activeFlow(s);
  if (docKind === 'flow' && flow && kind === 'node' && keys.length > 1) {
    const found = ids.filter((id) => findNode(flow, id));
    return found.length ? { doc: 'flow', kind, ids: found } : null;
  }
  return null;
}

function groupClip(g: Group): Clip | null {
  const s = useStore.getState();
  if (g.doc === 'flow') {
    const flow = activeFlow(s);
    return flow ? blockFromFlow(flow, g.ids) : null;
  }
  const map = activeMap(s);
  if (g.kind === 'act') return blockFromMap(map, g.keys);
  return g.kind === 'step' ? columnsFromSteps(map, g.ids) : columnsFromPhases(map, g.ids);
}

/** What the selection copies, if anything. */
function selectionClip(): Clip | null {
  const g = selectedGroup();
  if (g) return groupClip(g);
  const card = selectedCard();
  const c = card && copyOf(card);
  return c ? { kind: 'card', card: c } : null;
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
/** A card's own text (or a step's or phase's name), where these shortcuts work alongside typing. */
const isCardText = (el: HTMLElement) => el.matches('.card > textarea, .flow-text, .flow-pill-text, .step textarea, .phase textarea');

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

/** Selects what was just pasted: the box itself when alone, so it can be typed in. */
function selectPasted(keys: string[]) {
  const s = useStore.getState();
  if (keys.length === 1) s.focusLater(keys[0]);
  else if (keys.length) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    s.selectMany(keys);
  }
}

/** Puts a group of cards at `anchor` on the map shown, as one undo step. */
function placeBlockOnMap(block: CardBlock, anchor: MapAnchor) {
  let made: Id[] = [];
  useStore.getState().apply((map) => {
    const r = pasteBlockOnMap(map, block, anchor);
    made = r.activityIds;
    return r.doc;
  });
  selectPasted(made.map((id) => `act:${id}`));
}

/** Puts a group of cards in the flow shown, its top row on the card `atId`'s. */
function placeBlockInFlow(block: CardBlock, atId: Id | null) {
  const s = useStore.getState();
  const known = new Set(projectPersonas(s.project).map((p) => p.persona.id));
  let made: Id[] = [];
  s.applyFlow((flow) => {
    const r = pasteBlockInFlow(flow, block, atId, (id) => known.has(id));
    made = r.nodeIds;
    return r.flow;
  });
  selectPasted(made.map((id) => `node:${id}`));
}

/** Puts steps or phases in the map shown, before step (or phase) `at`. */
function placeColumns(block: ColumnsBlock, at: number) {
  let made: string[] = [];
  useStore.getState().apply((map) => {
    const r = pasteColumns(map, block, at);
    made = block.phases ? r.phaseIds.map((id) => `phase:${id}`) : r.stepIds.map((id) => `step:${id}`);
    return r.doc;
  });
  selectPasted(made);
}

/** The step index of the selected box of the map (a step, a card, a phase's last step), if any. */
function selectedStepIndex(map: Blueprint): number | null {
  const sel = useStore.getState().sel;
  if (!sel) return null;
  if (sel.startsWith('step:')) {
    const i = map.steps.findIndex((st) => st.id === sel.slice('step:'.length));
    return i >= 0 ? i : null;
  }
  if (sel.startsWith('act:')) {
    const slot = activityKeyOf(map, sel.slice('act:'.length))?.split(':')[1];
    const i = map.steps.findIndex((st) => slot && st.slots.includes(slot));
    return i >= 0 ? i : null;
  }
  if (sel.startsWith('phase:')) {
    const phases = normalizePhases(map.phases, map.steps.length);
    const k = phases.findIndex((p) => p.id === sel.slice('phase:'.length));
    if (k < 0) return null;
    return phases.slice(0, k + 1).reduce((n, p) => n + p.span, 0) - 1;
  }
  return null;
}

/** Where pasted steps or phases go on the map shown: after the selection, else at the end. */
function columnsTarget(block: ColumnsBlock): number | null {
  const s = useStore.getState();
  if (s.presentStep !== null || !s.activeId || findDoc(s.project, s.docId)?.kind !== 'mission-map') return null;
  const map = activeMap(s);
  const phases = normalizePhases(map.phases, map.steps.length);
  const sel = s.sel;
  if (block.phases) {
    if (sel?.startsWith('phase:')) {
      const k = phases.findIndex((p) => p.id === sel.slice('phase:'.length));
      if (k >= 0) return k + 1;
    }
    const i = selectedStepIndex(map);
    return i === null ? phases.length : phaseIndexOf(phases, i) + 1;
  }
  const i = selectedStepIndex(map);
  return i === null ? map.steps.length : i + 1;
}

/** The map anchor for a paste on the card or empty cell `target`. */
function anchorOf(target: Target): MapAnchor | null {
  if (target.doc === 'cell') return { personaId: target.personaId, slotId: target.slotId, fill: true };
  if (target.doc !== 'map') return null;
  const [personaId, slotId] = target.key.split(':');
  return { personaId, slotId, fill: true, blankKey: target.key };
}

/** Pastes `c` where the selection says; returns false when there is nowhere to put it. */
function pasteClip(c: Clip): boolean {
  if (c.kind === 'columns') {
    const at = columnsTarget(c);
    if (at === null) return false;
    placeColumns(c, at);
    return true;
  }
  const target = pasteTarget();
  if (!target) return false;
  if (c.kind === 'card') {
    place(c.card, target);
    return true;
  }
  if (target.doc === 'flow' || target.doc === 'flow-end') {
    placeBlockInFlow(c, target.doc === 'flow' ? target.id : null);
    return true;
  }
  const anchor = anchorOf(target);
  if (!anchor) return false;
  placeBlockOnMap(c, anchor);
  return true;
}

/** Whether a paste of `c` has somewhere to go. */
function canPaste(c: Clip): boolean {
  return c.kind === 'columns' ? columnsTarget(c) !== null : pasteTarget() !== null;
}

/** A copy of the selected group right after it; returns false when nothing is selected. */
function duplicateGroup(g: Group): boolean {
  const c = groupClip(g);
  if (!c) return false;
  const s = useStore.getState();
  if (c.kind === 'columns') {
    const map = activeMap(s);
    if (g.kind === 'phase') {
      const phases = normalizePhases(map.phases, map.steps.length);
      placeColumns(c, Math.max(...g.ids.map((id) => phases.findIndex((p) => p.id === id))) + 1);
    } else if (g.kind === 'step') placeColumns(c, Math.max(...g.ids.map((id) => map.steps.findIndex((st) => st.id === id))) + 1);
    return true;
  }
  if (c.kind !== 'cards') return false;
  if (g.doc === 'flow') {
    // On the row of the group's top card.
    const flow = activeFlow(s)!;
    const top = g.ids.map((id) => findNode(flow, id)!).sort((a, b) => a.row - b.row)[0];
    placeBlockInFlow(c, top.id);
    return true;
  }
  if (g.kind !== 'act') return false;
  // Right after the group's last column, its top row where it was.
  const map = activeMap(s);
  const rows = map.personas.map((p) => p.id);
  const cols = map.steps.flatMap((st) => st.slots);
  const cells = g.keys.map((k) => k.split(':'));
  const personaId = rows[Math.min(...cells.map(([p]) => rows.indexOf(p)))];
  const slotId = cols[Math.max(...cells.map(([, sl]) => cols.indexOf(sl)))];
  placeBlockOnMap(c, { personaId, slotId });
  return true;
}

/** Removes the selected cards or steps, when several are selected; returns false otherwise. */
function removeGroup(): boolean {
  const s = useStore.getState();
  if (selectedKeys(s).length < 2) return false;
  const g = selectedGroup();
  if (!g) return false;
  if (g.doc === 'flow') {
    s.applyFlow((flow) => g.ids.reduce((f, id) => removeNode(f, id), flow));
  } else if (g.kind === 'act') {
    const ids = g.keys.map((k) => activeMap(s).activities[k]?.id);
    s.apply((map) => ids.reduce((m, id) => {
      const key = id && activityKeyOf(m, id);
      return key ? removeActivity(m, key) : m;
    }, map));
  } else if (g.kind === 'step') {
    const flows = g.ids.flatMap((id) => flowsDetailing(s.project, s.docId, 'step', id));
    if (flows.length) {
      const names = flows.map((f) => f.name || t('flow.default')).join(', ');
      if (!window.confirm(t('links.confirmRemoveStep', { n: flows.length, names }))) return true;
    }
    s.apply((map) => g.ids.reduce((m, id) => {
      const i = m.steps.findIndex((st) => st.id === id);
      return i >= 0 ? removeStep(m, i) : m;
    }, map));
  } else return false;
  s.select(null);
  return true;
}

/** A copy of the selected card right next to it; returns false when no card is selected. */
export function duplicateSelectedCard(): boolean {
  const g = selectedGroup();
  if (g) return duplicateGroup(g);
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
  const c = selectionClip();
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
  let c = clip;
  if (data) {
    let carried: Clip | null = null;
    try {
      const raw = data.getData(MIME);
      carried = raw ? (JSON.parse(raw) as Clip) : null;
    } catch {
      carried = null;
    }
    if (carried && (carried.kind === 'card' || carried.kind === 'cards' || carried.kind === 'columns')) c = carried;
    // Something else was copied since the card: paste it as text.
    else if (!holdsCopiedCard(data)) return false;
  }
  if (!c) return false;
  return pasteClip(c);
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
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const focus = cardFocus();
      if (focus && !focus.field && removeGroup()) e.preventDefault();
      return;
    }
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
      if (hasTextSelection(focus.field) || !selectionClip()) return;
      pendingCopy = true;
      setTimeout(() => {
        if (pendingCopy) copySelectedCard();
        pendingCopy = false;
      });
      return;
    }
    if (!clip || !canPaste(clip)) return;
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
