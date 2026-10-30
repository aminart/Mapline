// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { activeSheet, useStore, useT } from '../store';
import * as so from '../model/sheet';
import { setSheetIdentity, sheetIdentity } from '../model/project';
import { BLOCK_ACCENTS, PERSONA_PALETTE, TAG_PALETTE, personaAccent, tagColor } from '../model/theme';
import type { BlockPlace, BlockView, PersonaSheet, SheetBlock, SheetItem } from '../model/types';
import { readImage } from '../lib/image';
import { withBusy } from '../actions';
import { boardRef } from './Board';
import { useBox } from './useBox';
import { useFitText } from './useFitText';
import { FitText } from './FitText';
import { focusSoon, useFocusKey } from './useFocusKey';
import { startDrag, useDropTarget, type DropPoint } from './dnd';
import { CameraIcon, CloseIcon, GripIcon, PlusIcon } from './Icons';
import { cls } from './cls';

const VIEWS: BlockView[] = ['list', 'gauges', 'tags', 'text'];

/** A persona sheet: the identity column and the blocks. */
export function SheetView() {
  const zoom = useStore((s) => s.zoom);
  const sheet = useStore((s) => activeSheet(s));
  if (!sheet) return null;
  return (
    <div className="board-zoom" style={{ zoom } as CSSProperties}>
      <div className="sheet" ref={boardRef}>
        <Identity sheet={sheet} />
        <Blocks sheet={sheet} />
      </div>
    </div>
  );
}

/** Height of an empty row of the blocks grid, in CSS pixels; matches styles.css. */
const ROW_MIN = 72;

/**
 * The grid cell under a point of the blocks grid, from the grid's own track
 * sizes. Below the last row, rows of the minimum height are counted on.
 */
function cellAt(grid: HTMLElement, at: DropPoint): { x: number; y: number } {
  const r = grid.getBoundingClientRect();
  // The board is zoomed: client pixels are CSS pixels times the scale.
  const scale = grid.offsetWidth ? r.width / grid.offsetWidth : 1;
  const style = getComputedStyle(grid);
  const gap = parseFloat(style.columnGap) || 0;
  const cols = style.gridTemplateColumns.split(' ').map(parseFloat);
  const rows = style.gridTemplateRows === 'none' ? [] : style.gridTemplateRows.split(' ').map(parseFloat);
  const px = (at.x - r.left) / scale;
  const py = (at.y - r.top) / scale;
  let x = 0;
  for (let edge = 0; x < cols.length - 1 && px > edge + cols[x] + gap / 2; x++) edge += cols[x] + gap;
  let y = 0;
  let edge = 0;
  for (; y < rows.length && py > edge + rows[y] + gap / 2; y++) edge += rows[y] + gap;
  if (y === rows.length && py > edge) y += Math.floor((py - edge) / (ROW_MIN + gap));
  return { x, y };
}

const gridArea = (p: BlockPlace) => ({ gridColumn: `${p.x + 1} / span ${p.w}`, gridRow: `${p.y + 1} / span ${p.h}` });

/**
 * The blocks, on a grid of six columns: each can be dragged to any cell, and
 * resized from its corner, across columns and rows.
 */
function Blocks({ sheet }: { sheet: PersonaSheet }) {
  const applySheet = useStore((s) => s.applySheet);
  const ref = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<BlockPlace | null>(null);
  const layout = so.sheetLayout(sheet.blocks);
  const rows = Math.max(0, ...layout.map((p) => p.y + p.h));
  // Where a dragged block would land: the cell under its top left corner.
  const landing = (d: { id: string; grabX: number; grabY: number }, at: DropPoint): BlockPlace | null => {
    const i = sheet.blocks.findIndex((b) => b.id === d.id);
    if (i < 0 || !ref.current) return null;
    const cell = cellAt(ref.current, { x: at.x - d.grabX + 8, y: at.y - d.grabY + 8 });
    const { w, h } = layout[i];
    return { x: Math.min(cell.x, so.SHEET_COLS - w), y: cell.y, w, h };
  };
  const drop = useDropTarget(
    'block',
    (d, at) => {
      setGhost(null);
      const place = landing(d, at);
      if (place) applySheet((s) => so.placeBlock(s, d.id, place));
    },
    (d, at) => {
      const place = landing(d, at);
      if (place && (place.x !== ghost?.x || place.y !== ghost?.y || place.w !== ghost?.w || place.h !== ghost?.h)) setGhost(place);
    },
  );
  const shown = drop.over ? ghost : null;
  return (
    <div ref={ref} className={cls('sheet-blocks', drop.over && 'is-dragging-over')} {...drop.props}>
      {sheet.blocks.map((block, i) => (
        <BlockCard key={block.id} sheet={sheet} block={block} place={layout[i]} grid={ref} />
      ))}
      {shown && <div className="sheet-drop-ghost no-export" style={gridArea(shown)} aria-hidden="true" />}
      <AddBlock count={sheet.blocks.length} row={rows} />
    </div>
  );
}

