// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

// The pieces of the map's and the flow's toolbars, kept to one line: tools as
// icons, and each colour palette or rarely used setting behind a small menu.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore, useT } from '../store';
import { FONTS, LINK_COLORS, SIZES } from '../model/theme';
import type { FontId, LinkSide, LinkStyle } from '../model/types';
import { ChevronDown, CursorIcon, LinkIcon, ResetIcon, StoryboardIcon, TrashIcon } from './Icons';
import { LinkSides, SideIcon } from './LinkSides';
import { cls } from './cls';

/** A button that opens a small panel under it; outside clicks and Échap close it. */
export function ToolMenu(props: { label: string; title?: string; face: ReactNode; className?: string; children: (close: () => void) => ReactNode }) {
  const { label, title, face, className, children } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  return (
    <div className={cls('tool-menu', className)} ref={ref}>
      <button className={cls('tool-pill', open && 'is-open')} aria-label={label} title={title ?? label} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {face}
        <ChevronDown size={11} />
      </button>
      {open && <div className="tool-menu-panel">{children(() => setOpen(false))}</div>}
    </div>
  );
}

/** One colour setting: a chip showing the colour, its palette in a menu. */
export function ColorMenu(props: { label: string; list: string[]; value: string; variant: 'fill' | 'border' | 'text' | 'top'; onPick: (hex: string, live?: boolean) => void }) {
  const { label, list, value, variant, onPick } = props;
  const chip =
    variant === 'border' ? (
      <span className="color-chip color-chip-border" style={{ borderColor: value }} />
    ) : variant === 'text' ? (
      <span className="color-chip-text" style={{ borderColor: value }}>
        A
      </span>
    ) : variant === 'top' ? (
      <span className="color-chip color-chip-top" style={{ ['--chip' as string]: value }} />
    ) : (
      <span className="color-chip" style={{ background: value }} />
    );
  return (
    <ToolMenu label={label} title={`${label} : ${value}`} face={chip}>
      {(close) => (
        <Swatches
          label={label}
          list={list}
          value={value}
          variant={variant === 'top' ? 'fill' : variant}
          onPick={(hex, live) => {
            onPick(hex, live);
            if (!live) close();
          }}
        />
      )}
    </ToolMenu>
  );
}

/** Select or Connect, as two icons. */
export function ToolModes() {
  const t = useT();
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  return (
    <div className="segmented segmented-icons">
      <button className={cls(tool === 'select' && 'is-on')} aria-pressed={tool === 'select'} aria-label={t('tool.select')} title={t('tool.select')} onClick={() => setTool('select')}>
        <CursorIcon />
      </button>
      <button className={cls(tool === 'link' && 'is-on')} aria-pressed={tool === 'link'} aria-label={t('tool.link')} title={t('tool.link')} onClick={() => setTool('link')}>
        <LinkIcon />
      </button>
    </div>
  );
}

export function StoryboardToggle({ on, set }: { on: boolean; set: (on: boolean) => void }) {
  const t = useT();
  return (
    <button className={cls('tool-icon', on && 'is-on')} aria-pressed={on} aria-label={t('tool.storyboard')} title={t('tool.storyboard')} onClick={() => set(!on)}>
      <StoryboardIcon />
    </button>
  );
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="tool-icon" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function ResetButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <IconButton label={t('tool.reset')} onClick={onClick}>
      <ResetIcon />
    </IconButton>
  );
}

