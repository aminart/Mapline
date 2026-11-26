// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useState } from 'react';
import { activePersonaLinks, useStore, useT } from '../store';
import * as pl from '../model/personaLinks';
import { LINK_COLORS, personaAccent } from '../model/theme';
import type { Id, PersonaLinks, Relation, RelationType } from '../model/types';
import { addPersonaFromLinks, docLabel } from '../actions';
import { ColorMenu, IconButton, ToolMenu } from './ToolControls';
import { CenterIcon, CirclesIcon, FilterIcon, LinkIcon, PersonIcon, PersonLinksIcon, PlusIcon, SwapIcon, TrashIcon, ZoneIcon } from './Icons';
import { DASH_LABEL, LineSample, currentType, initials } from './PersonaLinksView';
import { cls } from './cls';

/** Persona links tools, on one line: the view, adding, linking, the kinds of link, zones, the filter, then the selection. */
export function PersonaLinksToolbar() {
  const t = useT();
  const links = useStore((s) => activePersonaLinks(s));
  const sel = useStore((s) => s.sel);
  const view = useStore((s) => s.plinksView);
  const setPlinks = useStore((s) => s.setPlinks);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const linkFrom = useStore((s) => s.linkFrom);
  const project = useStore((s) => s.project);
  const applyPersonaLinks = useStore((s) => s.applyPersonaLinks);
  const select = useStore((s) => s.select);
  if (!links) return null;
  const node = sel?.startsWith('pnode:') ? links.nodes.find((n) => n.id === sel.slice(6)) : undefined;
  const relation = sel?.startsWith('prel:') ? links.relations.find((r) => r.id === sel.slice(5)) : undefined;
  const zone = sel?.startsWith('pzone:') ? links.zones.find((z) => z.id === sel.slice(6)) : undefined;
  const fromName = linkFrom ? pl.resolveRef(project, links.nodes.find((n) => n.id === linkFrom)?.ref ?? { kind: 'sheet', id: '' })?.name : undefined;
  const addZone = () => {
    let made: Id | null = null;
    applyPersonaLinks((m) => {
      const r = pl.addZone(m, t('plinks.newZone'), node ? [node.id] : []);
      made = r.id;
      return r.links;
    });
    if (view !== 'network') setPlinks({ plinksView: 'network' });
    setPlinks({ plinksZones: true });
    if (made) select(`pzone:${made}`);
  };
  return (
    <div className="toolbar toolbar-compact" role="toolbar" aria-label={t('tool.label')}>
      <div className="segmented segmented-icons" role="group" aria-label={t('plinks.view')}>
        {(['network', 'circles'] as const).map((v) => (
          <button key={v} className={cls(view === v && 'is-on')} aria-pressed={view === v} aria-label={t(`plinks.view.${v}`)} title={t(`plinks.view.${v}`)} onClick={() => setPlinks(v === 'circles' && node ? { plinksView: v, plinksCenter: node.id } : { plinksView: v })}>
            {v === 'network' ? <PersonLinksIcon size={15} /> : <CirclesIcon />}
          </button>
        ))}
      </div>
      <div className="divider" />
      <AddPersonaMenu links={links} />
      <button
        className={cls('tool-icon', tool === 'link' && 'is-on')}
        aria-pressed={tool === 'link'}
        aria-label={t('plinks.link')}
        title={t('plinks.link')}
        onClick={() => setTool(tool === 'link' ? 'select' : 'link')}
      >
        <LinkIcon />
      </button>
      <TypesMenu links={links} />
      <IconButton label={t('plinks.addZone')} onClick={addZone}>
        <ZoneIcon />
      </IconButton>
      <FilterMenu links={links} />
      <div className="divider" />
      {tool === 'link' ? (
        <span className="hint plinks-hint-on">{fromName !== undefined ? t('plinks.linkHintFrom', { name: fromName || t('doc.unnamed') }) : t('plinks.linkHint')}</span>
      ) : relation ? (
        <RelationControls links={links} relation={relation} />
      ) : node ? (
        <NodeControls links={links} id={node.id} />
      ) : zone ? (
        <div className="tool-group">
          <span className="tool-kind">{t('plinks.kind.zone')}</span>
          <IconButton
            label={t('plinks.zoneRemove')}
            onClick={() => {
              applyPersonaLinks((m) => pl.removeZone(m, zone.id));
              select(null);
            }}
          >
            <TrashIcon />
          </IconButton>
        </div>
      ) : (
        <span className="hint">{t(view === 'circles' ? 'plinks.circlesHint' : 'plinks.hint')}</span>
      )}
    </div>
  );
}