function Identity({ sheet }: { sheet: PersonaSheet }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const docId = useStore((s) => s.docId);
  const applyProject = useStore((s) => s.applyProject);
  const applySheet = useStore((s) => s.applySheet);
  const b = useBox<HTMLTextAreaElement>('identity', 'identity');
  const custom = sheet.styles.identity;
  const identity = sheetIdentity(project, sheet);
  const { accent, onAccent } = personaAccent(identity.color, identity.style);
  const tint = identity.style?.bg ?? PERSONA_PALETTE[identity.color % PERSONA_PALETTE.length].tint;
  const bg = custom?.bg ?? tint;
  const roleRef = useRef<HTMLTextAreaElement>(null);
  const quoteRef = useRef<HTMLTextAreaElement>(null);
  useFitText(roleRef, [identity.role]);
  useFitText(quoteRef, [sheet.quote]);
  const color = custom?.color;

  const rename = (patch: { name?: string; role?: string }, key: string) =>
    applyProject((p) => setSheetIdentity(p, docId, patch), { coalesce: `${key}:${docId}` });

  return (
    <section className={cls('box sheet-identity', b.selected && 'is-selected')} style={{ background: bg, borderColor: custom?.bc ?? bg, color }}>
      <Avatar sheet={sheet} name={identity.name} accent={accent} onAccent={onAccent} />
      <FitText
        singleLine
        ref={b.ref}
        className="sheet-name"
        aria-label={t('sheet.name')}
        placeholder={t('sheet.name')}
        value={identity.name}
        onFocus={b.onFocus}
        onChange={(e) => rename({ name: e.target.value }, 'sheet-name')}
      />
      <textarea
        ref={roleRef}
        rows={1}
        className="sheet-role"
        aria-label={t('board.personaRole')}
        placeholder={t('sheet.rolePlaceholder')}
        value={identity.role}
        onFocus={b.onFocus}
        onChange={(e) => rename({ role: e.target.value }, 'sheet-role')}
      />
      <div className="sheet-fields">
        {sheet.fields.map((f) => (
          <div key={f.id} className={cls('sheet-field', !f.label.trim() && !f.value.trim() && 'is-empty')}>
            <FitText
              singleLine
              className="sheet-field-label"
              aria-label={t('sheet.fieldLabel')}
              placeholder={t('sheet.fieldLabel')}
              value={f.label}
              onFocus={b.onFocus}
              onChange={(e) => {
                const v = e.target.value;
                applySheet((s) => so.setField(s, f.id, { label: v }), { coalesce: `field-label:${f.id}` });
              }}
            />
            <FitText
              singleLine
              className="sheet-field-value"
              aria-label={t('sheet.fieldValue', { name: f.label })}
              value={f.value}
              onFocus={b.onFocus}
              onChange={(e) => {
                const v = e.target.value;
                applySheet((s) => so.setField(s, f.id, { value: v }), { coalesce: `field-value:${f.id}` });
              }}
            />
            <button className="icon-btn sheet-x no-export" aria-label={t('sheet.removeField', { name: f.label })} onClick={() => applySheet((s) => so.removeField(s, f.id))}>
              <CloseIcon size={11} />
            </button>
          </div>
        ))}
        <button className="text-btn sheet-add no-export" onClick={() => applySheet((s) => so.addField(s).sheet)}>
          <PlusIcon size={11} /> {t('sheet.addField')}
        </button>
      </div>
      <textarea
        ref={quoteRef}
        rows={1}
        className="sheet-quote"
        aria-label={t('sheet.quote')}
        placeholder={t('sheet.quotePlaceholder')}
        value={sheet.quote}
        onFocus={b.onFocus}
        onChange={(e) => {
          const v = e.target.value;
          applySheet((s) => so.setIdentity(s, { quote: v }), { coalesce: `quote:${docId}` });
        }}
      />
      <Chips
        tags={sheet.tags}
        onAdd={(tag) => applySheet((s) => so.addSheetTag(s, tag))}
        onRemove={(tag) => applySheet((s) => so.removeSheetTag(s, tag))}
        onFocus={b.onFocus}
        colorOf={(tag) => tagColor(tag, sheet.tagColors)}
        onColor={(tag, color) => applySheet((s) => so.setSheetTagColor(s, tag, color))}
      />
    </section>
  );
}