/** A card's type, in a menu: one button per type, the current one pressed. */
export function KindMenu<K extends string>(props: { value: K; options: { key: K; label: string }[]; onPick: (k: K) => void }) {
  const t = useT();
  const { value, options, onPick } = props;
  const current = options.find((o) => o.key === value)?.label ?? value;
  return (
    <ToolMenu label={t('tool.cardKind')} title={`${t('tool.cardKind')} : ${current}`} face={<span className="tool-pill-text">{current}</span>}>
      {(close) => (
        <div className="menu-list" role="group" aria-label={t('tool.cardKind')}>
          {options.map((o) => (
            <button
              key={o.key}
              className={cls('menu-item', o.key === value && 'is-on')}
              aria-pressed={o.key === value}
              onClick={() => {
                if (o.key !== value) onPick(o.key);
                close();
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </ToolMenu>
  );
}

export interface TextStyle {
  font: FontId;
  size: number;
  weight: number;
}

function TextStyleFields({ cur, set }: { cur: TextStyle; set: (patch: Partial<TextStyle>) => void }) {
  const t = useT();
  return (
    <>
      <select className="tool-select" aria-label={t('tool.font')} title={t('tool.font')} value={cur.font} onChange={(e) => set({ font: e.target.value as FontId })}>
        {(Object.keys(FONTS) as FontId[]).map((f) => (
          <option key={f} value={f}>
            {t(`font.${f}`)}
          </option>
        ))}
      </select>
      <select className="tool-select" aria-label={t('tool.size')} title={t('tool.size')} value={cur.size} onChange={(e) => set({ size: Number(e.target.value) })}>
        {(SIZES.includes(cur.size) ? SIZES : [...SIZES, cur.size].sort((a, b) => a - b)).map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button className={cls('tool-icon tool-bold', cur.weight >= 600 && 'is-on')} aria-pressed={cur.weight >= 600} aria-label={t('tool.bold')} title={t('tool.bold')} onClick={() => set({ weight: cur.weight >= 600 ? 400 : 700 })}>
        B
      </button>
    </>
  );
}

/** Font, size and bold: on the bar in wide windows, behind « Aa » in narrow ones. */
export function TextStyleControls(props: { cur: TextStyle; set: (patch: Partial<TextStyle>) => void }) {
  const t = useT();
  return (
    <>
      <div className="tool-group text-style-inline">
        <TextStyleFields {...props} />
      </div>
      <ToolMenu className="text-style-menu" label={t('tool.textStyle')} face={<span className="tool-pill-text tool-aa">Aa</span>}>
        {() => (
          <div className="tool-group">
            <TextStyleFields {...props} />
          </div>
        )}
      </ToolMenu>
    </>
  );
}

function strokeIcon(st: LinkStyle) {
  return (
    <svg width="22" height="8" aria-hidden="true">
      <line x1="1" y1="4" x2="21" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray={st === 'dashed' ? '5 3' : st === 'dotted' ? '0.5 4' : undefined} />
    </svg>
  );
}

interface ArrowLike {
  label?: string;
  style?: LinkStyle;
  color?: string;
  fromSide?: LinkSide;
  toSide?: LinkSide;
}

/** A selected arrow, on a map or in a flow: its text, line, colour, sides; delete it. */
export function ArrowControls(props: {
  link: ArrowLike;
  setLabel: (v: string) => void;
  update: (patch: Partial<ArrowLike>, live?: boolean) => void;
  remove: () => void;
}) {
  const t = useT();
  const { link, setLabel, update, remove } = props;
  const style = link.style ?? 'solid';
  const styles: LinkStyle[] = ['solid', 'dashed', 'dotted'];
  const sideName = (s: LinkSide | undefined) => (s ? t(`link.side.${s}`) : t('link.sideAuto'));
  const sides = !link.fromSide && !link.toSide ? t('link.sideAuto') : `${sideName(link.fromSide)} → ${sideName(link.toSide)}`;
  return (
    <div className="tool-group">
      <span className="tool-kind">{t('kind.link')}</span>
      <input className="text-field tool-text-field" aria-label={t('link.label')} value={link.label ?? ''} placeholder={t('link.labelPlaceholder')} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
      <div className="segmented segmented-icons" role="group" aria-label={t('link.style')}>
        {styles.map((st) => (
          <button key={st} className={cls(style === st && 'is-on')} aria-pressed={style === st} aria-label={t(`link.${st}`)} title={t(`link.${st}`)} onClick={() => update({ style: st })}>
            {strokeIcon(st)}
          </button>
        ))}
      </div>
      <ColorMenu label={t('link.color')} list={LINK_COLORS} value={link.color ?? LINK_COLORS[0]} variant="fill" onPick={(hex, live) => update({ color: hex }, live)} />
      <ToolMenu
        label={t('link.sides')}
        title={`${t('link.sides')} : ${sides}`}
        face={
          <>
            <SideIcon side={link.fromSide ?? 'bottom'} />
            <span className="tool-pill-text">
              {t('link.sides')} : {sides}
            </span>
          </>
        }
      >
        {() => (
          <div className="sides-panel">
            <LinkSides link={link} onPick={(end, side) => update({ [end]: side })} />
          </div>
        )}
      </ToolMenu>
      <IconButton label={t('link.delete')} onClick={remove}>
        <TrashIcon />
      </IconButton>
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
