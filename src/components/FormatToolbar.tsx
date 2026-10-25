// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { activeMap, useMap, useStore, useT } from '../store';
import * as ops from '../model/ops';
import type { BoxKind, FontId, LinkStyle } from '../model/types';
import { BORDER_SWATCHES, FILL_SWATCHES, FONTS, LINK_COLORS, SIZES, TAG_PALETTE, TEXT_SWATCHES, resolveStyle, tagColor } from '../model/theme';
import { useEffect, useRef } from 'react';
import { CloseIcon, CursorIcon, LinkIcon, TagIcon } from './Icons';
import { cls } from './cls';

export function FormatToolbar() {
  const t = useT();
  const storyboard = useMap((m) => m.storyboard);
  const infoRow = useMap((m) => m.infoRow);
  const apply = useStore((s) => s.apply);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const linkFrom = useStore((s) => s.linkFrom);
  const selIsLink = useStore((s) => !!s.sel?.startsWith('link:'));

  return (
    <div className="toolbar" role="toolbar" aria-label={t('tool.label')}>
      <div className="segmented">
        <button className={cls(tool === 'select' && 'is-on')} aria-pressed={tool === 'select'} onClick={() => setTool('select')}>
          <CursorIcon /> {t('tool.select')}
        </button>
        <button className={cls(tool === 'link' && 'is-on')} aria-pressed={tool === 'link'} onClick={() => setTool('link')}>
          <LinkIcon /> {t('tool.link')}
        </button>
      </div>
      <label className="toggle toggle-inline">
        <input
          type="checkbox"
          checked={storyboard}
          onChange={(e) => {
            const on = e.target.checked;
            apply((d) => ({ ...d, storyboard: on }));
          }}
        />
        <span>{t('tool.storyboard')}</span>
      </label>
      <label className="toggle toggle-inline">
        <input
          type="checkbox"
          checked={infoRow}
          onChange={(e) => {
            const on = e.target.checked;
            apply((d) => ({ ...d, infoRow: on }));
          }}
        />
        <span>{t('tool.infoRow')}</span>
      </label>
      <TagManager />
      <div className="divider" />
      {tool === 'link' && !selIsLink ? (
        <span className="hint">
          {t(linkFrom ? 'tool.linkHintTarget' : 'tool.linkHintStart')}
        </span>
      ) : selIsLink ? (
        <LinkControls />
      ) : (
        <StyleControls />
      )}
    </div>
  );
}

function LinkControls() {
  const t = useT();
  const id = useStore((s) => s.sel!.slice('link:'.length));
  const link = useMap((m) => m.links.find((l) => l.id === id));
  const apply = useStore((s) => s.apply);
  const select = useStore((s) => s.select);
  if (!link) return <span className="hint">{t('tool.noSelection')}</span>;
  const style = link.style ?? 'solid';
  const color = link.color ?? LINK_COLORS[0];
  const styles: LinkStyle[] = ['solid', 'dashed', 'dotted'];
  return (
    <div className="style-controls">
      <span className="badge">{t('kind.link')}</span>
      <label className="field">
        {t('link.label')}
        <input
          className="text-field"
          value={link.label ?? ''}
          placeholder={t('link.labelPlaceholder')}
          maxLength={40}
          onChange={(e) => {
            const v = e.target.value;
            apply((d) => ops.updateLink(d, id, { label: v }), { coalesce: `link-label:${id}` });
          }}
        />
      </label>
      <div className="swatches" role="group" aria-label={t('link.style')}>
        <span className="swatches-label">{t('link.style')}</span>
        <div className="segmented segmented-sm">
          {styles.map((st) => (
            <button key={st} className={cls(style === st && 'is-on')} aria-pressed={style === st} onClick={() => apply((d) => ops.updateLink(d, id, { style: st }))}>
              <svg width="22" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="21" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={st === 'dashed' ? '5 3' : st === 'dotted' ? '0.5 4' : undefined} />
              </svg>
              {t(`link.${st}`)}
            </button>
          ))}
        </div>
      </div>
      <Swatches
        label={t('link.color')}
        list={LINK_COLORS}
        value={color}
        variant="fill"
        onPick={(hex, live) => apply((d) => ops.updateLink(d, id, { color: hex }), live ? { coalesce: `link-color:${id}` } : undefined)}
      />
      <button
        className="text-btn"
        onClick={() => {
          apply((d) => ops.removeLink(d, id));
          select(null);
        }}
      >
        {t('link.delete')}
      </button>
    </div>
  );
}