function Avatar({ sheet, name, accent, onAccent }: { sheet: PersonaSheet; name: string; accent: string; onAccent: string }) {
  const t = useT();
  const applySheet = useStore((s) => s.applySheet);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className="sheet-avatar"
      style={{ background: accent, color: onAccent }}
      title={t(sheet.photo ? 'sheet.photoChange' : 'sheet.photo')}
      // The whole circle picks a photo, not just the camera button.
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as Element).closest('img, .sheet-avatar-initial')) input.current?.click();
      }}
    >
      {sheet.photo ? <img src={sheet.photo} alt={name} /> : <span className="sheet-avatar-initial" aria-hidden="true">{(name || '?').charAt(0).toUpperCase()}</span>}
      <label className="sheet-photo-btn no-export" title={t(sheet.photo ? 'sheet.photoChange' : 'sheet.photo')}>
        <CameraIcon size={14} />
        <input
          ref={input}
          type="file"
          accept="image/*"
          aria-label={t(sheet.photo ? 'sheet.photoChange' : 'sheet.photo')}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            const photo = file ? await withBusy(t('busy.image'), () => readImage(file).catch(() => null)) : null;
            if (photo) applySheet((s) => so.setIdentity(s, { photo }));
          }}
        />
      </label>
      {sheet.photo && (
        <button className="sheet-photo-remove no-export" aria-label={t('sheet.photoRemove')} title={t('sheet.photoRemove')} onClick={() => applySheet((s) => so.setIdentity(s, { photo: null }))}>
          <CloseIcon size={10} />
        </button>
      )}
    </div>
  );
}

/** Tag chips with an input to add one (Enter). */
function Chips(props: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  onFocus: () => void;
  colorOf: (tag: string) => { bg: string; fg: string };
  /** When given, clicking a tag offers the tag colours. */
  onColor?: (tag: string, color: number) => void;
}) {
  const t = useT();
  const { tags, onAdd, onRemove, onFocus, colorOf, onColor } = props;
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState<string | null>(null);
  useEffect(() => {
    if (!picking) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.tag-pickable')) setPicking(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [picking]);
  return (
    <div className="sheet-chips">
      {tags.map((tag) => {
        const c = colorOf(tag);
        return (
          <span key={tag} className={cls('tag', onColor && 'tag-pickable')} style={{ background: c.bg, color: c.fg }}>
            {onColor ? (
              <button className="tag-name" aria-label={t('tags.color', { tag })} title={t('tags.color', { tag })} aria-expanded={picking === tag} onClick={() => setPicking(picking === tag ? null : tag)}>
                {tag}
              </button>
            ) : (
              tag
            )}
            <button className="tag-x no-export" aria-label={t('board.removeTag', { tag })} onClick={() => onRemove(tag)}>
              <CloseIcon size={9} />
            </button>
            {onColor && picking === tag && (
              <span className="tag-palette no-export" role="group" aria-label={t('tags.color', { tag })}>
                {TAG_PALETTE.map((p, i) => (
                  <button
                    key={i}
                    className={cls('swatch swatch-xs', p.bg === c.bg && 'is-on')}
                    style={{ background: p.bg, borderColor: p.fg }}
                    aria-label={`${t('tags.color', { tag })} ${i + 1}`}
                    onClick={() => {
                      onColor(tag, i);
                      setPicking(null);
                    }}
                  />
                ))}
              </span>
            )}
          </span>
        );
      })}
      <input
        className="sheet-chip-input no-export"
        aria-label={t('board.addTagLabel')}
        placeholder={`+ ${t('sheet.addTag')}`}
        value={draft}
        maxLength={so.MAX_SHEET_TAG}
        size={Math.max(6, draft.length + 1)}
        onFocus={onFocus}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            e.preventDefault();
            onAdd(draft);
            setDraft('');
          } else if (e.key === 'Backspace' && draft === '' && tags.length) {
            onRemove(tags[tags.length - 1]);
          }
        }}
        onBlur={() => {
          if (draft.trim()) onAdd(draft);
          setDraft('');
        }}
      />
    </div>
  );
}

