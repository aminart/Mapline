// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useLayoutEffect, useRef, useState } from 'react';
import { useMap, useStore, useT } from '../store';
import * as ops from '../model/ops';
import type { Divider, Id, Persona } from '../model/types';
import { CHOICE_STYLE, LINK_COLORS, LINK_DASH, personaAccent } from '../model/theme';
import { useBox } from './useBox';
import { CloseIcon, DiamondIcon, GripIcon, LineAboveIcon, LineIcon, PersonIcon, PlusIcon, SplitIcon } from './Icons';
import { NoteButton, TagRow, TagSuggestions as TagList } from './CardExtras';
import { sheetFor } from '../model/project';
import { cls } from './cls';
import { GAP, ROW_GAP } from './layout';
import { midpoint, roundedPath, routeArrow, type Rect } from '../lib/arrows';
import { startDrag, useDropTarget } from './dnd';
import { useFitText } from './useFitText';

export function PersonaGrid() {
  const personas = useMap((m) => m.personas);
  const dividers = useMap((m) => m.dividers);
  // A state ref, so the arrows layer re-measures once the container exists.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const top = dividers.find((d) => d.after === ops.DIVIDER_TOP);
  return (
    <div className="persona-grid" ref={setContainer}>
      {top && personas.length > 0 && <DividerRow key={top.id} divider={top} />}
      {personas.map((p, i) => {
        const divider = dividers.find((d) => d.after === p.id);
        return [
          <PersonaRow key={p.id} persona={p} index={i} hasDivider={!!divider} canAddAbove={i === 0 && !top} />,
          divider && <DividerRow key={divider.id} divider={divider} />,
        ];
      })}
      <LinksLayer container={container} />
    </div>
  );
}

