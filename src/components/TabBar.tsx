// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

import { useStore, useT } from '../store';
import { setProjectTitle } from '../model/project';
import { closeTab } from '../actions';
import { CloseIcon } from './Icons';
import { cls } from './cls';

/** One tab per open project. */
export function TabBar() {
  const t = useT();
  const stored = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  // The active tab's title and dirty flag live at the top level of the store.
  const activeTitle = useStore((s) => s.project.title);
  const activeDirty = useStore((s) => s.dirty);
  const tabs = stored.map((tab) =>
    tab.id === activeId
      ? { id: tab.id, title: activeTitle, dirty: activeDirty }
      : { id: tab.id, title: tab.project.title, dirty: tab.dirty },
  );
  const switchTab = useStore((s) => s.switchTab);
  const applyProject = useStore((s) => s.applyProject);

  if (tabs.length === 0) return null;
  return (
    <div className="tabbar" role="tablist" aria-label={t('tabs.label')}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const name = tab.title || t('app.untitled');
        return (
          <div key={tab.id} className={cls('tab', active && 'is-active')}>
            {active ? (
              <input
                className="tab-title"
                role="tab"
                aria-selected="true"
                aria-label={t('top.projectName')}
                value={tab.title}
                placeholder={t('app.untitled')}
                size={Math.max(8, Math.min(40, name.length + 1))}
                onChange={(e) => {
                  const v = e.target.value;
                  applyProject((p) => setProjectTitle(p, v), { coalesce: 'title' });
                }}
              />
            ) : (
              <button className="tab-title" role="tab" aria-selected="false" onClick={() => switchTab(tab.id)}>
                {name}
              </button>
            )}
            {tab.dirty && <span className="tab-dirty" title={t('tabs.unsaved')} aria-label={t('tabs.unsaved')} />}
            <button className="icon-btn tab-close" aria-label={t('tabs.close', { name })} onClick={() => closeTab(tab.id)}>
              <CloseIcon size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