/**
 * Resizes a block from its corner: the cell under the pointer becomes its
 * bottom right one. Each step is placed from the sheet as it was when the
 * drag began, so blocks pushed down come back when the block shrinks again.
 */
function startResize(e: ReactPointerEvent, sheet: PersonaSheet, blockId: string, place: BlockPlace, grid: HTMLElement | null) {
  if (e.button !== 0 || !grid) return;
  e.preventDefault();
  e.stopPropagation();
  const { applySheet } = useStore.getState();
  const coalesce = `resize:${blockId}:${Date.now()}`;
  let last = place;
  const onMove = (ev: PointerEvent) => {
    const cell = cellAt(grid, { x: ev.clientX, y: ev.clientY });
    const next = { ...place, w: Math.max(1, cell.x - place.x + 1), h: Math.max(1, cell.y - place.y + 1) };
    if (next.w === last.w && next.h === last.h) return;
    last = next;
    applySheet(() => so.placeBlock(sheet, blockId, next), { coalesce });
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.classList.remove('is-resizing');
  };
  document.body.classList.add('is-resizing');
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function BlockCard({ sheet, block, place, grid }: { sheet: PersonaSheet; block: SheetBlock; place: BlockPlace; grid: RefObject<HTMLDivElement | null> }) {
  const t = useT();
  const applySheet = useStore((s) => s.applySheet);
  const b = useBox<HTMLTextAreaElement>(`block:${block.id}`, 'block');
  const ref = useRef<HTMLElement>(null);
  return (
    <section
      ref={ref}
      className={cls('box sheet-block', b.selected && 'is-selected')}
      style={{ ...b.box, borderTopColor: block.accent, ...gridArea(place) }}
      data-block={block.id}
    >
      <header className="sheet-block-head">
        <span
          className="grip no-export"
          title={t('sheet.dragBlock')}
          aria-hidden="true"
          onPointerDown={(e) => {
            const r = ref.current?.getBoundingClientRect();
            startDrag(e, { kind: 'block', id: block.id, grabX: r ? e.clientX - r.left : 0, grabY: r ? e.clientY - r.top : 0 }, ref.current);
          }}
        >
          <GripIcon size={12} />
        </span>
        <FitText
          singleLine
          ref={b.ref}
          className="sheet-block-title"
          aria-label={t('sheet.blockTitle')}
          placeholder={t('sheet.blockTitle')}
          value={block.title}
          style={{ color: block.accent }}
          onFocus={b.onFocus}
          onChange={(e) => {
            const v = e.target.value;
            applySheet((s) => so.setBlock(s, block.id, { title: v }), { coalesce: `block-title:${block.id}` });
          }}
        />
        <button className="icon-btn sheet-x no-export" aria-label={t('sheet.removeBlock')} title={t('sheet.removeBlock')} onClick={() => applySheet((s) => so.removeBlock(s, block.id))}>
          <CloseIcon size={12} />
        </button>
      </header>
      <div className="sheet-block-body" style={b.text}>
        {block.view === 'list' && <Lines block={block} onFocus={b.onFocus} />}
        {block.view === 'gauges' && <Gauges block={block} onFocus={b.onFocus} />}
        {block.view === 'tags' && (
          <Chips
            tags={block.items.map((i) => i.text).filter(Boolean)}
            onAdd={(tag) => applySheet((s) => (block.items.some((i) => i.text.toLowerCase() === tag.trim().toLowerCase()) ? s : so.addItem(s, block.id, null, tag.trim()).sheet))}
            onRemove={(tag) => {
              const item = block.items.find((i) => i.text === tag);
              if (item) applySheet((s) => so.removeItem(s, block.id, item.id));
            }}
            onFocus={b.onFocus}
            colorOf={() => ({ bg: `${block.accent}1A`, fg: block.accent })}
          />
        )}
        {block.view === 'text' && <TextBody block={block} onFocus={b.onFocus} />}
      </div>
      <span
        className="sheet-resize no-export"
        title={t('sheet.resizeBlock')}
        aria-hidden="true"
        onPointerDown={(e) => startResize(e, sheet, block.id, place, grid.current)}
      />
    </section>
  );
}

function Lines({ block, onFocus }: { block: SheetBlock; onFocus: () => void }) {
  const t = useT();
  const applySheet = useStore((s) => s.applySheet);
  const add = (after: string | null) => {
    let id: string | null = null;
    applySheet((s) => {
      const r = so.addItem(s, block.id, after);
      id = r.itemId;
      return r.sheet;
    });
    if (id) focusSoon(`item:${id}`);
  };
  return (
    <>
      <ul className="sheet-lines">
        {block.items.map((item, i) => (
          <Line key={item.id} block={block} item={item} prevId={block.items[i - 1]?.id ?? null} onFocus={onFocus} onEnter={() => add(item.id)} />
        ))}
      </ul>
      <button className="text-btn sheet-add no-export" onClick={() => add(null)}>
        <PlusIcon size={11} /> {t('sheet.addItem')}
      </button>
    </>
  );
}

function Line(props: { block: SheetBlock; item: SheetItem; prevId: string | null; onFocus: () => void; onEnter: () => void }) {
  const t = useT();
  const { block, item, prevId, onFocus, onEnter } = props;
  const applySheet = useStore((s) => s.applySheet);
  const ref = useRef<HTMLTextAreaElement>(null);
  useFitText(ref, [item.text]);
  useFocusKey(`item:${item.id}`, ref);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onEnter();
    } else if (e.key === 'Backspace' && item.text === '' && block.items.length > 1) {
      e.preventDefault();
      applySheet((s) => so.removeItem(s, block.id, item.id));
      if (prevId) focusSoon(`item:${prevId}`);
    }
  };
  return (
    <li className={cls('sheet-line', !item.text.trim() && 'is-empty')}>
      <span className="sheet-bullet" style={{ background: block.accent }} aria-hidden="true" />
      <textarea
        ref={ref}
        rows={1}
        aria-label={t('sheet.item', { name: block.title })}
        placeholder={t('sheet.itemPlaceholder')}
        value={item.text}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          const v = e.target.value;
          applySheet((s) => so.setItem(s, block.id, item.id, { text: v }), { coalesce: `item:${item.id}` });
        }}
      />
    </li>
  );
}

