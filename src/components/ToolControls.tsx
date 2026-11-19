// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

// The pieces of the map's and the flow's toolbars, kept to one line: tools as
// icons, and each colour palette or rarely used setting behind a small menu.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useStore, useT } from '../store';
import { FONTS, LINK_COLORS, SIZES } from '../model/theme';
import type { FontId, LinkSide, LinkStyle } from '../model/types';
import { pickColor, isSampling } from '../lib/pipette';
import { shown, type ColorRole } from '../lib/shownColor';
import { hideUsedColor, showUsedColor, usedColors, USED_COLORS_MAX } from '../model/usedColors';
import { ChevronDown, CloseIcon, CursorIcon, PipetteIcon, LinkIcon, ResetIcon, StoryboardIcon, TrashIcon } from './Icons';
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
      if (!isSampling() && !ref.current?.contains(e.target as Node)) setOpen(false);
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
export function ColorMenu(props: { label: string; list: string[]; value: string; variant: 'fill' | 'border' | 'text' | 'top'; role?: ColorRole; onPick: (hex: string, live?: boolean) => void }) {
  const { label, list, value, variant, onPick } = props;
  // Shown as on the board: in the dark theme, Mapline's colours have dark counterparts.
  const role = props.role ?? roleOf(variant);
  const face = shown(value, role);
  const chip =
    variant === 'border' ? (
      <span className="color-chip color-chip-border" style={{ borderColor: face }} />
    ) : variant === 'text' ? (
      <span className="color-chip-text" style={{ borderColor: face }}>
        A
      </span>
    ) : variant === 'top' ? (
      <span className="color-chip color-chip-top" style={{ ['--chip' as string]: face }} />
    ) : (
      <span className="color-chip" style={{ background: face }} />
    );
  return (
    <ToolMenu label={label} title={`${label} : ${value}`} face={chip}>
      {(close) => (
        <Swatches
          withUsed
          label={label}
          list={list}
          value={value}
          variant={variant === 'top' ? 'fill' : variant}
          role={role}
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

/**
 * A choice among a few values, as Mapline's own menu rather than the system's list: one button per
 * value, the current one pressed. Each option may carry a style (a font shown in itself).
 */
export function SelectMenu<K extends string | number>(props: {
  label: string;
  value: K;
  options: { key: K; label: string; style?: CSSProperties }[];
  onPick: (k: K) => void;
  className?: string;
}) {
  const { label, value, options, onPick, className } = props;
  const current = options.find((o) => o.key === value);
  return (
    <ToolMenu className={className} label={label} title={`${label} : ${current?.label ?? value}`} face={<span className="tool-pill-text" style={current?.style}>{current?.label ?? value}</span>}>
      {(close) => (
        <div className="menu-list" role="group" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.key}
              className={cls('menu-item', o.key === value && 'is-on')}
              style={o.style}
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

/** A card's type, in a menu: one button per type, the current one pressed. */
export function KindMenu<K extends string>(props: { value: K; options: { key: K; label: string }[]; onPick: (k: K) => void }) {
  const t = useT();
  return <SelectMenu label={t('tool.cardKind')} {...props} />;
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
      <SelectMenu
        className="font-menu"
        label={t('tool.font')}
        value={cur.font}
        options={(Object.keys(FONTS) as FontId[]).map((f) => ({ key: f, label: t(`font.${f}`), style: { fontFamily: FONTS[f] } }))}
        onPick={(font) => set({ font })}
      />
      <SelectMenu
        className="size-menu"
        label={t('tool.size')}
        value={cur.size}
        options={(SIZES.includes(cur.size) ? SIZES : [...SIZES, cur.size].sort((a, b) => a - b)).map((n) => ({ key: n, label: String(n) }))}
        onPick={(size) => set({ size })}
      />
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
      <ColorMenu label={t('link.color')} list={LINK_COLORS} value={link.color ?? LINK_COLORS[0]} variant="fill" role="line" onPick={(hex, live) => update({ color: hex }, live)} />
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

export function Swatches(props: { label: string; list: string[]; value: string; onPick: (hex: string, live?: boolean) => void; variant: 'fill' | 'border' | 'text'; role?: ColorRole; withUsed?: boolean }) {
  const t = useT();
  const { label, list, value, onPick, variant, withUsed = false } = props;
  const role = props.role ?? roleOf(variant);
  const project = useStore((s) => s.project);
  const applyProject = useStore((s) => s.applyProject);
  const used = withUsed ? usedColors(project).filter((c) => !list.includes(c)).slice(0, USED_COLORS_MAX) : [];
  const options = list.includes(value) || used.includes(value) ? list : [...list, value];
  // A colour picked on purpose is offered again, even if it was taken off the shortcuts.
  const pickOwn = (hex: string, live?: boolean) => {
    onPick(hex, live);
    applyProject((p) => showUsedColor(p, hex), live ? { coalesce: 'show-color' } : undefined);
  };
  const pipette = async () => {
    const hex = await pickColor(t('tool.pipetteHint'));
    if (hex) pickOwn(hex);
  };
  const swatch = (hex: string) => (
    <button
      key={hex}
      className={cls('swatch', `swatch-${variant}`, hex === value && 'is-on')}
      style={variant === 'fill' ? { background: shown(hex, role) } : variant === 'border' ? { borderColor: shown(hex, role) } : { color: shown(hex, role) }}
      aria-label={`${label} ${hex}`}
      aria-pressed={hex === value}
      title={hex}
      onClick={() => onPick(hex)}
    >
      {variant === 'text' ? 'A' : null}
    </button>
  );
  return (
    <div className="swatches" role="group" aria-label={label}>
      <span className="swatches-label">{label}</span>
      {options.map(swatch)}
      <label className="swatch swatch-custom" title={t('tool.customColor')}>
        <span aria-hidden="true">+</span>
        <input type="color" aria-label={`${label} : ${t('tool.customColor')}`} value={value.length === 7 ? value : '#000000'} onChange={(e) => pickOwn(e.target.value.toUpperCase(), true)} />
      </label>
      <button className="swatch swatch-tool" aria-label={`${label} : ${t('tool.pipette')}`} title={t('tool.pipette')} onClick={pipette}>
        <PipetteIcon />
      </button>
      {used.length > 0 && (
        <div className="swatches-used" role="group" aria-label={t('tool.usedColors')}>
          <span className="swatches-label">{t('tool.usedColors')}</span>
          {used.map((hex) => (
            <span key={hex} className="swatch-used">
              {swatch(hex)}
              <button
                className="swatch-hide"
                aria-label={t('tool.hideColor', { hex })}
                title={t('tool.hideColor', { hex })}
                onClick={() => applyProject((p) => hideUsedColor(p, hex))}
              >
                <CloseIcon size={9} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** How a colour menu's colours are used: fills, lines or text. */
function roleOf(variant: 'fill' | 'border' | 'text' | 'top'): ColorRole {
  return variant === 'fill' ? 'bg' : variant === 'text' ? 'ink' : 'line';
}
