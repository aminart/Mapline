// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import type { BlockView, BoxStyle, Id, PersonaSheet, SheetBlock, SheetField, SheetItem } from './types';
import { uid } from './ops';

/** Level a new gauge starts at. */
export const DEFAULT_LEVEL = 50;
export const MAX_SHEET_TAG = 30;

export function setIdentity(sheet: PersonaSheet, patch: Partial<Pick<PersonaSheet, 'name' | 'role' | 'color' | 'photo' | 'quote' | 'sync'>>): PersonaSheet {
  return { ...sheet, ...patch };
}

export function addField(sheet: PersonaSheet, label = ''): { sheet: PersonaSheet; fieldId: Id } {
  const fieldId = uid();
  return { sheet: { ...sheet, fields: sheet.fields.concat([{ id: fieldId, label, value: '' }]) }, fieldId };
}

export function setField(sheet: PersonaSheet, fieldId: Id, patch: Partial<Omit<SheetField, 'id'>>): PersonaSheet {
  return { ...sheet, fields: sheet.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) };
}

export function removeField(sheet: PersonaSheet, fieldId: Id): PersonaSheet {
  return { ...sheet, fields: sheet.fields.filter((f) => f.id !== fieldId) };
}

/** Adds a tag, ignoring blanks and duplicates (case-insensitive). */
export function addSheetTag(sheet: PersonaSheet, tag: string): PersonaSheet {
  const clean = tag.trim().replace(/\s+/g, ' ').slice(0, MAX_SHEET_TAG);
  if (!clean || sheet.tags.some((t) => t.toLowerCase() === clean.toLowerCase())) return sheet;
  return { ...sheet, tags: sheet.tags.concat([clean]) };
}

export function removeSheetTag(sheet: PersonaSheet, tag: string): PersonaSheet {
  return { ...sheet, tags: sheet.tags.filter((t) => t !== tag) };
}

/** A block of `view`, with one empty line to type in (none for text). */
export function newBlock(title: string, view: BlockView, accent: string, items: string[] = ['']): SheetBlock {
  return {
    id: uid(),
    title,
    view,
    accent,
    items: view === 'text' ? [] : items.map((text) => newItem(view, text)),
    text: '',
  };
}

function newItem(view: BlockView, text = ''): SheetItem {
  return view === 'gauges' ? { id: uid(), text, level: DEFAULT_LEVEL } : { id: uid(), text };
}

/** Adds a block at `index` (the end by default). */
export function addBlock(sheet: PersonaSheet, block: SheetBlock, index = sheet.blocks.length): PersonaSheet {
  const blocks = sheet.blocks.slice();
  blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
  return { ...sheet, blocks };
}

export function removeBlock(sheet: PersonaSheet, blockId: Id): PersonaSheet {
  const { [`block:${blockId}`]: _style, ...styles } = sheet.styles;
  return { ...sheet, blocks: sheet.blocks.filter((b) => b.id !== blockId), styles };
}

export function moveBlock(sheet: PersonaSheet, from: number, to: number): PersonaSheet {
  if (from === to || from < 0 || to < 0 || from >= sheet.blocks.length || to >= sheet.blocks.length) return sheet;
  const blocks = sheet.blocks.slice();
  const [moved] = blocks.splice(from, 1);
  blocks.splice(to, 0, moved);
  return { ...sheet, blocks };
}

function mapBlock(sheet: PersonaSheet, blockId: Id, fn: (b: SheetBlock) => SheetBlock): PersonaSheet {
  return { ...sheet, blocks: sheet.blocks.map((b) => (b.id === blockId ? fn(b) : b)) };
}

export function setBlock(sheet: PersonaSheet, blockId: Id, patch: Partial<Pick<SheetBlock, 'title' | 'accent' | 'text'>>): PersonaSheet {
  return mapBlock(sheet, blockId, (b) => ({ ...b, ...patch }));
}

/**
 * Shows a block another way. Lines carry over between the list, tags and
 * gauges views (gauges get a level); text and lines turn into each other
 * one line per paragraph, so nothing typed is lost.
 */
export function setBlockView(sheet: PersonaSheet, blockId: Id, view: BlockView): PersonaSheet {
  return mapBlock(sheet, blockId, (b) => {
    if (b.view === view) return b;
    if (view === 'text') {
      const fromItems = b.items.map((i) => i.text.trim()).filter(Boolean).join('\n');
      return { ...b, view, text: b.text.trim() ? b.text : fromItems, items: [] };
    }
    const lines = b.view === 'text' ? b.text.split('\n').map((l) => l.trim()).filter(Boolean) : null;
    const items = lines
      ? lines.map((text) => newItem(view, text))
      : b.items.map((i) => (view === 'gauges' ? { ...i, level: i.level ?? DEFAULT_LEVEL } : { id: i.id, text: i.text }));
    return { ...b, view, items: items.length ? items : [newItem(view)], text: lines ? '' : b.text };
  });
}

/** Adds a line after `afterId` (at the end by default). */
export function addItem(sheet: PersonaSheet, blockId: Id, afterId: Id | null = null, text = ''): { sheet: PersonaSheet; itemId: Id | null } {
  const block = sheet.blocks.find((b) => b.id === blockId);
  if (!block || block.view === 'text') return { sheet, itemId: null };
  const item = newItem(block.view, text);
  const at = afterId ? block.items.findIndex((i) => i.id === afterId) + 1 : block.items.length;
  const items = block.items.slice();
  items.splice(at > 0 ? at : items.length, 0, item);
  return { sheet: mapBlock(sheet, blockId, (b) => ({ ...b, items })), itemId: item.id };
}

export function setItem(sheet: PersonaSheet, blockId: Id, itemId: Id, patch: Partial<Omit<SheetItem, 'id'>>): PersonaSheet {
  const level = patch.level === undefined ? undefined : Math.max(0, Math.min(100, Math.round(patch.level)));
  return mapBlock(sheet, blockId, (b) => ({
    ...b,
    items: b.items.map((i) => (i.id === itemId ? { ...i, ...patch, ...(level === undefined ? {} : { level }) } : i)),
  }));
}

export function removeItem(sheet: PersonaSheet, blockId: Id, itemId: Id): PersonaSheet {
  return mapBlock(sheet, blockId, (b) => ({ ...b, items: b.items.filter((i) => i.id !== itemId) }));
}

export function setSheetStyle(sheet: PersonaSheet, key: string, patch: BoxStyle): PersonaSheet {
  return { ...sheet, styles: { ...sheet.styles, [key]: { ...sheet.styles[key], ...patch } } };
}

export function resetSheetStyle(sheet: PersonaSheet, key: string): PersonaSheet {
  const { [key]: _removed, ...styles } = sheet.styles;
  return { ...sheet, styles };
}
