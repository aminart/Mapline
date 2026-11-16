// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef } from 'react';
import { activeSitemap, useStore, useT } from '../store';
import * as sm from '../model/sitemap';
import { projectPersonas } from '../model/project';
import { personaAccent } from '../model/theme';
import type { Id, Project, Screen, ScreenLink, ScreenStatus, Sitemap } from '../model/types';
import { docLabel } from '../actions';
import { ExtraMark, liveLinks, resolveScreenLink } from './SitemapView';
import { IconButton, ToolMenu } from './ToolControls';
import { AddChildIcon, AddSiblingIcon, CloseIcon, CollapseIcon, ExpandIcon, FilterIcon, GlobeIcon, LinkIcon, ListIcon, SitemapIcon, TrashIcon } from './Icons';
import { cls } from './cls';
import { boardRef } from './Board';

/** Sitemap tools, on one line: the view, adding screens, folding, the filter, then the selected screen. */
export function SitemapToolbar() {
  const t = useT();
  const sitemap = useStore((s) => activeSitemap(s));
  const sel = useStore((s) => s.sel);
  const view = useStore((s) => s.sitemapView);
  const setView = useStore((s) => s.setSitemapView);
  // The other view starts from the left: the list's names would otherwise be off screen.
  const showView = (v: 'tree' | 'list') => {
    if (v === view) return;
    setView(v);
    boardRef.current?.closest('.canvas')?.scrollTo({ left: 0 });
  };
  const applySitemap = useStore((s) => s.applySitemap);
  const focusLater = useStore((s) => s.focusLater);
  const setAllFolded = useStore((s) => s.setAllFolded);
  if (!sitemap) return null;
  const id = sel?.startsWith('screen:') ? sel.slice('screen:'.length) : null;
  const place = id ? sm.findScreen(sitemap, id) : undefined;
  const add = (child: boolean) => {
    let made: Id | null = null;
    applySitemap((m) => {
      const r = child && place ? sm.addChildScreen(m, place.screen.id) : sm.addScreenAfter(m, place?.screen.id ?? null);
      made = r.id;
      return r.sitemap;
    });
    if (made) {
      if (child && place) useStore.getState().setFolded(place.screen.id, false);
      focusLater(`screen:${made}`);
    }
  };
  const foldBelowTwo = () => {
    const ids = sm.allScreens(sitemap).filter((p) => !p.global && p.depth >= 1 && p.screen.children.length > 0).map((p) => p.screen.id);
    setAllFolded(ids);
  };
  return (
    <div className="toolbar toolbar-compact" role="toolbar" aria-label={t('tool.label')}>
      <div className="segmented segmented-icons" role="group" aria-label={t('sitemap.view')}>
        {(['tree', 'list'] as const).map((v) => (
          <button key={v} className={cls(view === v && 'is-on')} aria-pressed={view === v} aria-label={t(`sitemap.view.${v}`)} title={t(`sitemap.view.${v}`)} onClick={() => showView(v)}>
            {v === 'tree' ? <SitemapIcon size={15} /> : <ListIcon />}
          </button>
        ))}
      </div>
      <div className="divider" />
      <IconButton label={t('sitemap.addScreen')} onClick={() => add(false)}>
        <AddSiblingIcon />
      </IconButton>
      <button className="tool-icon" aria-label={t('sitemap.addChild')} title={t('sitemap.addChild')} disabled={!place || place.global} onClick={() => add(true)}>
        <AddChildIcon />
      </button>
      <IconButton label={t('sitemap.expandAll')} onClick={() => setAllFolded([])}>
        <ExpandIcon />
      </IconButton>
      <IconButton label={t('sitemap.collapseAll')} onClick={foldBelowTwo}>
        <CollapseIcon />
      </IconButton>
      <div className="divider" />
      <FilterMenu />
      <div className="divider" />
      {place ? <ScreenControls sitemap={sitemap} screen={place.screen} global={place.global} /> : <span className="hint">{t('sitemap.hint')}</span>}
    </div>
  );
}