function PersonaRow(props: { persona: Persona; index: number; hasDivider: boolean; canAddAbove: boolean }) {
  const { persona, index, hasDivider, canAddAbove } = props;
  const t = useT();
  const steps = useMap((m) => m.steps);
  const apply = useStore((s) => s.apply);
  const b = useBox<HTMLInputElement>(`persona:${persona.id}`, 'persona', persona.color);
  const custom = useMap((m) => m.styles[`persona:${persona.id}`]);
  const { accent, onAccent } = personaAccent(persona.color, custom);
  const boxRef = useRef<HTMLDivElement>(null);
  const drop = useDropTarget('persona', (d) => apply((doc) => ops.movePersona(doc, d.index, index)));
  const docId = useStore((s) => s.docId);
  const sheet = useStore((s) => sheetFor(s.project, s.docId, persona.id));
  const setSheetPreview = useStore((s) => s.setSheetPreview);
  const setNewSheet = useStore((s) => s.setNewSheet);
  const name = persona.name || t('doc.unnamed');
  return (
    <div className="grid-row persona-row">
      <div
        ref={boxRef}
        className={cls('box persona', b.selected && 'is-selected', drop.over && 'is-drop-target')}
        style={b.box}
        {...drop.props}
      >
        <span
          className="grip grip-persona no-export"
          title={t('board.dragPersona')}
          aria-hidden="true"
          onPointerDown={(e) => startDrag(e, { kind: 'persona', index }, boxRef.current)}
        >
          <GripIcon />
        </span>
        {/* The photo of the persona's sheet, when it has one. */}
        <div className="avatar" aria-hidden="true" style={{ background: accent, color: onAccent }}>
          {sheet?.sheet.photo ? <img src={sheet.sheet.photo} alt="" /> : (persona.name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="persona-fields">
          <input
            ref={b.ref}
            aria-label={t('board.personaName')}
            value={persona.name}
            placeholder={t('board.personaName')}
            onFocus={b.onFocus}
            onChange={(e) => {
              const v = e.target.value;
              apply((d) => ops.setPersona(d, persona.id, { name: v }), { coalesce: `persona-name:${persona.id}` });
            }}
            style={b.text}
          />
          <textarea
            rows={3}
            aria-label={t('board.personaRole')}
            value={persona.role}
            placeholder={t('board.personaRolePlaceholder')}
            onFocus={b.onFocus}
            onChange={(e) => {
              const v = e.target.value;
              apply((d) => ops.setPersona(d, persona.id, { role: v }), { coalesce: `persona-role:${persona.id}` });
            }}
            style={{ ...b.text, fontSize: 13, fontWeight: 400, opacity: 0.8 }}
          />
        </div>
        <div className="persona-actions no-export">
          <button className="icon-btn" aria-label={t('board.removePersona')} onClick={() => apply((d) => ops.removePersona(d, persona.id))}>
            <CloseIcon />
          </button>
          <button
            className={cls('icon-btn persona-sheet-btn', sheet && 'has-sheet')}
            style={sheet ? { color: accent } : undefined}
            title={sheet ? t('board.openSheetLabel', { name }) : t('board.createSheet')}
            aria-label={sheet ? t('board.openSheetLabel', { name }) : t('board.createSheet')}
            onClick={() => (sheet ? setSheetPreview(sheet.id) : setNewSheet({ personaId: persona.id, mapDocId: docId }))}
          >
            <PersonIcon />
          </button>
          {canAddAbove && (
            <button
              className="icon-btn persona-divider-btn"
              title={t('board.addDividerAbove')}
              aria-label={t('board.addDividerAbove')}
              onClick={() => apply((d) => ops.addDivider(d, ops.DIVIDER_TOP, t('board.dividerDefault')))}
            >
              <LineAboveIcon />
            </button>
          )}
          {!hasDivider && (
            <button
              className="icon-btn persona-divider-btn"
              title={t('board.addDivider')}
              aria-label={t('board.addDivider')}
              onClick={() => apply((d) => ops.addDivider(d, persona.id, t('board.dividerDefault')))}
            >
              <LineIcon />
            </button>
          )}
        </div>
      </div>
      {steps.flatMap((s) =>
        s.slots.map((slot) => (
          <ActivityCell key={slot} personaId={persona.id} personaColor={persona.color} stepId={s.id} slotId={slot} />
        )),
      )}
      <div />
    </div>
  );
}

function DividerRow({ divider }: { divider: Divider }) {
  const t = useT();
  const apply = useStore((s) => s.apply);
  return (
    <div className="divider-row">
      <input
        className="divider-label"
        aria-label={t('board.dividerLabel')}
        value={divider.label}
        placeholder={t('board.dividerDefault')}
        onChange={(e) => {
          const v = e.target.value;
          apply((d) => ops.setDividerLabel(d, divider.id, v), { coalesce: `divider:${divider.id}` });
        }}
      />
      <div className="divider-line" aria-hidden="true" />
      <button className="icon-btn no-export" aria-label={t('board.removeDivider')} onClick={() => apply((d) => ops.removeDivider(d, divider.id))}>
        <CloseIcon size={12} />
      </button>
    </div>
  );
}

function ActivityCell(props: { personaId: Id; personaColor: number; stepId: Id; slotId: Id }) {
  const t = useT();
  const { personaId, slotId, stepId } = props;
  const key = ops.activityKey(personaId, slotId);
  const act = useMap((m) => m.activities[key]);
  const alt = useMap((m) => m.activities[ops.altKey(key)]);
  const apply = useStore((s) => s.apply);
  const focusLater = useStore((s) => s.focusLater);
  const drop = useDropTarget('act', (d) => apply((doc) => ops.moveActivity(doc, d.key, key)));
  const create = (kind: 'activity' | 'choice') => {
    let id = '';
    apply((d) => {
      const r = ops.createActivity(d, personaId, slotId, kind);
      id = r.activityId;
      return r.doc;
    });
    focusLater(`act:${id}`);
  };

  return (
    <div className={cls('cell', drop.over && 'is-drop-target', alt && 'has-alt')} data-step={stepId} {...drop.props}>
      {act ? (
        <>
          <ActivityCard {...props} activityKey={key} activityId={act.id} choice={act.kind === 'choice'} text={act.text} tags={act.tags ?? []} note={act.note ?? ''} canAddAlt={!alt} />
          {alt && (
            <>
              <JoinerInput activityKey={ops.altKey(key)} joiner={alt.joiner} />
              <ActivityCard {...props} activityKey={ops.altKey(key)} activityId={alt.id} choice={alt.kind === 'choice'} text={alt.text} tags={alt.tags ?? []} note={alt.note ?? ''} canAddAlt={false} />
            </>
          )}
        </>
      ) : (
        <>
          <button className="ghost no-export" aria-label={t('board.addActivityHere')} onClick={() => create('activity')}>
            <PlusIcon size={18} />
          </button>
          <button className="ghost-choice no-export" aria-label={t('board.addChoiceHere')} title={t('board.addChoiceHere')} onClick={() => create('choice')}>
            <DiamondIcon size={12} />
          </button>
        </>
      )}
    </div>
  );
}

function ActivityCard(props: {
  personaId: Id;
  personaColor: number;
  stepId: Id;
  slotId: Id;
  activityKey: string;
  activityId: Id;
  /** A decision point rather than an activity. */
  choice: boolean;
  text: string;
  tags: string[];
  note: string;
  /** Show the button that adds an alternative below. */
  canAddAlt: boolean;
}) {
  const t = useT();
  const { personaId, personaColor, stepId, slotId, activityKey, activityId, choice, text, tags, note, canAddAlt } = props;
  const apply = useStore((s) => s.apply);
  const focusLater = useStore((s) => s.focusLater);
  const tool = useStore((s) => s.tool);
  const linkFrom = useStore((s) => s.linkFrom);
  const setLinkFrom = useStore((s) => s.setLinkFrom);
  const tagFilter = useStore((s) => s.tagFilter);
  const tagColors = useMap((m) => m.tagColors);
  const b = useBox<HTMLTextAreaElement>(`act:${activityId}`, 'act');
  const personaStyle = useMap((m) => m.styles[`persona:${personaId}`]);
  // Cards follow their persona's colour unless given a border of their own.
  const { accent } = personaAccent(personaColor, personaStyle);
  const cardRef = useRef<HTMLDivElement>(null);
  const dimmed = tagFilter.length > 0 && !tags.some((tag) => tagFilter.includes(tag.toLowerCase()));

  const addRight = () => {
    let id: string | null = null;
    apply((d) => {
      const r = ops.addSlot(d, stepId, slotId, personaId);
      id = r.activityId;
      return r.doc;
    });
    if (id) focusLater(`act:${id}`);
  };

  const addAlt = () => {
    let id: string | null = null;
    apply((d) => {
      const r = ops.addAlternative(d, activityKey);
      id = r.activityId;
      return r.doc;
    });
    if (id) focusLater(`act:${id}`);
  };

  const pick = () => {
    if (!linkFrom) setLinkFrom(activityId);
    else if (linkFrom === activityId) setLinkFrom(null);
    else {
      apply((d) => ops.toggleLink(d, linkFrom, activityId));
      setLinkFrom(null);
    }
  };

  // The card grows with its text.
  useFitText(b.ref, [text, b.text.fontFamily, b.text.fontSize, b.text.fontWeight]);

  const isSource = linkFrom === activityId;
  return (
    <div
      ref={cardRef}
      className={cls('box card', choice && 'card-choice', b.selected && 'is-selected', dimmed && 'is-dimmed')}
      data-act={activityId}
      style={{
        ...b.box,
        // Choices are amber unless given a fill or border of their own.
        ...(choice && !b.hasCustomFill ? { background: CHOICE_STYLE.bg } : {}),
        ...(choice && !b.hasCustomBorder ? { borderColor: CHOICE_STYLE.bc } : {}),
        borderTopColor: b.hasCustomBorder ? b.style.bc : accent,
      }}
    >
      {choice && (
        <span className="choice-tag" aria-hidden="true">
          <DiamondIcon size={10} /> {t('flow.kind.choice')}
        </span>
      )}
      <textarea
        ref={b.ref}
        rows={1}
        aria-label={t('board.activity')}
        value={text}
        placeholder={t(choice ? 'flow.choicePlaceholder' : 'board.activityPlaceholder')}
        onFocus={b.onFocus}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            addRight();
          }
        }}
        onChange={(e) => {
          const v = e.target.value;
          apply((d) => ops.setActivityText(d, activityKey, v), { coalesce: `act:${activityId}` });
        }}
        style={b.text}
      />
      <TagRow
        tags={tags}
        colors={tagColors}
        listId={TAG_LIST_ID}
        onAdd={(tag) => apply((d) => ops.addTag(d, activityKey, tag))}
        onRemove={(tag) => apply((d) => ops.removeTag(d, activityKey, tag))}
      />
      <span
        className="grip grip-card card-btn no-export"
        title={t('board.dragActivity')}
        aria-hidden="true"
        onPointerDown={(e) => startDrag(e, { kind: 'act', key: activityKey }, cardRef.current)}
      >
        <GripIcon size={12} />
      </span>
      <NoteButton note={note} onChange={(v, live) => apply((d) => ops.setActivityNote(d, activityKey, v), live ? { coalesce: `note:${activityKey}` } : undefined)} />
      <button className="card-btn card-del no-export" aria-label={t('board.removeActivity')} onClick={() => apply((d) => ops.removeActivity(d, activityKey))}>
        <CloseIcon size={12} />
      </button>
      <button className="card-btn card-add no-export" title={t('board.addRight')} aria-label={t('board.addRight')} onClick={addRight}>
        <PlusIcon size={13} />
      </button>
      {canAddAlt && (
        <button className="card-btn card-alt no-export" title={t('board.addAlt')} aria-label={t('board.addAlt')} onClick={addAlt}>
          <SplitIcon size={12} />
        </button>
      )}
      {tool === 'link' && (
        <button
          className={cls('link-target no-export', isSource && 'is-source')}
          aria-label={t(isSource ? 'board.linkCancel' : linkFrom ? 'board.linkTo' : 'board.linkFrom')}
          onClick={pick}
        />
      )}
    </div>
  );
}

