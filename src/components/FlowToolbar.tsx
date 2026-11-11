// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { activeFlow, useStore, useT } from '../store';
import * as fo from '../model/flow';
import { findDoc, projectPersonas, renameDoc } from '../model/project';
import { BORDER_SWATCHES, FILL_SWATCHES, LINK_COLORS, flowCardTop, personaAccent, resolveStyle } from '../model/theme';
import type { Flow, LinkSide, LinkStyle } from '../model/types';
import { SIDES } from '../lib/flowRoute';
import { Swatches, TagManager } from './FormatToolbar';
import { CursorIcon, LinkIcon } from './Icons';
import { cls } from './cls';
import { TargetButton } from './StateBar';

/** Flow tools: select or connect, the flow's name, and the selected card or arrow. */
export function FlowToolbar() {
  const t = useT();
  const flow = useStore((s) => activeFlow(s));
  const name = useStore((s) => findDoc(s.project, s.docId)?.name ?? '');
  const docId = useStore((s) => s.docId);
  const sel = useStore((s) => s.sel);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const linkFrom = useStore((s) => s.linkFrom);
  const applyProject = useStore((s) => s.applyProject);
  const applyFlow = useStore((s) => s.applyFlow);
  if (!flow) return null;
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
      <label className="field">
        {t('flow.name')}
        <input
          className="text-field text-field-fit"
          value={name}
          placeholder={t('flow.default')}
          size={Math.max(12, name.length + 1)}
          onChange={(e) => {
            const v = e.target.value;
            applyProject((p) => renameDoc(p, docId, v), { coalesce: `doc-name:${docId}` });
          }}
        />
      </label>
      <TagManager
        tags={fo.flowTagCounts(flow)}
        colors={flow.tagColors}
        setColor={(tag, i) => applyFlow((f) => fo.setFlowTagColor(f, tag, i))}
        deleteTag={(tag) => applyFlow((f) => fo.deleteFlowTag(f, tag))}
      />
      <div className="divider" />
      {tool === 'link' ? (
        <span className="hint">{t(linkFrom ? 'flow.linkHintTarget' : 'flow.linkHintStart')}</span>
      ) : sel?.startsWith('node:') ? (
        <NodeControls flow={flow} id={sel.slice('node:'.length)} />
      ) : sel?.startsWith('flink:') ? (
        <LinkControls flow={flow} id={sel.slice('flink:'.length)} />
      ) : (
        <span className="hint">{t('flow.hint')}</span>
      )}
      <TargetButton />
    </div>
  );
}