/** The project's personas not on the page yet, all of them at once, or a new one (with its sheet). */
function AddPersonaMenu({ links }: { links: PersonaLinks }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const applyPersonaLinks = useStore((s) => s.applyPersonaLinks);
  const select = useStore((s) => s.select);
  const [name, setName] = useState('');
  const on = new Set(links.nodes.map((n) => pl.refKey(n.ref)));
  const missing = pl.projectPersonaInfos(project).filter((p) => !on.has(pl.refKey(p.ref)));
  const add = (refs: pl.PersonaInfo['ref'][]) => {
    let ids: Id[] = [];
    applyPersonaLinks((m) => {
      const r = pl.addNodes(m, refs);
      ids = r.ids;
      return r.links;
    });
    if (ids.length === 1) select(`pnode:${ids[0]}`);
  };
  return (
    <ToolMenu
      label={t('plinks.addPersonaTitle')}
      face={
        <>
          <PlusIcon size={12} />
          <span className="tool-pill-text">{t('plinks.addPersona')}</span>
        </>
      }
    >
      {(close) => (
        <div className="plinks-menu" role="group" aria-label={t('plinks.addPersonaTitle')}>
          <span className="tool-kind">{t('plinks.projectPersonas')}</span>
          {missing.length === 0 ? (
            <span className="hint">{t('plinks.allOn')}</span>
          ) : (
            <>
              {missing.map((p) => {
                const { accent, onAccent } = personaAccent(p.color, p.style);
                return (
                  <button
                    key={pl.refKey(p.ref)}
                    className="menu-item plinks-menu-persona"
                    onClick={() => {
                      add([p.ref]);
                      close();
                    }}
                  >
                    <span className="plinks-avatar plinks-avatar-sm" style={{ background: accent, color: onAccent }}>
                      {p.photo ? <img src={p.photo} alt="" /> : initials(p.name)}
                    </span>
                    <span className="plinks-menu-text">
                      <span>{p.name || t('doc.unnamed')}</span>
                      <span className="muted-sm">{[p.role, p.mapDocId ? docLabel(project, p.mapDocId) : t('plinks.fromSheet')].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                );
              })}
              {missing.length > 1 && (
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    add(missing.map((p) => p.ref));
                    close();
                  }}
                >
                  {t('plinks.addAll', { n: missing.length })}
                </button>
              )}
            </>
          )}
          <span className="tool-kind">{t('plinks.newPersona')}</span>
          <form
            className="plinks-new"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              addPersonaFromLinks(name);
              setName('');
              close();
            }}
          >
            <PersonIcon />
            <input className="text-field" aria-label={t('plinks.newPersonaName')} placeholder={t('plinks.newPersonaName')} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-sm" type="submit" disabled={!name.trim()}>
              {t('plinks.create')}
            </button>
          </form>
          <span className="muted-sm">{t('plinks.newPersonaHint')}</span>
        </div>
      )}
    </ToolMenu>
  );
}