/** The word between two alternative cards, "or" by default, editable. */
function JoinerInput({ activityKey, joiner }: { activityKey: string; joiner: string | undefined }) {
  const t = useT();
  const apply = useStore((s) => s.apply);
  const value = joiner ?? t('board.or');
  return (
    <input
      className="alt-or"
      aria-label={t('board.orLabel')}
      title={t('board.orLabel')}
      value={value}
      maxLength={30}
      size={Math.max(2, value.length + 1)}
      onChange={(e) => {
        const v = e.target.value;
        apply((d) => ops.setJoiner(d, activityKey, v), { coalesce: `joiner:${activityKey}` });
      }}
    />
  );
}

/** Suggestions for the tag inputs: every tag already used in the map. */
export function TagSuggestions() {
  const doc = useMap((m) => m);
  return <TagList id={TAG_LIST_ID} tags={ops.allTags(doc)} />;
}

const TAG_LIST_ID = 'mm-tag-list';

/** Position of `el` inside `container`, in unzoomed layout pixels. */
function rectWithin(el: HTMLElement, container: HTMLElement): Rect {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== container) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

interface Drawn {
  id: Id;
  d: string;
  mid: { x: number; y: number };
  label: string;
  color: string;
  dash: number[];
  /** Steps of both ends, so presentation mode can show only a step's arrows. */
  steps: string;
}

