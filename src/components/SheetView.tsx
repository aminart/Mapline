// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { activeSheet, useStore, useT } from '../store';
import * as so from '../model/sheet';
import { setSheetIdentity, sheetIdentity } from '../model/project';
import { BLOCK_ACCENTS, PERSONA_PALETTE, personaAccent, tagColor } from '../model/theme';
import type { BlockView, PersonaSheet, SheetBlock, SheetItem } from '../model/types';
import { readImage } from '../lib/image';
import { boardRef } from './Board';
import { useBox } from './useBox';
import { useFitText } from './useFitText';
import { focusSoon, useFocusKey } from './useFocusKey';
import { startDrag, useDropTarget } from './dnd';
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
        <div className="sheet-blocks">
          {sheet.blocks.map((block, i) => (
            <BlockCard key={block.id} block={block} index={i} />
          ))}
          <AddBlock count={sheet.blocks.length} />
        </div>
      </div>
    </div>
  );
}

function Identity({ sheet }: { sheet: PersonaSheet }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const docId = useStore((s) => s.docId);
  const applyProject = useStore((s) => s.applyProject);
  const applySheet = useStore((s) => s.applySheet);
  const b = useBox<HTMLInputElement>('identity', 'identity');
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
      <input
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
            <input
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
            <input
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
        colorOf={(tag) => tagColor(tag, {})}
      />
    </section>
  );
}

function Avatar({ sheet, name, accent, onAccent }: { sheet: PersonaSheet; name: string; accent: string; onAccent: string }) {
  const t = useT();
  const applySheet = useStore((s) => s.applySheet);
  return (
    <div className="sheet-avatar" style={{ background: accent, color: onAccent }}>
      {sheet.photo ? <img src={sheet.photo} alt={name} /> : <span aria-hidden="true">{(name || '?').charAt(0).toUpperCase()}</span>}
      <label className="sheet-photo-btn no-export" title={t(sheet.photo ? 'sheet.photoChange' : 'sheet.photo')}>
        <CameraIcon size={14} />
        <input
          type="file"
          accept="image/*"
          aria-label={t(sheet.photo ? 'sheet.photoChange' : 'sheet.photo')}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            const photo = file ? await readImage(file).catch(() => null) : null;
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
function Chips(props: { tags: string[]; onAdd: (tag: string) => void; onRemove: (tag: string) => void; onFocus: () => void; colorOf: (tag: string) => { bg: string; fg: string } }) {
  const t = useT();
  const { tags, onAdd, onRemove, onFocus, colorOf } = props;
  const [draft, setDraft] = useState('');
  return (
    <div className="sheet-chips">
      {tags.map((tag) => {
        const c = colorOf(tag);
        return (
          <span key={tag} className="tag" style={{ background: c.bg, color: c.fg }}>
            {tag}
            <button className="tag-x no-export" aria-label={t('board.removeTag', { tag })} onClick={() => onRemove(tag)}>
              <CloseIcon size={9} />
            </button>
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

function BlockCard({ block, index }: { block: SheetBlock; index: number }) {
  const t = useT();
  const applySheet = useStore((s) => s.applySheet);
  const b = useBox<HTMLInputElement>(`block:${block.id}`, 'block');
  const ref = useRef<HTMLElement>(null);
  const drop = useDropTarget('block', (d) => applySheet((s) => so.moveBlock(s, d.index, index)));
  return (
    <section
      ref={ref}
      className={cls('box sheet-block', b.selected && 'is-selected', drop.over && 'is-drop-target')}
      style={{ ...b.box, borderTopColor: block.accent }}
      data-block={block.id}
      {...drop.props}
    >
      <header className="sheet-block-head">
        <span className="grip no-export" title={t('sheet.dragBlock')} aria-hidden="true" onPointerDown={(e) => startDrag(e, { kind: 'block', index }, ref.current)}>
          <GripIcon size={12} />
        </span>
        <input
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
  const ref = useRef<HTMLInputElement>(null);
  useFocusKey(`gauge:${item.id}`, ref);
  return (
    <div className={cls('sheet-gauge', !item.text.trim() && 'is-empty')}>
      <div className="sheet-gauge-head">
        <input
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
function AddBlock({ count }: { count: number }) {
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
    <div className="sheet-add-block no-export">
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
