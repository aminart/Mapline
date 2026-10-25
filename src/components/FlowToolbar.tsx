// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { activeFlow, useStore, useT } from '../store';
import * as fo from '../model/flow';
import { findDoc, projectPersonas, renameDoc } from '../model/project';
import { FILL_SWATCHES, LINK_COLORS } from '../model/theme';
import type { Flow, LinkStyle } from '../model/types';
import { Swatches, TagManager } from './FormatToolbar';
import { CursorIcon, LinkIcon } from './Icons';
import { cls } from './cls';

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
          className="text-field"
          value={name}
          placeholder={t('flow.default')}
          maxLength={60}
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
  const editable = node.kind === 'activity' || node.kind === 'choice';
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
        <label className="field">
          {t('flow.persona')}
          <select value={node.personaId ?? ''} onChange={(e) => {
            const v = e.target.value || null;
            applyFlow((f) => fo.setNode(f, id, { personaId: v }));
          }}>
            <option value="">{t('flow.noPersona')}</option>
            {personas.map(({ persona }) => (
              <option key={persona.id} value={persona.id}>
                {persona.name || t('doc.unnamed')}
              </option>
            ))}
          </select>
        </label>
      )}
      {editable && (
        <Swatches label={t('tool.fill')} list={FILL_SWATCHES} value={custom?.bg ?? '#FFFFFF'} variant="fill" onPick={(bg, live) => applyFlow((f) => fo.setNodeStyle(f, id, { bg }), live ? { coalesce: `style:node:${id}` } : undefined)} />
      )}
      {custom && (
        <button className="text-btn" onClick={() => applyFlow((f) => fo.resetNodeStyle(f, id))}>
          {t('tool.reset')}
        </button>
      )}
    </div>
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