/** The kind the next link gets, picked from the list, where each kind is renamed, restyled, added or removed. */
function TypesMenu({ links }: { links: PersonaLinks }) {
  const t = useT();
  const picked = useStore((s) => s.plinksType);
  const setPlinks = useStore((s) => s.setPlinks);
  const applyPersonaLinks = useStore((s) => s.applyPersonaLinks);
  const current = currentType(links, picked);
  const set = (id: Id, patch: Partial<Omit<RelationType, 'id'>>, coalesce?: string) => applyPersonaLinks((m) => pl.setType(m, id, patch), coalesce ? { coalesce } : undefined);
  return (
    <ToolMenu
      label={t('plinks.linkType')}
      title={`${t('plinks.linkType')} : ${current?.name ?? ''}`}
      face={
        <>
          {current && <LineSample type={current} width={24} />}
          <span className="tool-pill-text">{current?.name || t('plinks.untitledType')}</span>
        </>
      }
    >
      {() => (
        <div className="plinks-menu plinks-types" role="group" aria-label={t('plinks.types')}>
          <span className="tool-kind">{t('plinks.types')}</span>
          {links.types.map((ty) => {
            const used = links.relations.filter((r) => r.type === ty.id).length;
            const removable = used === 0 && links.types.length > 1;
            return (
              <div key={ty.id} className={cls('plinks-type-row', ty.id === current?.id && 'is-on')}>
                <button className="plinks-type-pick" aria-pressed={ty.id === current?.id} title={t('plinks.linkType')} onClick={() => setPlinks({ plinksType: ty.id })}>
                  <LineSample type={ty} />
                </button>
                <input className="text-field" aria-label={t('plinks.typeName')} value={ty.name} onChange={(e) => set(ty.id, { name: e.target.value }, `type-name:${ty.id}`)} />
                <ColorMenu label={t('plinks.typeColor')} list={LINK_COLORS} value={ty.color} variant="border" onPick={(hex, live) => set(ty.id, { color: hex }, live ? `type-color:${ty.id}` : undefined)} />
                <select className="tool-select" aria-label={t('plinks.typeDash')} value={ty.dash} onChange={(e) => set(ty.id, { dash: e.target.value as RelationType['dash'] })}>
                  {pl.RELATION_DASHES.map((d) => (
                    <option key={d} value={d}>
                      {t(DASH_LABEL[d])}
                    </option>
                  ))}
                </select>
                <select className="tool-select" aria-label={t('plinks.typeDir')} title={t('plinks.typeDir')} value={ty.dir} onChange={(e) => set(ty.id, { dir: e.target.value as RelationType['dir'] })}>
                  {pl.RELATION_DIRS.map((d) => (
                    <option key={d} value={d}>
                      {d === 'to' ? '→' : d === 'both' ? '↔' : '—'} {t(`plinks.dir.${d}`)}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-btn"
                  disabled={!removable}
                  aria-label={t('plinks.removeType', { name: ty.name })}
                  title={used ? t('plinks.typeUsed', { n: used }) : t('plinks.removeType', { name: ty.name })}
                  onClick={() => applyPersonaLinks((m) => pl.removeType(m, ty.id))}
                >
                  <TrashIcon size={13} />
                </button>
              </div>
            );
          })}
          <button
            className="btn btn-sm"
            onClick={() => {
              let id: Id | null = null;
              applyPersonaLinks((m) => {
                const r = pl.addType(m, t('plinks.newType'), LINK_COLORS);
                id = r.id;
                return r.links;
              });
              if (id) setPlinks({ plinksType: id });
            }}
          >
            <PlusIcon size={11} /> {t('plinks.addType')}
          </button>
        </div>
      )}
    </ToolMenu>
  );
}

function FilterMenu({ links }: { links: PersonaLinks }) {
  const t = useT();
  const hidden = useStore((s) => s.plinksHidden);
  const zones = useStore((s) => s.plinksZones);
  const suggest = useStore((s) => s.plinksSuggest);
  const setPlinks = useStore((s) => s.setPlinks);
  const filtering = hidden.length > 0 || suggest || !zones;
  return (
    <ToolMenu
      label={t('plinks.filter')}
      className={cls(filtering && 'is-filtering')}
      face={
        <>
          <FilterIcon />
          <span className="tool-pill-text">{t('plinks.filter')}</span>
        </>
      }
    >
      {() => (
        <div className="plinks-menu" role="group" aria-label={t('plinks.filter')}>
          <span className="tool-kind">{t('plinks.filter.types')}</span>
          {links.types.map((ty) => (
            <label key={ty.id} className="plinks-check">
              <input
                type="checkbox"
                checked={!hidden.includes(ty.id)}
                onChange={(e) => setPlinks({ plinksHidden: e.target.checked ? hidden.filter((h) => h !== ty.id) : [...hidden, ty.id] })}
              />
              <LineSample type={ty} />
              <span>{ty.name || t('plinks.untitledType')}</span>
              <span className="muted-sm plinks-check-count">{links.relations.filter((r) => r.type === ty.id).length}</span>
            </label>
          ))}
          <hr className="plinks-sep" />
          <label className="plinks-check">
            <input type="checkbox" checked={zones} onChange={(e) => setPlinks({ plinksZones: e.target.checked })} />
            <span>{t('plinks.filter.zones')}</span>
          </label>
          <label className="plinks-check">
            <input type="checkbox" checked={suggest} onChange={(e) => setPlinks({ plinksSuggest: e.target.checked })} />
            <span>
              {t('plinks.filter.suggest')}
              <span className="muted-sm plinks-check-hint">{t('plinks.filter.suggestHint')}</span>
            </span>
          </label>
        </div>
      )}
    </ToolMenu>
  );
}

/** The chosen persona: centre on it, link it, open its sheet, take it off the page. */
function NodeControls({ links, id }: { links: PersonaLinks; id: Id }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const setPlinks = useStore((s) => s.setPlinks);
  const setTool = useStore((s) => s.setTool);
  const setLinkFrom = useStore((s) => s.setLinkFrom);
  const setDoc = useStore((s) => s.setDoc);
  const select = useStore((s) => s.select);
  const applyPersonaLinks = useStore((s) => s.applyPersonaLinks);
  const node = links.nodes.find((n) => n.id === id);
  const info = node ? pl.resolveRef(project, node.ref) : undefined;
  if (!node || !info) return null;
  const { accent, onAccent } = personaAccent(info.color, info.style);
  return (
    <div className="tool-group">
      <span className="plinks-chip">
        <span className="plinks-avatar plinks-avatar-sm" style={{ background: accent, color: onAccent }}>
          {info.photo ? <img src={info.photo} alt="" /> : initials(info.name)}
        </span>
        {info.name || t('doc.unnamed')}
      </span>
      <IconButton label={t('plinks.center')} onClick={() => setPlinks({ plinksView: 'circles', plinksCenter: id })}>
        <CenterIcon />
      </IconButton>
      <button
        className="btn btn-sm"
        onClick={() => {
          setTool('link');
          setLinkFrom(id);
        }}
      >
        <LinkIcon size={13} /> {t('plinks.linkFrom')}
      </button>
      {info.sheetId && (
        <button className="btn btn-sm" onClick={() => setDoc(info.sheetId!)}>
          <PersonIcon size={13} /> {t('plinks.openSheet')}
        </button>
      )}
      <IconButton
        label={t('plinks.removeNode')}
        onClick={() => {
          applyPersonaLinks((m) => pl.removeNode(m, id));
          select(null);
        }}
      >
        <TrashIcon />
      </IconButton>
    </div>
  );
}

/** The chosen relation: its kind, direction, label and strength. */
function RelationControls({ links, relation }: { links: PersonaLinks; relation: Relation }) {
  const t = useT();
  const applyPersonaLinks = useStore((s) => s.applyPersonaLinks);
  const select = useStore((s) => s.select);
  const ty = links.types.find((x) => x.id === relation.type);
  const set = (patch: Partial<Omit<Relation, 'id' | 'from' | 'to'>>, coalesce?: string) => applyPersonaLinks((m) => pl.setRelation(m, relation.id, patch), coalesce ? { coalesce } : undefined);
  return (
    <div className="tool-group">
      <span className="tool-kind">{t('plinks.kind.relation')}</span>
      <ToolMenu
        label={t('plinks.relType')}
        title={`${t('plinks.relType')} : ${ty?.name ?? ''}`}
        face={
          <>
            {ty && <LineSample type={ty} width={24} />}
            <span className="tool-pill-text">{ty?.name || t('plinks.untitledType')}</span>
          </>
        }
      >
        {(close) => (
          <div className="menu-list" role="group" aria-label={t('plinks.relType')}>
            {links.types.map((x) => (
              <button
                key={x.id}
                className={cls('menu-item plinks-type-item', x.id === relation.type && 'is-on')}
                aria-pressed={x.id === relation.type}
                onClick={() => {
                  // A new kind brings its own direction.
                  if (x.id !== relation.type) set({ type: x.id, dir: x.dir });
                  close();
                }}
              >
                <LineSample type={x} />
                {x.name || t('plinks.untitledType')}
              </button>
            ))}
          </div>
        )}
      </ToolMenu>
      <div className="segmented segmented-icons" role="group" aria-label={t('plinks.dir')}>
        {pl.RELATION_DIRS.map((d) => (
          <button key={d} className={cls(relation.dir === d && 'is-on')} aria-pressed={relation.dir === d} aria-label={t(`plinks.dir.${d}`)} title={t(`plinks.dir.${d}`)} onClick={() => set({ dir: d })}>
            {d === 'to' ? '→' : d === 'both' ? '↔' : '—'}
          </button>
        ))}
      </div>
      <IconButton label={t('plinks.swap')} onClick={() => applyPersonaLinks((m) => pl.swapRelation(m, relation.id))}>
        <SwapIcon />
      </IconButton>
      <input
        className="text-field plinks-label-field"
        aria-label={t('plinks.label')}
        placeholder={t('plinks.labelPlaceholder')}
        value={relation.label ?? ''}
        onChange={(e) => set({ label: e.target.value }, `rel-label:${relation.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
      />
      <div className="segmented segmented-icons" role="group" aria-label={t('plinks.strength')}>
        {([1, 2, 3] as const).map((n) => (
          <button key={n} className={cls((relation.strength ?? 2) === n && 'is-on')} aria-pressed={(relation.strength ?? 2) === n} aria-label={t('plinks.strengthN', { n })} title={t('plinks.strengthN', { n })} onClick={() => set({ strength: n })}>
            <span className="plinks-strength" style={{ height: pl.strokeWidth(n) }} />
          </button>
        ))}
      </div>
      <IconButton
        label={t('plinks.removeRel')}
        onClick={() => {
          applyPersonaLinks((m) => pl.removeRelation(m, relation.id));
          select(null);
        }}
      >
        <TrashIcon />
      </IconButton>
    </div>
  );
}
