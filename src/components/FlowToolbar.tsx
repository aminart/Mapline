// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { activeFlow, useStore, useT } from '../store';
import * as fo from '../model/flow';
import { projectPersonas } from '../model/project';
import { BORDER_SWATCHES, FILL_SWATCHES, flowCardTop, personaAccent, resolveStyle } from '../model/theme';
import type { Flow, FlowNode } from '../model/types';
import { TagManager } from './FormatToolbar';
import { cls } from './cls';
import { TargetButton } from './StateBar';
import { ArrowControls, ColorMenu, KindMenu, ResetButton, ToolMenu, ToolModes } from './ToolControls';

/** Flow tools: select or connect, tags, and the selected card or arrow. */
export function FlowToolbar() {
  const t = useT();
  const flow = useStore((s) => activeFlow(s));
  const sel = useStore((s) => s.sel);
  const tool = useStore((s) => s.tool);
  const linkFrom = useStore((s) => s.linkFrom);
  const applyFlow = useStore((s) => s.applyFlow);
  if (!flow) return null;
  return (
    <div className="toolbar toolbar-compact" role="toolbar" aria-label={t('tool.label')}>
      <ToolModes />
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
  const kinds: FlowNode['kind'][] = ['activity', 'choice', 'start', 'end'];
  return (
    <div className="tool-group">
      <span className="tool-kind">{t('kind.node')}</span>
      <KindMenu value={node.kind} options={kinds.map((k) => ({ key: k, label: t(`flow.kind.${k}`) }))} onPick={(k) => applyFlow((f) => fo.setNodeKind(f, id, k))} />
      {editable && personas.length > 0 && (
        <ToolMenu
          label={t('flow.personas')}
          title={picked.length === 0 ? (mainName !== undefined ? t('flow.inheritPersona', { name: mainName || t('doc.unnamed') }) : t('flow.noPersonaHint')) : t('flow.personas')}
          face={
            <>
              <span className={cls('avatar-stack', picked.length === 0 && 'is-inherited')}>
                {(picked.length > 0 ? picked : flow.personaId ? [flow.personaId] : [])
                  .map((pid) => personas.find((p) => p.persona.id === pid))
                  .filter((p) => !!p)
                  .slice(0, 3)
                  .map(({ persona, style, photo }) => (
                    <span key={persona.id} className="persona-chip-dot" style={{ background: personaAccent(persona.color, style).accent }}>
                      {photo ? <img src={photo} alt="" /> : (persona.name || t('doc.unnamed')).charAt(0).toUpperCase()}
                    </span>
                  ))}
                {picked.length > 3 && <span className="avatar-more">+{picked.length - 3}</span>}
              </span>
              <span className="tool-pill-text">{t('flow.personas')}</span>
            </>
          }
        >
          {() => (
            <div className="flow-persona-picks" role="group" aria-label={t('flow.personas')}>
              <div className="persona-chips persona-chips-list">
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
        </ToolMenu>
      )}
      {editable && (
        <>
          <div className="divider" />
          <ColorMenu label={t('tool.fill')} list={FILL_SWATCHES} value={cur.bg} variant="fill" onPick={(bg, live) => set({ bg }, live)} />
          <ColorMenu label={t('tool.border')} list={BORDER_SWATCHES} value={cur.bc} variant="border" onPick={(bc, live) => set({ bc }, live)} />
          <ColorMenu label={t('flow.topLine')} list={[accent, ...BORDER_SWATCHES.filter((c) => c !== accent && c !== BORDER_SWATCHES[0])]} value={flowCardTop(custom, accent)} variant="top" onPick={(top, live) => set({ top: top === accent && !custom?.bc ? undefined : top }, live)} />
        </>
      )}
      {custom && <ResetButton onClick={() => applyFlow((f) => fo.resetNodeStyle(f, id))} />}
    </div>
  );
}

function LinkControls({ flow, id }: { flow: Flow; id: string }) {
  const t = useT();
  const applyFlow = useStore((s) => s.applyFlow);
  const select = useStore((s) => s.select);
  const link = flow.links.find((l) => l.id === id);
  if (!link) return <span className="hint">{t('tool.noSelection')}</span>;
  return (
    <ArrowControls
      link={link}
      setLabel={(v) => applyFlow((f) => fo.updateFlowLink(f, id, { label: v }), { coalesce: `flink-label:${id}` })}
      update={(patch, live) => applyFlow((f) => fo.updateFlowLink(f, id, patch), live ? { coalesce: `flink-style:${id}` } : undefined)}
      remove={() => {
        applyFlow((f) => fo.removeFlowLink(f, id));
        select(null);
      }}
    />
  );
}
