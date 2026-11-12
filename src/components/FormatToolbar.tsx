// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { activeMap, selectedKeys, useMap, useStore, useT } from '../store';
import * as ops from '../model/ops';
import type { BoxKind } from '../model/types';
import { BORDER_SWATCHES, FILL_SWATCHES, TAG_PALETTE, TEXT_SWATCHES, resolveStyle, tagColor } from '../model/theme';
import { useEffect, useRef } from 'react';
import { CloseIcon, TagIcon } from './Icons';
import { cls } from './cls';
import { TargetButton } from './StateBar';
import { ArrowControls, ColorMenu, KindMenu, ResetButton, StoryboardToggle, TextStyleControls, ToolModes } from './ToolControls';

export function FormatToolbar() {
  const t = useT();
  const storyboard = useMap((m) => m.storyboard);
  const apply = useStore((s) => s.apply);
  const tool = useStore((s) => s.tool);
  const linkFrom = useStore((s) => s.linkFrom);
  const selIsLink = useStore((s) => !!s.sel?.startsWith('link:'));

  return (
    <div className="toolbar toolbar-compact" role="toolbar" aria-label={t('tool.label')}>
      <ToolModes />
      <StoryboardToggle on={storyboard} set={(on) => apply((d) => ({ ...d, storyboard: on }))} />
      <MapTagManager />
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
      <TargetButton />
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
  return (
    <ArrowControls
      link={link}
      setLabel={(v) => apply((d) => ops.updateLink(d, id, { label: v }), { coalesce: `link-label:${id}` })}
      update={(patch, live) => apply((d) => ops.updateLink(d, id, patch), live ? { coalesce: `link-style:${id}` } : undefined)}
      remove={() => {
        apply((d) => ops.removeLink(d, id));
        select(null);
      }}
    />
  );
}

function MapTagManager() {
  // As one string, so typing a card's text doesn't redraw the toolbar.
  const counts = useMap((m) => JSON.stringify(ops.tagCounts(m)));
  const tagColors = useMap((m) => m.tagColors);
  const apply = useStore((s) => s.apply);
  return (
    <TagManager
      tags={JSON.parse(counts) as { tag: string; count: number }[]}
      colors={tagColors}
      setColor={(tag, i) => apply((d) => ops.setTagColor(d, tag, i))}
      deleteTag={(tag) => apply((d) => ops.deleteTagEverywhere(d, tag))}
    />
  );
}

/** A document's tags (a map's, a flow's): colour, highlight and delete them. */
export function TagManager(props: {
  tags: { tag: string; count: number }[];
  colors: Record<string, number> | undefined;
  setColor: (tag: string, color: number) => void;
  deleteTag: (tag: string) => void;
}) {
  const t = useT();
  const { tags, colors, setColor, deleteTag } = props;
  const filter = useStore((s) => s.tagFilter);
  const toggle = useStore((s) => s.toggleTagFilter);
  const clear = useStore((s) => s.clearTagFilter);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  const active = tags.filter((x) => filter.includes(x.tag.toLowerCase()));
  return (
    <>
      <details className="popover" ref={ref}>
        <summary className={cls('btn btn-sm tags-summary', active.length > 0 && 'is-on')} title={t('tags.button')}>
          <TagIcon /> <span className="tags-summary-label">{t('tags.button')}</span>
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
                  const c = tagColor(tag, colors);
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
                            onClick={() => setColor(tag, i)}
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
                            deleteTag(tag);
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
  const cardKey = useStore((s) => (s.sel?.startsWith('act:') ? ops.activityKeyOf(activeMap(s), s.sel.slice('act:'.length)) : undefined));
  // Several boxes picked together are styled together, like the last one picked.
  const picked = useStore((s) => selectedKeys(s).length);
  const keys = () => selectedKeys(useStore.getState());
  const cardKind = useMap((m) => (cardKey ? (m.activities[cardKey]?.kind ?? 'activity') : undefined));

  if (!sel) {
    return <span className="hint">{t('tool.noSelection')}</span>;
  }
  const kind = sel.split(':')[0] as BoxKind;
  const cur = resolveStyle(kind, custom, personaColor);
  // Dragging in the colour picker fires many changes: keep them as one undo step.
  const set = (patch: Parameters<typeof ops.setBoxStyle>[2], live = false) =>
    apply((d) => keys().reduce((m, k) => ops.setBoxStyle(m, k, patch), d), live ? { coalesce: `style:${keys().join(',')}` } : undefined);
  const setKind = (k: 'activity' | 'choice') =>
    apply((d) =>
      keys().reduce((m, key) => {
        const at = ops.activityKeyOf(m, key.slice('act:'.length));
        return at ? ops.setActivityKind(m, at, k) : m;
      }, d),
    );

  return (
    <div className="tool-group">
      <span className="tool-kind">{picked > 1 ? t('tool.picked', { n: picked }) : t(cardKind === 'choice' ? 'flow.kind.choice' : `kind.${kind}`)}</span>
      {cardKey && cardKind && (
        <KindMenu
          value={cardKind}
          options={(['activity', 'choice'] as const).map((k) => ({ key: k, label: t(`flow.kind.${k}`) }))}
          onPick={setKind}
        />
      )}
      <div className="divider" />
      <ColorMenu label={t('tool.fill')} list={FILL_SWATCHES} value={cur.bg} onPick={(bg, live) => set({ bg }, live)} variant="fill" />
      <ColorMenu label={t('tool.border')} list={BORDER_SWATCHES} value={cur.bc} onPick={(bc, live) => set({ bc }, live)} variant="border" />
      <ColorMenu label={t('tool.text')} list={TEXT_SWATCHES} value={cur.color} onPick={(color, live) => set({ color }, live)} variant="text" />
      <div className="divider" />
      <TextStyleControls cur={cur} set={(patch) => set(patch)} />
      {custom && <ResetButton onClick={() => apply((d) => keys().reduce((m, k) => ops.resetBoxStyle(m, k), d))} />}
    </div>
  );
}