function NodeControls({ flow, id }: { flow: Flow; id: string }) {
  const t = useT();
  const applyFlow = useStore((s) => s.applyFlow);
  const project = useStore((s) => s.project);
  const node = fo.findNode(flow, id);
  if (!node) return null;
  const custom = flow.styles[`node:${id}`];
  const personas = projectPersonas(project);
  const mainName = personas.find((p) => p.persona.id === flow.personaId)?.persona.name;
  const editable = node.kind === 'activity' || node.kind === 'choice';
  const picked = fo.nodePersonas(node);
  // As on the card: its first persona's colour, else the flow's main persona's.
  const persona = personas.find((p) => p.persona.id === (picked[0] ?? flow.personaId));
  const accent = persona ? personaAccent(persona.persona.color, persona.style).accent : node.kind === 'choice' ? '#A16207' : '#2F55D4';
  const cur = resolveStyle('node', custom);
  const set = (patch: Flow['styles'][string], live?: boolean) => applyFlow((f) => fo.setNodeStyle(f, id, patch), live ? { coalesce: `style:node:${id}` } : undefined);
  return (
    <div className="style-controls">
      <span className="badge">{t(`flow.kind.${node.kind}`)}</span>
      {editable && (
        <div className="swatches" role="group" aria-label={t('flow.kind')}>
          <span className="swatches-label">{t('flow.kind')}</span>
          <div className="segmented segmented-sm">
            {(['activity', 'choice'] as const).map((k) => (
              <button key={k} className={cls(node.kind === k && 'is-on')} aria-pressed={node.kind === k} onClick={() => applyFlow((f) => fo.setNode(f, id, { kind: k }))}>
                {t(`flow.kind.${k}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      {editable && personas.length > 0 && (
        <div className="swatches flow-persona-picks" role="group" aria-label={t('flow.personas')}>
          <span className="swatches-label">{t('flow.personas')}</span>
          <div className="persona-chips">
            {personas.map(({ persona, style, photo }) => {
              const on = picked.includes(persona.id);
              const name = persona.name || t('doc.unnamed');
              return (
                <button
                  key={persona.id}
                  className={cls('persona-chip', on && 'is-on')}
                  aria-pressed={on}
                  title={on ? t('flow.removePersona', { name }) : t('flow.addPersona', { name })}
                  onClick={() => applyFlow((f) => fo.toggleNodePersona(f, id, persona.id))}
                >
                  <span className="persona-chip-dot" style={{ background: personaAccent(persona.color, style).accent }}>
                    {photo ? <img src={photo} alt="" /> : name.charAt(0).toUpperCase()}
                  </span>
                  {name}
                </button>
              );
            })}
          </div>
          {picked.length === 0 && (
            <span className="hint">{mainName !== undefined ? t('flow.inheritPersona', { name: mainName || t('doc.unnamed') }) : t('flow.noPersonaHint')}</span>
          )}
        </div>
      )}
      {editable && (
        <>
          <Swatches label={t('tool.fill')} list={FILL_SWATCHES} value={cur.bg} variant="fill" onPick={(bg, live) => set({ bg }, live)} />
          <Swatches label={t('tool.border')} list={BORDER_SWATCHES} value={cur.bc} variant="border" onPick={(bc, live) => set({ bc }, live)} />
          <Swatches label={t('flow.topLine')} list={[accent, ...BORDER_SWATCHES.filter((c) => c !== accent && c !== BORDER_SWATCHES[0])]} value={flowCardTop(custom, accent)} variant="fill" onPick={(top, live) => set({ top: top === accent && !custom?.bc ? undefined : top }, live)} />
        </>
      )}
      {custom && (
        <button className="text-btn" onClick={() => applyFlow((f) => fo.resetNodeStyle(f, id))}>
          {t('tool.reset')}
        </button>
      )}
    </div>
  );
}

/** A card with one side drawn bold: the side an arrow leaves or enters by. */
function SideIcon({ side }: { side: LinkSide }) {
  const edge = { top: 'M3 3h10', right: 'M13 3v10', bottom: 'M3 13h10', left: 'M3 3v10' }[side];
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round">
      <rect x="3" y="3" width="10" height="10" rx="1.5" strokeWidth="1.2" opacity="0.45" />
      <path d={edge} strokeWidth="2.6" />
    </svg>
  );
}

function LinkControls({ flow, id }: { flow: Flow; id: string }) {
  const t = useT();
  const applyFlow = useStore((s) => s.applyFlow);
  const select = useStore((s) => s.select);
  const link = flow.links.find((l) => l.id === id);
  if (!link) return <span className="hint">{t('tool.noSelection')}</span>;
  const style = link.style ?? 'solid';
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
            applyFlow((f) => fo.updateFlowLink(f, id, { label: v }), { coalesce: `flink-label:${id}` });
          }}
        />
      </label>
      <div className="swatches" role="group" aria-label={t('link.style')}>
        <span className="swatches-label">{t('link.style')}</span>
        <div className="segmented segmented-sm">
          {styles.map((st) => (
            <button key={st} className={cls(style === st && 'is-on')} aria-pressed={style === st} onClick={() => applyFlow((f) => fo.updateFlowLink(f, id, { style: st }))}>
              {t(`link.${st}`)}
            </button>
          ))}
        </div>
      </div>
      <Swatches label={t('link.color')} list={LINK_COLORS} value={link.color ?? LINK_COLORS[0]} variant="fill" onPick={(hex, live) => applyFlow((f) => fo.updateFlowLink(f, id, { color: hex }), live ? { coalesce: `flink-color:${id}` } : undefined)} />
      {(['fromSide', 'toSide'] as const).map((end) => (
        <div key={end} className="swatches" role="group" aria-label={t(`link.${end}`)}>
          <span className="swatches-label">{t(`link.${end}`)}</span>
          <div className="segmented segmented-sm link-sides">
            {([undefined, ...SIDES] as const).map((side) => {
              const on = link[end] === side;
              const name = side ? t(`link.side.${side}`) : t('link.sideAutoHint');
              return (
                <button key={side ?? 'auto'} className={cls(on && 'is-on')} aria-pressed={on} aria-label={side ? name : t('link.sideAuto')} title={name} onClick={() => applyFlow((f) => fo.updateFlowLink(f, id, { [end]: side }))}>
                  {side ? <SideIcon side={side} /> : t('link.sideAuto')}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button
        className="text-btn"
        onClick={() => {
          applyFlow((f) => fo.removeFlowLink(f, id));
          select(null);
        }}
      >
        {t('link.delete')}
      </button>
    </div>
  );
}
