// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../store';
import { setProjectTitle } from '../model/project';
import { closeTab, save } from '../actions';
import { isDesktop } from '../lib/fileio';
import { ChevronDown, CloseIcon } from './Icons';
import { cls } from './cls';

/**
 * The open project, in the main bar: its name, edited in place, and a menu
 * listing every open project to switch to or close.
 */
export function ProjectSwitcher() {
  const t = useT();
  const stored = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  // The active project's title and dirty flag live at the top level of the store.
  const title = useStore((s) => s.project.title);
  const dirty = useStore((s) => s.dirty);
  const switchTab = useStore((s) => s.switchTab);
  const applyProject = useStore((s) => s.applyProject);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!activeId) return null;
  const projects = stored.map((tab) =>
    tab.id === activeId ? { id: tab.id, title, dirty } : { id: tab.id, title: tab.project.title, dirty: tab.dirty },
  );
  const name = title || t('app.untitled');
  return (
    <div className="project" ref={ref}>
      <input
        className="project-title"
        aria-label={t('top.projectName')}
        value={title}
        placeholder={t('app.untitled')}
        size={Math.max(8, Math.min(32, name.length + 1))}
        onChange={(e) => {
          const v = e.target.value;
          applyProject((p) => setProjectTitle(p, v), { coalesce: 'title' });
        }}
      />
      {dirty && <span className="tab-dirty" title={t('tabs.unsaved')} aria-label={t('tabs.unsaved')} />}
      <button className="icon-btn project-menu-btn" aria-label={t('tabs.label')} title={t('tabs.label')} aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronDown size={14} />
        {projects.length > 1 && <span className="count-pill">{projects.length}</span>}
      </button>
      {open && (
        <div className="popover-panel project-menu" role="menu" aria-label={t('tabs.label')}>
          <span className="eyebrow">{t('tabs.label')}</span>
          <ul className="project-list">
            {projects.map((p) => {
              const label = p.title || t('app.untitled');
              const active = p.id === activeId;
              return (
                <li key={p.id} className={cls('project-item', active && 'is-active')}>
                  <button
                    className="project-item-btn"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      switchTab(p.id);
                      setOpen(false);
                    }}
                  >
                    {label}
                    {p.dirty && <span className="tab-dirty" aria-label={t('tabs.unsaved')} />}
                  </button>
                  <button className="icon-btn" aria-label={t('tabs.close', { name: label })} title={t('tabs.close', { name: label })} onClick={() => closeTab(p.id)}>
                    <CloseIcon size={12} />
                  </button>
                </li>
              );
            })}
          </ul>
          {isDesktop && (
            <button
              className="text-btn project-menu-action"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                save(true);
              }}
            >
              {t('top.saveAs')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