function Gauges({ block, onFocus }: { block: SheetBlock; onFocus: () => void }) {
  const t = useT();
  const applySheet = useStore((s) => s.applySheet);
  return (
    <>
      <div className="sheet-gauges">
        {block.items.map((item) => (
          <GaugeRow key={item.id} block={block} item={item} onFocus={onFocus} />
        ))}
      </div>
      <button
        className="text-btn sheet-add no-export"
        onClick={() => {
          let id: string | null = null;
          applySheet((s) => {
            const r = so.addItem(s, block.id);
            id = r.itemId;
            return r.sheet;
          });
          if (id) focusSoon(`gauge:${id}`);
        }}
      >
        <PlusIcon size={11} /> {t('sheet.addItem')}
      </button>
    </>
  );
}

function GaugeRow({ block, item, onFocus }: { block: SheetBlock; item: SheetItem; onFocus: () => void }) {
  const t = useT();
  const applySheet = useStore((s) => s.applySheet);
  const ref = useRef<HTMLTextAreaElement>(null);
  useFocusKey(`gauge:${item.id}`, ref);
  return (
    <div className={cls('sheet-gauge', !item.text.trim() && 'is-empty')}>
      <div className="sheet-gauge-head">
        <FitText
          singleLine
          ref={ref}
          aria-label={t('sheet.item', { name: block.title })}
          placeholder={t('sheet.gaugePlaceholder')}
          value={item.text}
          onFocus={onFocus}
          onChange={(e) => {
            const v = e.target.value;
            applySheet((s) => so.setItem(s, block.id, item.id, { text: v }), { coalesce: `item:${item.id}` });
          }}
        />
        <button className="icon-btn sheet-x no-export" aria-label={t('sheet.removeItem')} onClick={() => applySheet((s) => so.removeItem(s, block.id, item.id))}>
          <CloseIcon size={11} />
        </button>
      </div>
      {/* The bar is what shows and exports; the slider on top of it only edits. */}
      <div className="sheet-gauge-bar" style={{ '--gauge': block.accent } as CSSProperties}>
        <div className="sheet-gauge-track" aria-hidden="true">
          <div className="sheet-gauge-fill" style={{ width: `${item.level ?? so.DEFAULT_LEVEL}%`, background: block.accent }} />
        </div>
        <input
          type="range"
          className="sheet-gauge-range no-export"
          min={0}
          max={100}
          step={5}
          aria-label={t('sheet.gaugeLevel', { name: item.text || block.title })}
          value={item.level ?? so.DEFAULT_LEVEL}
          onFocus={onFocus}
          onChange={(e) => {
            const v = Number(e.target.value);
            applySheet((s) => so.setItem(s, block.id, item.id, { level: v }), { coalesce: `level:${item.id}` });
          }}
        />
      </div>
    </div>
  );
}