/** The filter: screens not matching it are dimmed. */
function FilterMenu() {
  const t = useT();
  const filter = useStore((s) => s.sitemapFilter);
  const setFilter = useStore((s) => s.setSitemapFilter);
  const project = useStore((s) => s.project);
  const personas = projectPersonas(project);
  const options: { key: string; label: string }[] = [
    ...(['all', 'new', 'redo', 'existing', 'flow', 'map', 'none', 'extras'] as const).map((k) => ({ key: k, label: t(`sitemap.filter.${k}`) })),
    ...personas.map((p) => ({ key: `persona:${p.persona.id}`, label: t('sitemap.filter.persona', { name: p.persona.name || t('doc.unnamed') }) })),
  ];
  const current = options.find((o) => o.key === filter) ?? options[0];
  return (
    <ToolMenu
      label={t('sitemap.filter')}
      title={`${t('sitemap.filter')} : ${current.label}`}
      className={cls(filter !== 'all' && 'is-filtering')}
      face={
        <>
          <FilterIcon />
          <span className="tool-pill-text">{filter === 'all' ? t('sitemap.filter') : current.label}</span>
        </>
      }
    >
      {(close) => (
        <div className="menu-list" role="group" aria-label={t('sitemap.filter')}>
          {options.map((o) => (
            <button
              key={o.key}
              className={cls('menu-item', o.key === filter && 'is-on')}
              aria-pressed={o.key === filter}
              onClick={() => {
                setFilter(o.key);
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

/** The selected screen: its status, global or not, personas, links, modals and messages. */
function ScreenControls({ sitemap, screen, global }: { sitemap: Sitemap; screen: Screen; global: boolean }) {
  const t = useT();
  const applySitemap = useStore((s) => s.applySitemap);
  const select = useStore((s) => s.select);
  const id = screen.id;
  return (
    <div className="tool-group">
      <span className="tool-kind">{t('sitemap.kind')}</span>
      <ToolMenu
        label={t('sitemap.status')}
        title={`${t('sitemap.status')} : ${t(`sitemap.status.${screen.status}`)}`}
        face={
          <>
            <span className={cls('sitemap-status-dot', `is-${screen.status}`)} />
            <span className="tool-pill-text">{t(`sitemap.status.${screen.status}`)}</span>
          </>
        }
      >
        {(close) => (
          <div className="menu-list" role="group" aria-label={t('sitemap.status')}>
            {sm.SCREEN_STATUSES.map((st: ScreenStatus) => (
              <button
                key={st}
                className={cls('menu-item sitemap-status-item', st === screen.status && 'is-on')}
                aria-pressed={st === screen.status}
                onClick={() => {
                  applySitemap((m) => sm.setScreen(m, id, { status: st }));
                  close();
                }}
              >
                <span className={cls('sitemap-status-dot', `is-${st}`)} />
                {t(`sitemap.status.${st}`)}
              </button>
            ))}
          </div>
        )}
      </ToolMenu>
      <button
        className={cls('tool-icon', global && 'is-on')}
        aria-pressed={global}
        aria-label={t('sitemap.global')}
        title={`${t('sitemap.global')} · ${t('sitemap.globalHint')}`}
        onClick={() => applySitemap((m) => sm.setGlobal(m, id, !global))}
      >
        <GlobeIcon />
      </button>
      <PersonasMenu sitemap={sitemap} screen={screen} />
      <LinksMenu screen={screen} />
      <ExtrasMenu screen={screen} />
      <IconButton
        label={t('sitemap.remove')}
        onClick={() => {
          applySitemap((m) => sm.removeScreen(m, id));
          select(null);
        }}
      >
        <TrashIcon />
      </IconButton>
    </div>
  );
}

function PersonasMenu({ sitemap, screen }: { sitemap: Sitemap; screen: Screen }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const applySitemap = useStore((s) => s.applySitemap);
  const personas = projectPersonas(project);
  if (personas.length === 0) return null;
  const { ids, from } = sm.screenPersonas(sitemap, screen.id);
  const shown = ids.flatMap((pid) => personas.filter((p) => p.persona.id === pid));
  return (
    <ToolMenu
      label={t('sitemap.personas')}
      title={from ? t('sitemap.inheritedHint', { name: from.name || t('sitemap.untitled') }) : t('sitemap.personas')}
      face={
        <>
          <span className={cls('avatar-stack', from && 'is-inherited')}>
            {shown.slice(0, 3).map(({ persona, style, photo }) => (
              <span key={persona.id} className="persona-chip-dot" style={{ background: personaAccent(persona.color, style).accent }}>
                {photo ? <img src={photo} alt="" /> : (persona.name || t('doc.unnamed')).charAt(0).toUpperCase()}
              </span>
            ))}
            {shown.length > 3 && <span className="avatar-more">+{shown.length - 3}</span>}
          </span>
          <span className="tool-pill-text">{t('sitemap.personas')}</span>
        </>
      }
    >
      {() => (
        <div className="flow-persona-picks" role="group" aria-label={t('sitemap.personas')}>
          <div className="persona-chips persona-chips-list">
            {personas.map(({ persona, style, photo }) => {
              const on = ids.includes(persona.id);
              const name = persona.name || t('doc.unnamed');
              return (
                <button
                  key={persona.id}
                  className={cls('persona-chip', on && 'is-on', on && from && 'is-inherited')}
                  aria-pressed={on}
                  title={on ? t('flow.removePersona', { name }) : t('flow.addPersona', { name })}
                  onClick={() => applySitemap((m) => sm.toggleScreenPersona(m, screen.id, persona.id))}
                >
                  <span className="persona-chip-dot" style={{ background: personaAccent(persona.color, style).accent }}>
                    {photo ? <img src={photo} alt="" /> : name.charAt(0).toUpperCase()}
                  </span>
                  {name}
                </button>
              );
            })}
          </div>
          {from && <span className="hint">{t('sitemap.inheritedHint', { name: from.name || t('sitemap.untitled') })}</span>}
          {screen.personaIds && (
            <button className="btn btn-sm" onClick={() => applySitemap((m) => sm.inheritScreenPersonas(m, screen.id))}>
              {t('sitemap.inheritBack')}
            </button>
          )}
        </div>
      )}
    </ToolMenu>
  );
}

/** What a screen can be linked to: the cards of the project's flows, the steps of its maps. */
function linkTargets(project: Project): { group: string; options: { value: string; label: string }[] }[] {
  return project.docs.flatMap((d) => {
    if (d.kind === 'flow') {
      const options = d.flow.nodes.filter((n) => n.text.trim()).map((n) => ({ value: `node|${d.id}|${n.id}`, label: n.text.trim() }));
      return options.length ? [{ group: docLabel(project, d.id), options }] : [];
    }
    if (d.kind === 'mission-map') {
      const options = d.map.steps.map((s, i) => ({ value: `step|${d.id}|${s.id}`, label: `${i + 1} · ${s.title.trim() || '…'}` }));
      return options.length ? [{ group: docLabel(project, d.id), options }] : [];
    }
    return [];
  });
}

const linkValue = (l: ScreenLink) => `${l.kind}|${l.docId}|${l.id}`;

function LinksMenu({ screen }: { screen: Screen }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const applySitemap = useStore((s) => s.applySitemap);
  const setDoc = useStore((s) => s.setDoc);
  const focusLater = useStore((s) => s.focusLater);
  const links = liveLinks(project, screen);
  const taken = new Set(links.map(linkValue));
  const groups = linkTargets(project)
    .map((g) => ({ ...g, options: g.options.filter((o) => !taken.has(o.value)) }))
    .filter((g) => g.options.length);
  const open = (l: ScreenLink) => {
    setDoc(l.docId);
    focusLater(`${l.kind}:${l.id}`);
  };
  return (
    <ToolMenu
      label={t('sitemap.links')}
      title={t('sitemap.linksHint')}
      face={
        <>
          <LinkIcon />
          <span className="tool-pill-text">{links.length}</span>
        </>
      }
    >
      {() => (
        <div className="sitemap-menu" role="group" aria-label={t('sitemap.links')}>
          <span className="muted-sm">{t('sitemap.linksHint')}</span>
          {links.length === 0 ? (
            <span className="hint">{t('sitemap.linkNone')}</span>
          ) : (
            <ul className="sitemap-link-list">
              {links.map((l) => {
                const r = resolveScreenLink(project, l)!;
                return (
                  <li key={linkValue(l)}>
                    <button className="sitemap-link-open" title={t('sitemap.linkOpen', { name: r.where })} onClick={() => open(l)}>
                      <span>{r.label}</span>
                      <span className="muted-sm">{r.where}</span>
                    </button>
                    <button className="icon-btn" aria-label={t('sitemap.linkRemove')} title={t('sitemap.linkRemove')} onClick={() => applySitemap((m) => sm.removeScreenLink(m, screen.id, l))}>
                      <CloseIcon size={11} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {groups.length > 0 ? (
            <select
              className="tool-select sitemap-link-add"
              aria-label={t('sitemap.linkAdd')}
              value=""
              onChange={(e) => {
                const [kind, docId, target] = e.target.value.split('|');
                if (!target) return;
                applySitemap((m) => sm.addScreenLink(m, screen.id, { kind: kind as ScreenLink['kind'], docId, id: target }));
              }}
            >
              <option value="">{t('sitemap.linkAdd')}</option>
              {groups.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          ) : (
            links.length === 0 && <span className="muted-sm">{t('sitemap.nothingToLink')}</span>
          )}
        </div>
      )}
    </ToolMenu>
  );
}

function ExtrasMenu({ screen }: { screen: Screen }) {
  const t = useT();
  const applySitemap = useStore((s) => s.applySitemap);
  const extras = screen.extras ?? [];
  const focusId = useRef<Id | null>(null);
  const add = (kind: (typeof sm.EXTRA_KINDS)[number]) => {
    applySitemap((m) => {
      const r = sm.addScreenExtra(m, screen.id, kind, t(`sitemap.extraNew.${kind}`));
      focusId.current = r.id;
      return r.sitemap;
    });
  };
  return (
    <ToolMenu
      label={t('sitemap.extras')}
      title={t('sitemap.extras')}
      face={
        extras.length ? (
          <>
            {sm.EXTRA_KINDS.filter((k) => extras.some((x) => x.kind === k)).map((k) => (
              <ExtraMark key={k} kind={k} />
            ))}
            <span className="tool-pill-text">{extras.length}</span>
          </>
        ) : (
          <>
            <ExtraMark kind="modal" />
            <span className="tool-pill-text">0</span>
          </>
        )
      }
    >
      {() => (
        <div className="sitemap-menu sitemap-extras-menu" role="group" aria-label={t('sitemap.extras')}>
          <span className="tool-kind">{t('sitemap.extras')}</span>
          {extras.length === 0 && <span className="hint">{t('sitemap.extrasNone')}</span>}
          {extras.map((x) => (
            <div key={x.id} className="sitemap-extra-edit">
              <ExtraMark kind={x.kind} />
              <input
                className="text-field"
                aria-label={t('sitemap.extraName')}
                value={x.name}
                ref={(el) => {
                  if (el && focusId.current === x.id) {
                    focusId.current = null;
                    el.focus();
                    el.select();
                  }
                }}
                onChange={(e) => {
                  const name = e.target.value;
                  applySitemap((m) => sm.setScreenExtra(m, screen.id, x.id, { name }), { coalesce: `extra-name:${x.id}` });
                }}
              />
              <select className="tool-select" aria-label={t('sitemap.extraKind')} value={x.kind} onChange={(e) => applySitemap((m) => sm.setScreenExtra(m, screen.id, x.id, { kind: e.target.value as typeof x.kind }))}>
                {sm.EXTRA_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`sitemap.extra.${k}`)}
                  </option>
                ))}
              </select>
              <button className="icon-btn" aria-label={t('sitemap.extraRemove', { name: x.name })} title={t('sitemap.extraRemove', { name: x.name })} onClick={() => applySitemap((m) => sm.removeScreenExtra(m, screen.id, x.id))}>
                <CloseIcon size={11} />
              </button>
            </div>
          ))}
          <div className="sitemap-extra-add">
            {sm.EXTRA_KINDS.map((k) => (
              <button key={k} className="btn btn-sm" aria-label={t('sitemap.extraAdd', { kind: t(`sitemap.extra.${k}`) })} onClick={() => add(k)}>
                <ExtraMark kind={k} /> {t(`sitemap.extra.${k}`)}
              </button>
            ))}
          </div>
        </div>
      )}
    </ToolMenu>
  );
}