/** Project tags: colour, highlight and delete them. */
function TagManager() {
  const t = useT();
  const doc = useMap((m) => m);
  const filter = useStore((s) => s.tagFilter);
  const toggle = useStore((s) => s.toggleTagFilter);
  const clear = useStore((s) => s.clearTagFilter);
  const apply = useStore((s) => s.apply);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  const tags = ops.tagCounts(doc);
  const active = tags.filter((x) => filter.includes(x.tag.toLowerCase()));
  return (
    <>
      <details className="popover" ref={ref}>
        <summary className={cls('btn btn-sm', active.length > 0 && 'is-on')}>
          <TagIcon /> {t('tags.button')}
          {tags.length > 0 && <span className="count-pill">{tags.length}</span>}
        </summary>
        <div className="popover-panel tag-panel">
          <h2>{t('tags.title')}</h2>
          {tags.length === 0 ? (
            <p className="muted-sm">{t('tags.empty')}</p>
          ) : (
            <>
              <p className="muted-sm">{t('tags.filterHint')}</p>
              <ul className="tag-list">
                {tags.map(({ tag, count }) => {
                  const c = tagColor(tag, doc.tagColors);
                  const on = filter.includes(tag.toLowerCase());
                  return (
                    <li key={tag}>
                      <label className="tag-check">
                        <input type="checkbox" checked={on} onChange={() => toggle(tag)} aria-label={t('tags.show', { tag })} />
                        <span className="tag" style={{ background: c.bg, color: c.fg }}>
                          {tag}
                        </span>
                        <span className="muted-sm">{count}</span>
                      </label>
                      <span className="tag-colors" role="group" aria-label={t('tags.color', { tag })}>
                        {TAG_PALETTE.map((p, i) => (
                          <button
                            key={i}
                            className={cls('swatch swatch-xs', p.bg === c.bg && 'is-on')}
                            style={{ background: p.bg, borderColor: p.fg }}
                            aria-label={`${t('tags.color', { tag })} ${i + 1}`}
                            onClick={() => apply((d) => ops.setTagColor(d, tag, i))}
                          />
                        ))}
                      </span>
                      <button
                        className="icon-btn"
                        aria-label={t('tags.delete', { tag })}
                        title={t('tags.delete', { tag })}
                        onClick={() => {
                          if (window.confirm(t('tags.confirmDelete', { tag, n: count }))) {
                            if (on) toggle(tag);
                            apply((d) => ops.deleteTagEverywhere(d, tag));
                          }
                        }}
                      >
                        <CloseIcon size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </details>
      {active.length > 0 && (
        <span className="filter-chip">
          {t('tags.filtering', { tags: active.map((x) => x.tag).join(', ') })}
          <button className="icon-btn" aria-label={t('tags.clear')} title={t('tags.clear')} onClick={clear}>
            <CloseIcon size={11} />
          </button>
        </span>
      )}
    </>
  );
}

function StyleControls() {
  const t = useT();
  const sel = useStore((s) => s.sel);
  const custom = useStore((s) => (s.sel ? activeMap(s).styles[s.sel] : undefined));
  const personaColor = useStore((s) => {
    if (!s.sel?.startsWith('persona:')) return undefined;
    const id = s.sel.slice('persona:'.length);
    return activeMap(s).personas.find((p) => p.id === id)?.color;
  });
  const apply = useStore((s) => s.apply);

  if (!sel) {
    return <span className="hint">{t('tool.noSelection')}</span>;
  }
  const kind = sel.split(':')[0] as BoxKind;
  const cur = resolveStyle(kind, custom, personaColor);
  // Dragging in the colour picker fires many changes: keep them as one undo step.
  const set = (patch: Parameters<typeof ops.setBoxStyle>[2], live = false) =>
    apply((d) => ops.setBoxStyle(d, sel, patch), live ? { coalesce: `style:${sel}` } : undefined);

  return (
    <div className="style-controls">
      <span className="badge">{t(`kind.${kind}`)}</span>
      <Swatches label={t('tool.fill')} list={FILL_SWATCHES} value={cur.bg} onPick={(bg, live) => set({ bg }, live)} variant="fill" />
      <Swatches label={t('tool.border')} list={BORDER_SWATCHES} value={cur.bc} onPick={(bc, live) => set({ bc }, live)} variant="border" />
      <Swatches label={t('tool.text')} list={TEXT_SWATCHES} value={cur.color} onPick={(color, live) => set({ color }, live)} variant="text" />
      <label className="field">
        {t('tool.font')}
        <select value={cur.font} onChange={(e) => set({ font: e.target.value as FontId })}>
          {(Object.keys(FONTS) as FontId[]).map((f) => (
            <option key={f} value={f}>
              {t(`font.${f}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        {t('tool.size')}
        <select value={cur.size} onChange={(e) => set({ size: Number(e.target.value) })}>
          {(SIZES.includes(cur.size) ? SIZES : [...SIZES, cur.size].sort((a, b) => a - b)).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button
        className={cls('square-btn', cur.weight >= 600 && 'is-on')}
        aria-pressed={cur.weight >= 600}
        aria-label={t('tool.bold')}
        onClick={() => set({ weight: cur.weight >= 600 ? 400 : 700 })}
      >
        B
      </button>
      {custom && (
        <button className="text-btn" onClick={() => apply((d) => ops.resetBoxStyle(d, sel))}>
          {t('tool.reset')}
        </button>
      )}
    </div>
  );
}

export function Swatches(props: { label: string; list: string[]; value: string; onPick: (hex: string, live?: boolean) => void; variant: 'fill' | 'border' | 'text' }) {
  const t = useT();
  const { label, list, value, onPick, variant } = props;
  const options = list.includes(value) ? list : [...list, value];
  return (
    <div className="swatches" role="group" aria-label={label}>
      <span className="swatches-label">{label}</span>
      {options.map((hex) => (
        <button
          key={hex}
          className={cls('swatch', `swatch-${variant}`, hex === value && 'is-on')}
          style={variant === 'fill' ? { background: hex } : variant === 'border' ? { borderColor: hex } : { color: hex }}
          aria-label={`${label} ${hex}`}
          aria-pressed={hex === value}
          title={hex}
          onClick={() => onPick(hex)}
        >
          {variant === 'text' ? 'A' : null}
        </button>
      ))}
      <label className="swatch swatch-custom" title={t('tool.customColor')}>
        <span aria-hidden="true">+</span>
        <input type="color" aria-label={`${label} : ${t('tool.customColor')}`} value={value.length === 7 ? value : '#000000'} onChange={(e) => onPick(e.target.value.toUpperCase(), true)} />
      </label>
    </div>
  );
}