function LinksLayer({ container }: { container: HTMLDivElement | null }) {
  const t = useT();
  const doc = useMap((m) => m);
  const sel = useStore((s) => s.sel);
  const select = useStore((s) => s.select);
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    if (!container) return;
    const compute = () => {
      const cards = new Map<string, HTMLElement>();
      container.querySelectorAll<HTMLElement>('[data-act]').forEach((el) => cards.set(el.dataset.act!, el));
      const next: Drawn[] = [];
      doc.links.forEach((l, i) => {
        const a = cards.get(l.from);
        const b = cards.get(l.to);
        if (!a || !b) return;
        // Routes are planned on the grid cells: two alternative cards share one.
        const cellOf = (el: HTMLElement) => rectWithin(el.closest<HTMLElement>('.cell') ?? el, container);
        const points = routeArrow(rectWithin(a, container), rectWithin(b, container), { col: GAP, row: ROW_GAP }, i, cellOf(a), cellOf(b));
        next.push({
          id: l.id,
          d: roundedPath(points),
          mid: midpoint(points),
          label: l.label ?? '',
          color: l.color ?? LINK_COLORS[0],
          dash: LINK_DASH[l.style ?? 'solid'],
          steps: [a, b].map((el) => el.closest<HTMLElement>('[data-step]')?.dataset.step ?? '').join(' '),
        });
      });
      setDrawn(next);
      setSize({ w: container.offsetWidth, h: container.offsetHeight });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [doc, container]);

  return (
    <>
      <svg className="links" width={size.w} height={size.h}>
        <defs>
          {drawn.map((p) => (
            <marker key={p.id} id={`mm-arrow-${p.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={p.color} />
            </marker>
          ))}
        </defs>
        {drawn.map((p) => {
          const selected = sel === `link:${p.id}`;
          return (
            <g key={p.id} data-link-steps={p.steps}>
              <path d={p.d} className="link-halo" fill="none" stroke={selected ? '#C9D5F6' : '#FFFFFF'} strokeWidth={selected ? 8 : 5} strokeLinecap="round" />
              <path
                d={p.d}
                className="link-line"
                fill="none"
                stroke={p.color}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeDasharray={p.dash.length ? p.dash.join(' ') : undefined}
                markerEnd={`url(#mm-arrow-${p.id})`}
              />
              <path d={p.d} className="link-hit" role="button" aria-label={t('board.selectArrow')} onClick={() => select(`link:${p.id}`)}>
                <title>{t('board.selectArrow')}</title>
              </path>
            </g>
          );
        })}
      </svg>
      {drawn
        .filter((p) => p.label)
        .map((p) => (
          <button
            key={p.id}
            data-link-steps={p.steps}
            className={cls('link-label', sel === `link:${p.id}` && 'is-selected')}
            style={{ left: p.mid.x, top: p.mid.y, color: p.color, borderColor: p.color }}
            onClick={() => select(`link:${p.id}`)}
          >
            {p.label}
          </button>
        ))}
    </>
  );
}