function TextBody({ block, onFocus }: { block: SheetBlock; onFocus: () => void }) {
  const t = useT();
  const applySheet = useStore((s) => s.applySheet);
  const ref = useRef<HTMLTextAreaElement>(null);
  useFitText(ref, [block.text]);
  return (
    <textarea
      ref={ref}
      rows={2}
      className="sheet-text"
      aria-label={block.title || t('sheet.view.text')}
      placeholder={t('sheet.textPlaceholder')}
      value={block.text}
      onFocus={onFocus}
      onChange={(e) => {
        const v = e.target.value;
        applySheet((s) => so.setBlock(s, block.id, { text: v }), { coalesce: `text:${block.id}` });
      }}
    />
  );
}

/** "Add a block", then the kind of block. */
function AddBlock({ count, row }: { count: number; row: number }) {
  const t = useT();
  const applySheet = useStore((s) => s.applySheet);
  const focusLater = useStore((s) => s.focusLater);
  const [open, setOpen] = useState(false);
  const add = (view: BlockView) => {
    const block = so.newBlock(t('sheet.newBlock'), view, BLOCK_ACCENTS[count % BLOCK_ACCENTS.length], view === 'tags' ? [] : ['']);
    applySheet((s) => so.addBlock(s, block));
    setOpen(false);
    focusLater(`block:${block.id}`);
  };
  return (
    <div className="sheet-add-block no-export" style={{ gridRow: row + 1 }}>
      {open ? (
        <div className="sheet-add-choices" role="group" aria-label={t('sheet.addBlock')}>
          {VIEWS.map((v) => (
            <button key={v} className="btn btn-sm" onClick={() => add(v)}>
              {t(`sheet.view.${v}`)}
            </button>
          ))}
          <button className="icon-btn" aria-label={t('new.cancel')} onClick={() => setOpen(false)}>
            <CloseIcon size={12} />
          </button>
        </div>
      ) : (
        <button className="add-dashed" onClick={() => setOpen(true)}>
          <PlusIcon /> {t('sheet.addBlock')}
        </button>
      )}
    </div>
  );
}
